"use client";

export type LogLevel = "info" | "warn" | "error";
export type LogStage = "capture" | "encode" | "transcribe" | "search" | "verify" | "system" | "fact-check";

export interface DebugEntry {
  ts: number;
  level: LogLevel;
  stage: LogStage;
  msg: string;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 200;
const entries: DebugEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function pushLog(
  level: LogLevel,
  stage: LogStage,
  msg: string,
  meta?: Record<string, unknown>
) {
  entries.push({ ts: Date.now(), level, stage, msg, meta });
  if (entries.length > MAX_ENTRIES) entries.shift();
  notify();
  const prefix = `[${stage}] ${msg}`;
  if (level === "error") console.error(prefix, meta);
  else if (level === "warn") console.warn(prefix, meta);
  else console.log(prefix, meta);
}

export function getLogs(): DebugEntry[] {
  return [...entries];
}

export function clearLogs() {
  entries.length = 0;
  notify();
}

export function exportLogsJson(): string {
  return JSON.stringify(entries, null, 2);
}

export function subscribeLogs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
