const SERPER_API_URL = "https://google.serper.dev/search";

export interface SerperSearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
  score: number;
}

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SerperResponse {
  searchParameters: {
    q: string;
    type: string;
  };
  organic: SerperOrganicResult[];
}

export async function searchWeb(
  query: string,
  maxResults: number = 5
): Promise<SerperSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error("SERPER_API_KEY environment variable is required");
  }

  const response = await fetch(SERPER_API_URL, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: maxResults,
      hl: "en",
      gl: "us",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Serper API ${response.status}: ${body.substring(0, 200)}`);
  }

  const data: SerperResponse = await response.json();

  return (data.organic || []).slice(0, maxResults).map((r, i) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || "",
    position: r.position || i + 1,
    score: 1 - (r.position || i + 1) * 0.1,
  }));
}
