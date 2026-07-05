export type FactCheckStatus = "correct" | "misleading" | "incorrect" | "unverifiable";

export interface Source {
  title: string;
  url: string;
  snippet: string;
  credibility: "high" | "medium" | "low";
}

export interface FactCheckResult {
  id: string;
  text: string;
  status: FactCheckStatus;
  correction: string;
  sources: Source[];
  timestamp: number;
}

export interface CheckRequest {
  text: string;
  mode: "live" | "prep";
}

export interface CheckResponse {
  results: FactCheckResult[];
}

export interface SearchQuery {
  query: string;
  maxResults?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export interface UploadResponse {
  text: string;
  filename: string;
  pageCount?: number;
}
