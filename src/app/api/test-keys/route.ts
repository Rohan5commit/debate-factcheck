import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

interface TestResult {
  provider: string;
  status: "ok" | "error";
  message: string;
}

function checkKey(name: string, value: string | undefined): TestResult {
  if (value && value.length > 10) {
    return { provider: name, status: "ok", message: "Key configured" };
  }
  return { provider: name, status: "error", message: "Key missing or invalid" };
}

export async function GET() {
  logger.info("Testing API keys");

  const groq = checkKey("Groq (Whisper)", process.env.GROQ_API_KEY);
  const nim = checkKey("NVIDIA NIM", process.env.NVIDIA_NIM_API_KEY);
  const serper = checkKey("Serper", process.env.SERPER_API_KEY);

  return NextResponse.json({
    groq,
    nim,
    serper,
    allOk: groq.status === "ok" && nim.status === "ok" && serper.status === "ok",
  });
}

export const runtime = "nodejs";
