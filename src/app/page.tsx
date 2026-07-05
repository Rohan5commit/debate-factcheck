"use client";

import { useState } from "react";
import { ModeTabs } from "@/components/mode-tabs";
import { LiveMode } from "@/components/live-mode";
import { PrepMode } from "@/components/prep-mode";

export default function Home() {
  const [mode, setMode] = useState<"live" | "prep">("live");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Debate Fact-Check
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Real-time fact-checking for debates and research
          </p>
        </header>

        <ModeTabs activeMode={mode} onModeChange={setMode} />

        <div className="mt-6">
          {mode === "live" ? <LiveMode /> : <PrepMode />}
        </div>
      </div>
    </main>
  );
}
