"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useWhisperSpeech } from "@/hooks/use-whisper-speech";
import { useFactCheck } from "@/hooks/use-fact-check";
import { FactCheckCard } from "./fact-check-card";

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

  if (!isSupported) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="text-sm font-medium text-red-800">
          Microphone Not Available
        </h3>
        <p className="text-sm text-red-700 mt-1">
          Live mode requires microphone access. Please use Prep mode to upload
          text and PDFs instead.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
        <strong>Debate Mode Active:</strong> Uses Groq Whisper for accurate
        transcription in noisy environments. Works with multiple speakers,
        background noise, and overlapping dialogue. Audio is processed every 3
        seconds.
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
          {isListening ? "Stop Recording" : "Start Recording"}
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
          <span className="flex items-center gap-2 text-sm text-red-600 font-medium">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            Recording...
          </span>
        )}
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
          <strong>Error:</strong> {speechError}
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
          {transcript || "Click 'Start Recording' to begin fact-checking..."}
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
