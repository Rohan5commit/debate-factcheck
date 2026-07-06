import { NextRequest, NextResponse } from "next/server";
import { searchWeb } from "@/lib/providers/serper";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, maxResults = 5 } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    logger.info("Search request", { query });

    const results = await searchWeb(query, maxResults);

    return NextResponse.json({ results });
  } catch (e) {
    logger.error("Search failed", { error: String(e) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
