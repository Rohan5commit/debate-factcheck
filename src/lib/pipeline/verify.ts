import { generateText } from "ai";
import { getCerebrasModel } from "@/lib/providers/cerebras";
import { getNIMModel } from "@/lib/providers/nim";
import { searchWeb } from "@/lib/providers/tavily";
import { segmentSentences, segmentLines } from "./segment";
import {
  rankSources,
  filterReliableSources,
  selectTopSources,
} from "./sources";

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

Respond with JSON:
{
  "status": "correct" | "misleading" | "incorrect" | "unverifiable",
  "correction": "Brief correction if needed, empty if correct",
  "sourceIndices": [indices of sources that support your verdict]
}

Rules:
- Be brief and factual
- Only use provided sources
- If sources conflict or are insufficient, use "unverifiable"
- Prefer official and authoritative sources`;
}

function buildSearchQueryPrompt(sentence: string): string {
  return `Generate a concise search query to fact-check this claim. Return ONLY the search query text, nothing else.

Claim: "${sentence}"`;
}

async function verifySentence(
  sentence: string,
  provider: "cerebras" | "nim"
): Promise<FactCheckResult> {
  const id = `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!canMakeRequest("tavily")) {
    logger.warn("Rate limit hit for Tavily search");
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
    const queryPrompt = buildSearchQueryPrompt(sentence);
    const model = provider === "cerebras" ? getCerebrasModel() : getNIMModel();

    const { text: searchQueryText } = await generateText({
      model,
      prompt: queryPrompt,
      temperature: 0.1,
      maxOutputTokens: 50,
    });

    const searchQuery = searchQueryText.trim() || buildSearchQuery(sentence);
    const rawSources = await searchWeb(searchQuery, 5);

    if (rawSources.length === 0) {
      return {
        id,
        text: sentence,
        status: "unverifiable",
        correction: "No reliable sources found to verify this claim.",
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
    const { text: verifyResponse } = await generateText({
      model,
      prompt: verifyPrompt,
      temperature: 0.1,
      maxOutputTokens: 300,
    });

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
        response: verifyResponse,
        error: String(e),
      });
      return {
        id,
        text: sentence,
        status: "unverifiable",
        correction: "Could not parse verification result.",
        sources: topSources,
        timestamp: Date.now(),
      };
    }

    const resultSources = (parsed.sourceIndices || [])
      .filter((i: number) => i < topSources.length)
      .map((i: number) => topSources[i]);

    const status = ["correct", "misleading", "incorrect", "unverifiable"].includes(parsed.status)
      ? parsed.status as FactCheckStatus
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
    logger.error("Verification failed", {
      sentence,
      error: String(e),
    });
    return {
      id,
      text: sentence,
      status: "unverifiable",
      correction: "Verification failed due to an error.",
      sources: [],
      timestamp: Date.now(),
    };
  }
}

export async function checkLiveSentences(
  text: string
): Promise<FactCheckResult[]> {
  const sentences = segmentSentences(text);
  const results = await Promise.all(
    sentences.map((s) => verifySentence(s, "cerebras"))
  );
  return results;
}

export async function checkPrepLines(
  text: string
): Promise<FactCheckResult[]> {
  const lines = segmentLines(text);
  const results: FactCheckResult[] = [];

  for (const line of lines) {
    const result = await verifySentence(line, "nim");
    results.push(result);
  }

  return results;
}
