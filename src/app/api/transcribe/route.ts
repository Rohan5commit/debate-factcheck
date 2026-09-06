import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    if (audioFile.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file too large (max 2MB for free tier)" }, { status: 413 });
    }

    logger.info("Transcription request via Groq", { size: audioFile.size, type: audioFile.type });

    const whisperFormData = new FormData();
    whisperFormData.append("file", audioFile, audioFile.name || "audio.wav");
    whisperFormData.append("model", "whisper-large-v3");
    whisperFormData.append("language", "en");
    whisperFormData.append("response_format", "verbose_json");
    whisperFormData.append("temperature", "0");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);
    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperFormData,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("Groq Whisper API error", { status: response.status, body: errorBody.substring(0, 500) });
      return NextResponse.json({ error: `Groq API error: ${response.status}` }, { status: response.status });
    }

    const result = await response.json();
    logger.info("Groq transcription success", { language: result.language, duration: result.duration, textLen: result.text?.length || 0 });

    return NextResponse.json({
      text: result.text || "",
      language: result.language || "en",
      duration: result.duration || 0,
    });
  } catch (e) {
    logger.error("Transcription failed", { error: String(e) });
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}

export const runtime = "nodejs";
