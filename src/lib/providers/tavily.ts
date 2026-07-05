import { tavily, type TavilyClient } from "@tavily/core";

let tavilyClient: TavilyClient | null = null;

export function getTavilyClient() {
  if (!tavilyClient) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY environment variable is required");
    }
    tavilyClient = tavily({ apiKey });
  }
  return tavilyClient;
}

export interface TavilySearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export async function searchWeb(
  query: string,
  maxResults: number = 5
): Promise<TavilySearchResult[]> {
  const client = getTavilyClient();
  const response = await client.search(query, {
    maxResults,
    searchDepth: "basic",
    includeAnswer: false,
  });
  return response.results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    score: r.score ?? 0,
  }));
}
