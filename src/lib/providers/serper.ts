const SERPER_API_URL = "https://google.serper.dev/search";

export interface SerperSearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
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
    throw new Error(`Serper API error: ${response.statusText}`);
  }

  const data: SerperResponse = await response.json();

  return (data.organic || []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || "",
    position: r.position,
  }));
}
