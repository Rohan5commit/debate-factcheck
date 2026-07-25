"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useWhisperSpeech } from "@/hooks/use-whisper-speech";
import { useFactCheck } from "@/hooks/use-fact-check";
import { FactCheckCard } from "./fact-check-card";
import { BrowserSupportWarning, getBrowserInfo } from "./browser-support-warning";

export function LiveMode() {
  const {
    isListening,
    transcript,
    isSupported,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
  } = useWhisperSpeech();

  const {
    results,
    isChecking,
    error: checkError,
    errorDetails,
    checkLive,
    retryLast,
    testApiKeys,
  } = useFactCheck();

  const checkedSentencesRef = useRef<Set<string>>(new Set());
  const lastCheckedRef = useRef("");
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);

  const processTranscript = useCallback(() => {
    if (!transcript || transcript === lastCheckedRef.current) return;

    const sentences = transcript
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 5);

    const unchecked = sentences.filter((s) => !checkedSentencesRef.current.has(s));

    if (unchecked.length > 0) {
      const textToCheck = unchecked.join(" ");
      lastCheckedRef.current = transcript;
      checkLive(textToCheck);
      unchecked.forEach((s) => checkedSentencesRef.current.add(s));
    }
  }, [transcript, checkLive]);

  useEffect(() => {
    processTranscript();
  }, [processTranscript]);

  const handleClear = () => {
    resetTranscript();
    checkedSentencesRef.current = new Set();
    lastCheckedRef.current = "";
  };

  const handleTestApi = async () => {
    setIsTestingApi(true);
    setApiStatus(null);
    try {
      const results = await testApiKeys();
      const lines = results.map(
        (r: { provider: string; status: string; message: string }) =>
          `${r.provider}: ${r.status === "ok" ? "✓" : "✗"} ${r.message}`
      );
      setApiStatus(lines.join("\n"));
    } catch {
      setApiStatus("Failed to test API keys");
    }
    setIsTestingApi(false);
  };

  const browser = getBrowserInfo();

  if (!isSupported) {
    return <BrowserSupportWarning />;
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        <strong>Speech Recognition:</strong> Uses your browser&apos;s built-in speech-to-text.
        Best with clear speech in quiet environments. Results may vary by browser.
        Comet, Chrome, and Edge work best.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isListening
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          {isListening ? "Stop Listening" : "Start Listening"}
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleTestApi}
          disabled={isTestingApi}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {isTestingApi ? "Testing..." : "Test API Keys"}
        </button>
        {isListening && (
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Listening...
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto hidden sm:inline">
          {browser.name}
        </span>
      </div>

      {apiStatus && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 whitespace-pre-wrap">
          <div className="flex items-center justify-between mb-1">
            <strong>API Key Status:</strong>
            <button
              onClick={() => setApiStatus(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          {apiStatus}
        </div>
      )}

      {speechError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <strong>Speech Error:</strong> {speechError}
        </div>
      )}

      {checkError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <div className="flex items-start justify-between">
            <div>
              <strong>Verification Error:</strong> {checkError}
              {errorDetails && (
                <div className="mt-1 text-xs text-red-600 whitespace-pre-wrap">
                  {errorDetails}
                </div>
              )}
            </div>
            <button
              onClick={retryLast}
              className="text-xs underline hover:no-underline ml-2 shrink-0"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="p-4 bg-gray-50 rounded-lg min-h-[100px]">
        <p className="text-sm text-gray-500 mb-2">Transcript:</p>
        <p className="text-gray-900">
          {transcript || "Start speaking to begin fact-checking..."}
        </p>
      </div>

      {isChecking && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Checking facts...
        </div>
      )}

      <div className="space-y-3">
        {results.map((result) => (
          <FactCheckCard key={result.id} result={result} />
        ))}
      </div>

      {results.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {results.length} sentence{results.length !== 1 ? "s" : ""} checked
        </p>
      )}
    </div>
  );
}
