import { callGroq } from "@/lib/providers/groq";
import { searchWeb } from "@/lib/providers/serper";
import { segmentSentences } from "./segment";
import { rankSources, filterReliableSources, selectTopSources } from "./sources";
import { canMakeRequest } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import type { FactCheckResult, FactCheckStatus } from "@/types";

function buildSearchQuery(sentence: string): string {
  return sentence.split(/\s+/).slice(0, 10).join(" ");
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

Respond with ONLY valid JSON (no markdown, no code fences):
{"status":"correct","correction":"","sourceIndices":[]}

Status must be one of: correct, misleading, incorrect, unverifiable
- correct: sources confirm the claim is accurate
- misleading: claim is technically true but missing important context
- incorrect: sources contradict the claim
- unverifiable: insufficient evidence to determine

Rules:
- Be brief and factual
- Only use provided sources
- Return ONLY the JSON object, nothing else`;
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
  const id = `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
      const jsonMatch = verifyResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      const raw = JSON.parse(jsonMatch[0]);
      parsed = raw.results && Array.isArray(raw.results) && raw.results.length > 0 ? raw.results[0] : raw;
    } catch (e) {
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

    return {
      id, text: sentence, status,
      correction: parsed.correction || "",
      sources: resultSources, timestamp: Date.now(),
    };
  } catch (e) {
    return {
      id, text: sentence, status: "unverifiable",
      correction: `Error: ${e instanceof Error ? e.message : "Unknown error"}`,
      sources: [], timestamp: Date.now(),
    };
  }
}

export async function checkLiveSentences(text: string): Promise<FactCheckResult[]> {
  const sentences = segmentSentences(text);
  const results: FactCheckResult[] = [];
  for (const s of sentences) {
    results.push(await verifySentence(s));
  }
  return results;
}

export async function checkPrepLines(text: string): Promise<FactCheckResult[]> {
  const sentences = segmentSentences(text);
  const results: FactCheckResult[] = [];
  for (const s of sentences) {
    results.push(await verifySentence(s));
  }
  return results;
}
