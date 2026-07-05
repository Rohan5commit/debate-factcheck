"use client";

import type { FactCheckResult } from "@/types";
import { SourceCard } from "./source-card";

interface FactCheckCardProps {
  result: FactCheckResult;
}

const statusConfig = {
  correct: {
    label: "Correct",
    color: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-800",
    icon: "✓",
  },
  misleading: {
    label: "Misleading",
    color: "bg-yellow-50 border-yellow-200",
    badge: "bg-yellow-100 text-yellow-800",
    icon: "⚠",
  },
  incorrect: {
    label: "Incorrect",
    color: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-800",
    icon: "✗",
  },
  unverifiable: {
    label: "Unverifiable",
    color: "bg-gray-50 border-gray-200",
    badge: "bg-gray-100 text-gray-800",
    icon: "?",
  },
};

export function FactCheckCard({ result }: FactCheckCardProps) {
  const config = statusConfig[result.status];

  return (
    <div className={`p-3 sm:p-4 rounded-lg border ${config.color}`}>
      <div className="flex items-start gap-2 sm:gap-3">
        <span
          className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${config.badge}`}
        >
          {config.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{result.text}</p>
          {result.correction && (
            <p className="text-xs sm:text-sm text-gray-700 mt-1">
              {result.correction}
            </p>
          )}
          {result.sources.length > 0 && (
            <div className="mt-2 space-y-2">
              {result.sources.map((source, i) => (
                <SourceCard key={i} source={source} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
