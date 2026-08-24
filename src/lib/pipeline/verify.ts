import { generateText } from "ai";
import { getGroqModel } from "@/lib/providers/groq";
import { getNIMModel } from "@/lib/providers/nim";
import { searchWeb } from "@/lib/providers/serper";
import { segmentSentences, segmentLines } from "./segment";
import { rankSources, filterReliableSources, selectTopSources } from "./sources";
import { canMakeRequest } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import type { FactCheckResult, FactCheckStatus } from "@/types";

function buildSearchQuery(sentence: string): string {
  const words = sentence.split(/\s+/).slice(0, 10);
  return words.join(" ");
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

function buildSearchQueryPrompt(sentence: string): string {
  return `Generate a concise search query to fact-check this claim. Return ONLY the search query text, nothing else.

Claim: "${sentence}"`;
}

async function callModelWithRetry(
  model: ReturnType<typeof getGroqModel> | ReturnType<typeof getNIMModel>,
  prompt: string,
  maxOutputTokens: number,
  maxRetries: number = 2
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { text } = await generateText({
        model,
        prompt,
        temperature: 0.1,
        maxOutputTokens,
      });
      return text;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      logger.warn(`Model call attempt ${attempt + 1} failed`, {
        error: lastError.message,
      });
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

async function verifySentence(
  sentence: string,
  provider: "groq" | "nim"
): Promise<FactCheckResult> {
  const id = `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!canMakeRequest("serper")) {
    logger.warn("Rate limit hit for Serper search");
    return {
      id,
      text: sentence,
      status: "unverifiable",
      correction: "Rate limit reached for source search. Try again shortly.",
      sources: [],
      timestamp: Date.now(),
    };
  }

  try {
    const model = provider === "groq" ? getGroqModel() : getNIMModel();
    const searchQuery = buildSearchQuery(sentence);

    let rawSources: Array<{ title: string; url: string; snippet: string; score?: number }>;
    try {
      rawSources = await searchWeb(searchQuery, 5);
    } catch (e) {
      logger.error("Serper search failed", {
        query: searchQuery,
        error: String(e),
      });
      return {
        id,
        text: sentence,
        status: "unverifiable",
        correction: `Search error: ${e instanceof Error ? e.message : "Unknown error"}. Check SERPER_API_KEY.`,
        sources: [],
        timestamp: Date.now(),
      };
    }

    if (rawSources.length === 0) {
      return {
        id,
        text: sentence,
        status: "unverifiable",
        correction: "No sources found to verify this claim.",
        sources: [],
        timestamp: Date.now(),
      };
    }

    const rankedSources = rankSources(rawSources);
    const reliableSources = filterReliableSources(rankedSources);
    const topSources = selectTopSources(reliableSources, 3);

    if (topSources.length === 0) {
      return {
        id,
        text: sentence,
        status: "unverifiable",
        correction: "Only low-credibility sources found.",
        sources: [],
        timestamp: Date.now(),
      };
    }

    if (!canMakeRequest(provider)) {
      logger.warn(`Rate limit hit for ${provider}`);
      return {
        id,
        text: sentence,
        status: "unverifiable",
        correction: "Rate limit reached for verification. Try again shortly.",
        sources: topSources,
        timestamp: Date.now(),
      };
    }

    const verifyPrompt = buildVerificationPrompt(sentence, topSources);
    let verifyResponse: string;
    try {
      verifyResponse = await callModelWithRetry(model, verifyPrompt, 300);
    } catch (e) {
      logger.error("Model call failed for verification", {
        sentence,
        provider,
        error: String(e),
      });
      return {
        id,
        text: sentence,
        status: "unverifiable",
        correction: `AI model error during verification: ${e instanceof Error ? e.message : "Unknown"}. Check API key.`,
        sources: topSources,
        timestamp: Date.now(),
      };
    }

    let parsed: { status: string; correction: string; sourceIndices: number[] };
    try {
      const jsonMatch = verifyResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      const raw = JSON.parse(jsonMatch[0]);
      
      if (raw.results && Array.isArray(raw.results) && raw.results.length > 0) {
        parsed = raw.results[0];
      } else {
        parsed = raw;
      }
    } catch (e) {
      logger.error("Failed to parse verification response", {
        response: verifyResponse.substring(0, 200),
        error: String(e),
      });
      return {
        id,
        text: sentence,
        status: "unverifiable",
        correction: "Could not parse AI response.",
        sources: topSources,
        timestamp: Date.now(),
      };
    }

    const resultSources = (parsed.sourceIndices || [])
      .filter((i: number) => i < topSources.length)
      .map((i: number) => topSources[i]);

    const status = ["correct", "misleading", "incorrect", "unverifiable"].includes(parsed.status)
      ? (parsed.status as FactCheckStatus)
      : "unverifiable";

    return {
      id,
      text: sentence,
      status,
      correction: parsed.correction || "",
      sources: resultSources,
      timestamp: Date.now(),
    };
  } catch (e) {
    logger.error("Unexpected verification error", {
      sentence,
      error: String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    return {
      id,
      text: sentence,
      status: "unverifiable",
      correction: `Error: ${e instanceof Error ? e.message : "Unknown error"}`,
      sources: [],
      timestamp: Date.now(),
    };
  }
}

export async function checkLiveSentences(text: string): Promise<FactCheckResult[]> {
  const sentences = segmentSentences(text);
  const results = await Promise.all(sentences.map((s) => verifySentence(s, "groq")));
  return results;
}

export async function checkPrepLines(text: string): Promise<FactCheckResult[]> {
  const sentences = segmentSentences(text);
  const results = await Promise.all(sentences.map((s) => verifySentence(s, "groq")));
  return results;
}
