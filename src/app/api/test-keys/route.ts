import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getCerebrasModel } from "@/lib/providers/cerebras";
import { getNIMModel } from "@/lib/providers/nim";
import { searchWeb } from "@/lib/providers/serper";
import { logger } from "@/lib/logger";

interface TestResult {
  provider: string;
  status: "ok" | "error";
  message: string;
  latencyMs?: number;
}

async function testCerebras(): Promise<TestResult> {
  const start = Date.now();
  try {
    const model = getCerebrasModel();
    const { text } = await generateText({
      model,
      prompt: "Say 'hello' only",
      maxOutputTokens: 10,
    });
    return {
      provider: "Cerebras",
      status: "ok",
      message: `Working: "${text.trim().substring(0, 50)}"`,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      provider: "Cerebras",
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

  const [cerebras, nim, serper] = await Promise.all([
    testCerebras(),
    testNIM(),
    testSerper(),
  ]);

  return NextResponse.json({
    cerebras,
    nim,
    serper,
    allOk: cerebras.status === "ok" && nim.status === "ok" && serper.status === "ok",
  });
}

export const runtime = "nodejs";
