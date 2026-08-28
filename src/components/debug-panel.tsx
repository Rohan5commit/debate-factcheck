"use client";

import { useState } from "react";
import { useDebugLog } from "@/hooks/use-debug-log";
import type { LogStage } from "@/lib/debug-log";

const STAGES: (LogStage | "all")[] = [
  "all",
  "capture",
  "encode",
  "transcribe",
  "search",
  "verify",
  "fact-check",
  "system",
];

export function DebugPanel() {
  const { logs, clear, exportJson } = useDebugLog();
  const [filter, setFilter] = useState<LogStage | "all">("all");
  const [open, setOpen] = useState(false);

  const filtered = filter === "all" ? logs : logs.filter((l) => l.stage === filter);

  const handleCopy = async () => {
    const json = exportJson();
    await navigator.clipboard.writeText(json);
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <span>Debug Logs ({logs.length}) {open ? "▲" : "▼"}</span>
        <span className="text-gray-400">tap to {open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-200">
          <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50">
            {STAGES.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-2 py-1 rounded text-xs ${
                  filter === s
                    ? "bg-blue-500 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {s}
              </button>
            ))}
            <div className="ml-auto flex gap-1">
              <button
                onClick={handleCopy}
                className="px-2 py-1 rounded text-xs bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
              >
                Copy JSON
              </button>
              <button
                onClick={clear}
                className="px-2 py-1 rounded text-xs bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-auto font-mono text-xs bg-gray-900 text-gray-100 p-2">
            {filtered.length === 0 ? (
              <div className="text-gray-500">No logs yet. Start recording.</div>
            ) : (
              filtered.map((e, i) => (
                <div
                  key={i}
                  className={`py-1 border-b border-gray-800 ${
                    e.level === "error"
                      ? "text-red-300"
                      : e.level === "warn"
                        ? "text-yellow-300"
                        : "text-gray-100"
                  }`}
                >
                  <span className="text-gray-500">
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>{" "}
                  <span className="uppercase text-blue-300">[{e.stage}]</span>{" "}
                  <span>{e.msg}</span>
                  {e.meta && (
                    <span className="text-gray-400"> {JSON.stringify(e.meta)}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
