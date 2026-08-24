import { NextResponse } from "next/server";
import { getNIMModel } from "@/lib/providers/nim";
import { generateText } from "ai";
import { searchWeb } from "@/lib/providers/serper";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

interface TestResult {
  provider: string;
  status: "ok" | "error";
  message: string;
  latencyMs?: number;
}

async function testNIM(): Promise<TestResult> {
  const start = Date.now();
  try {
    const model = getNIMModel();
    const { text } = await generateText({
      model,
      prompt: "Say 'hello' only",
      maxOutputTokens: 10,
    });
    return {
      provider: "NVIDIA NIM",
      status: "ok",
      message: `Working: "${text.trim().substring(0, 50)}"`,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      provider: "NVIDIA NIM",
      status: "error",
      message: e instanceof Error ? e.message : "Unknown error",
      latencyMs: Date.now() - start,
    };
  }
}

async function testSerper(): Promise<TestResult> {
  const start = Date.now();
  try {
    const results = await searchWeb("test query", 1);
    return {
      provider: "Serper",
      status: "ok",
      message: `Working: ${results.length} result(s)`,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      provider: "Serper",
      status: "error",
      message: e instanceof Error ? e.message : "Unknown error",
      latencyMs: Date.now() - start,
    };
  }
}

async function testGroqWhisper(): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/models", {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}` },
    });
    return {
      provider: "Groq (Whisper)",
      status: res.ok ? "ok" : "error",
      message: res.ok ? "Working" : `Error ${res.status}`,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      provider: "Groq (Whisper)",
      status: "error",
      message: e instanceof Error ? e.message : "Unknown error",
      latencyMs: Date.now() - start,
    };
  }
}

export async function GET() {
  logger.info("Testing API keys");

  const [nim, serper, groqWhisper] = await Promise.all([
    testNIM(),
    testSerper(),
    testGroqWhisper(),
  ]);

  return NextResponse.json({
    groq: groqWhisper,
    nim,
    serper,
    allOk: nim.status === "ok" && serper.status === "ok" && groqWhisper.status === "ok",
  });
}

export const runtime = "nodejs";
