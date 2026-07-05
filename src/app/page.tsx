"use client";

import { useState, useEffect } from "react";
import { ModeTabs } from "@/components/mode-tabs";
import { LiveMode } from "@/components/live-mode";
import { PrepMode } from "@/components/prep-mode";

export default function Home() {
  const [mode, setMode] = useState<"live" | "prep">("live");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "1") {
          e.preventDefault();
          setMode("live");
        } else if (e.key === "2") {
          e.preventDefault();
          setMode("prep");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Debate Fact-Check
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Real-time fact-checking for debates and research
          </p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1">
            Keyboard shortcuts: Ctrl/⌘+1 (Live), Ctrl/⌘+2 (Prep)
          </p>
        </header>

        <ModeTabs activeMode={mode} onModeChange={setMode} />

        <div className="mt-4 sm:mt-6">
          {mode === "live" ? <LiveMode /> : <PrepMode />}
        </div>
      </div>
    </main>
  );
}
