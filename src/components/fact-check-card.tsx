"use client";

import type { FactCheckResult } from "@/types";
import { SourceCard } from "./source-card";

interface FactCheckCardProps {
  result: FactCheckResult;
}

const statusConfig = {
  correct: {
    label: "Correct",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: "✓",
  },
  misleading: {
    label: "Misleading",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: "⚠",
  },
  incorrect: {
    label: "Incorrect",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: "✗",
  },
  unverifiable: {
    label: "Unverifiable",
    color: "bg-gray-100 text-gray-800 border-gray-200",
    icon: "?",
  },
};

export function FactCheckCard({ result }: FactCheckCardProps) {
  const config = statusConfig[result.status];

  return (
    <div className={`p-4 rounded-lg border ${config.color}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{result.text}</p>
          {result.correction && (
            <p className="text-sm text-gray-700 mt-1">{result.correction}</p>
          )}
          {result.sources.length > 0 && (
            <div className="mt-3 space-y-2">
              {result.sources.map((source, i) => (
                <SourceCard key={i} source={source} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
