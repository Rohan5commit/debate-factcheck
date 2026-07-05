"use client";

import type { Source } from "@/types";

interface SourceCardProps {
  source: Source;
}

export function SourceCard({ source }: SourceCardProps) {
  const credibilityColors = {
    high: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-red-100 text-red-800",
  };

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-2 rounded border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-gray-900 line-clamp-1">
          {source.title}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${credibilityColors[source.credibility]}`}
        >
          {source.credibility}
        </span>
      </div>
      <p className="text-gray-600 mt-1 line-clamp-2">{source.snippet}</p>
      <p className="text-gray-400 mt-1 text-[10px] truncate">{source.url}</p>
    </a>
  );
}
