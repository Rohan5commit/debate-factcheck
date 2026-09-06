import { callGroq } from "@/lib/providers/groq";
import { searchWeb } from "@/lib/providers/serper";
import { segmentSentences } from "./segment";
import { rankSources, filterReliableSources, selectTopSources } from "./sources";
import { canMakeRequest } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import type { FactCheckResult, FactCheckStatus } from "@/types";

const FILLER_REGEX = /^(hi|hello|hey|thank you|thanks|um|uh|oh|yeah|okay|yes|no|please)(\s|[.!?]|$)/i;

function isFactual(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (trimmed.length < 15) return false;
  if (trimmed.split(/\s+/).length < 5) return false;
  if (FILLER_REGEX.test(trimmed)) return false;
  return true;
}

const STOPWORDS = new Set(
  "a,an,the,and,or,but,if,then,else,when,while,of,at,by,for,with,about,as,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,once,here,there,when,where,why,how,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,can,will,just,don,should,now,you,guys,like,know,um,uh,yeah,okay,well,actually,really,very,just,so".split(",")
);

const claimCache = new Map<string, FactCheckResult>();

function buildSearchQuery(sentence: string): string {
  const keywords = sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const unique = [...new Set(keywords)];
  return unique.slice(0, 8).join(" ") || sentence.split(/\s+/).slice(0, 10).join(" ");
}

function buildVerificationPrompt(
  sentence: string,
  sources: Array<{ title: string; url: string; snippet: string }>
): string {
  const sourceText = sources
    .map((s, i) => `[${i}] ${s.title}: ${s.snippet}`)
    .join("\n\n");

  return `You are a fact-checker. Verify this claim using the provided sources.

CLAIM: "${sentence}"

SOURCES:
${sourceText}

Respond with JSON only. No markdown, no explanation outside JSON.
Required format: {"status":"correct","correction":"","sourceIndices":[]}

Status must be one of: correct, misleading, incorrect, unverifiable
- correct: sources confirm the claim is accurate
- misleading: claim is technically true but missing important context
- incorrect: sources contradict the claim
- unverifiable: insufficient evidence to determine

Rules:
- Be brief and factual
- Only use provided sources
- Return ONLY the JSON object`;
}

async function callWithRetry(
  fn: () => Promise<string>,
  maxRetries: number = 2
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      logger.warn(`Call attempt ${attempt + 1} failed`, { error: lastError.message });
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function verifySentence(sentence: string): Promise<FactCheckResult> {
  const cacheKey = sentence.trim().toLowerCase();
  const cached = claimCache.get(cacheKey);
  if (cached) {
    return { ...cached, id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: sentence };
  }
  const id = `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!isFactual(sentence)) {
    return {
      id, text: sentence, status: "unverifiable",
      correction: "Not a factual claim — skipped.",
      sources: [], timestamp: Date.now(),
    };
  }

  if (!canMakeRequest("serper")) {
    return {
      id, text: sentence, status: "unverifiable",
      correction: "Rate limit reached for source search. Try again shortly.",
      sources: [], timestamp: Date.now(),
    };
  }

  try {
    const searchQuery = buildSearchQuery(sentence);
    let rawSources: Array<{ title: string; url: string; snippet: string; score?: number }>;
    try {
      rawSources = await searchWeb(searchQuery, 5);
    } catch (e) {
      return {
        id, text: sentence, status: "unverifiable",
        correction: `Search error: ${e instanceof Error ? e.message : "Unknown"}. Check SERPER_API_KEY.`,
        sources: [], timestamp: Date.now(),
      };
    }

    if (rawSources.length === 0) {
      return {
        id, text: sentence, status: "unverifiable",
        correction: "No sources found to verify this claim.",
        sources: [], timestamp: Date.now(),
      };
    }

    const rankedSources = rankSources(rawSources);
    const reliableSources = filterReliableSources(rankedSources);
    const topSources = selectTopSources(reliableSources, 3);

    if (topSources.length === 0) {
      return {
        id, text: sentence, status: "unverifiable",
        correction: "Only low-credibility sources found.",
        sources: [], timestamp: Date.now(),
      };
    }

    const verifyPrompt = buildVerificationPrompt(sentence, topSources);
    let verifyResponse: string;
    try {
      verifyResponse = await callWithRetry(() => callGroq(verifyPrompt, 300));
    } catch (e) {
      return {
        id, text: sentence, status: "unverifiable",
        correction: `AI model error: ${e instanceof Error ? e.message : "Unknown"}. Check API key.`,
        sources: topSources, timestamp: Date.now(),
      };
    }

    let parsed: { status: string; correction: string; sourceIndices: number[] };
    try {
      const cleaned = verifyResponse.replace(/```json|```/g, "").trim();
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(cleaned);
      } catch {
        const jsonMatch = cleaned.match(/\{[^{}]*"status"[^{}]*\}/);
        if (!jsonMatch) {
          const greedy = cleaned.match(/\{[\s\S]*\}/);
          if (!greedy) throw new Error("No JSON found in response");
          raw = JSON.parse(greedy[0]);
        } else {
          raw = JSON.parse(jsonMatch[0]);
        }
      }
      parsed = raw.results && Array.isArray(raw.results) && raw.results.length > 0 ? raw.results[0] : raw;
      if (!parsed.status) throw new Error("Missing status in JSON");
    } catch (e) {
      logger.warn("Failed to parse Groq response", { response: verifyResponse.slice(0, 500), error: String(e) });
      return {
        id, text: sentence, status: "unverifiable",
        correction: "Could not parse AI response.",
        sources: topSources, timestamp: Date.now(),
      };
    }

    const resultSources = (parsed.sourceIndices || [])
      .filter((i: number) => i < topSources.length)
      .map((i: number) => topSources[i]);

    const status = ["correct", "misleading", "incorrect", "unverifiable"].includes(parsed.status)
      ? (parsed.status as FactCheckStatus)
      : "unverifiable";

    const finalResult = {
      id, text: sentence, status,
      correction: parsed.correction || "",
      sources: resultSources, timestamp: Date.now(),
    };
    if (claimCache.size > 200) {
      const firstKey = claimCache.keys().next().value;
      if (firstKey) claimCache.delete(firstKey);
    }
    claimCache.set(cacheKey, finalResult);
    return finalResult;
  } catch (e) {
    return {
      id, text: sentence, status: "unverifiable",
      correction: `Error: ${e instanceof Error ? e.message : "Unknown error"}`,
      sources: [], timestamp: Date.now(),
    };
  }
}

async function verifySentenceWithRetry(sentence: string): Promise<FactCheckResult> {
  const withTimeout = (p: Promise<FactCheckResult>, ms: number): Promise<FactCheckResult> =>
    Promise.race([
      p,
      new Promise<FactCheckResult>((_, reject) =>
        setTimeout(() => reject(new Error("verify timeout 15s")), ms)
      ),
    ]);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await withTimeout(verifySentence(sentence), 15000);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      logger.warn(`Verify attempt ${attempt + 1} failed for: ${sentence.slice(0, 50)}`, {
        error: lastError.message,
      });
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  return {
    id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: sentence,
    status: "unverifiable",
    correction: `Error: ${lastError?.message || "Unknown error"}`,
    sources: [],
    timestamp: Date.now(),
  };
}

const PARALLEL_LIMIT = 3;

async function verifyBatch(sentences: string[]): Promise<FactCheckResult[]> {
  const results: FactCheckResult[] = [];
  for (let i = 0; i < sentences.length; i += PARALLEL_LIMIT) {
    const batch = sentences.slice(i, i + PARALLEL_LIMIT);
    const batchResults = await Promise.all(batch.map(verifySentenceWithRetry));
    results.push(...batchResults);
  }
  return results;
}

export async function checkLiveSentences(text: string): Promise<FactCheckResult[]> {
  const sentences = segmentSentences(text);
  if (sentences.length === 0) return [];
  return verifyBatch(sentences);
}

export async function checkPrepLines(text: string): Promise<FactCheckResult[]> {
  const sentences = segmentSentences(text);
  if (sentences.length === 0) return [];
  return verifyBatch(sentences);
}
