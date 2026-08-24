import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getGroqModel } from "@/lib/providers/groq";
import { getNIMModel } from "@/lib/providers/nim";
import { searchWeb } from "@/lib/providers/serper";
import { logger } from "@/lib/logger";

interface TestResult {
  provider: string;
  status: "ok" | "error";
  message: string;
  latencyMs?: number;
}

async function testGroq(): Promise<TestResult> {
  const start = Date.now();
  try {
    const model = getGroqModel();
    const { text } = await generateText({
      model,
      prompt: "Say 'hello' only",
      maxOutputTokens: 10,
    });
    return {
      provider: "Groq",
      status: "ok",
      message: `Working: "${text.trim().substring(0, 50)}"`,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      provider: "Groq",
      status: "error",
      message: e instanceof Error ? e.message : "Unknown error",
      latencyMs: Date.now() - start,
    };
  }
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

export async function GET() {
  logger.info("Testing API keys");

  const [groq, nim, serper] = await Promise.all([
    testGroq(),
    testNIM(),
    testSerper(),
  ]);

  return NextResponse.json({
    groq,
    nim,
    serper,
    allOk: groq.status === "ok" && nim.status === "ok" && serper.status === "ok",
  });
}

export const runtime = "nodejs";
