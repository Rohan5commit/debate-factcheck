import { NextRequest, NextResponse } from "next/server";
import { checkLiveSentences } from "@/lib/pipeline/verify";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    logger.info("Live check request", { textLength: text.length });

    const results = await checkLiveSentences(text);

    return NextResponse.json({ results });
  } catch (e) {
    logger.error("Live check failed", { error: String(e) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
