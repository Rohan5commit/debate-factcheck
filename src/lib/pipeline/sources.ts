import type { Source } from "@/types";

const HIGH_CREDIBILITY_DOMAINS = [
  ".gov",
  ".edu",
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "nytimes.com",
  "washingtonpost.com",
  "wsj.com",
  "nature.com",
  "science.org",
  "pubmed.ncbi.nlm.nih.gov",
  "scholar.google.com",
  "who.int",
  "cdc.gov",
  "nih.gov",
  "nasa.gov",
  "un.org",
  "worldbank.org",
  "imf.org",
  "statista.com",
  "britannica.com",
  "merriam-webster.com",
  "oxfordreference.com",
];

const LOW_CREDIBILITY_PATTERNS = [
  "blogspot.com",
  "wordpress.com",
  "medium.com",
  "reddit.com",
  "quora.com",
  "yahoo.com",
  "answers.com",
  "wikihow.com",
  "thoughtco.com",
  "livescience.com",
  "sciencealert.com",
  "iflscience.com",
];

function getCredibility(url: string): "high" | "medium" | "low" {
  const lower = url.toLowerCase();

  if (LOW_CREDIBILITY_PATTERNS.some((p) => lower.includes(p))) {
    return "low";
  }

  if (
    HIGH_CREDIBILITY_DOMAINS.some(
      (d) => lower.includes(d) || lower.endsWith(d)
    )
  ) {
    return "high";
  }

  return "medium";
}

export function rankSources(
  sources: Array<{ title: string; url: string; snippet: string; score?: number }>
): Source[] {
  return sources
    .map((s) => ({
      title: s.title,
      url: s.url,
      snippet: s.snippet,
      credibility: getCredibility(s.url),
    }))
    .sort((a, b) => {
      const credOrder = { high: 0, medium: 1, low: 2 };
      if (credOrder[a.credibility] !== credOrder[b.credibility]) {
        return credOrder[a.credibility] - credOrder[b.credibility];
      }
      return 0;
    });
}

export function filterReliableSources(sources: Source[]): Source[] {
  return sources.filter((s) => s.credibility !== "low");
}

export function selectTopSources(sources: Source[], count: number = 3): Source[] {
  return sources.slice(0, count);
}
