"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useWhisperSpeech } from "@/hooks/use-whisper-speech";
import { useFactCheck } from "@/hooks/use-fact-check";
import { FactCheckCard } from "./fact-check-card";

const BATCH_SIZE = 3;

export function LiveMode() {
  const {
    isListening,
    transcript,
    isSupported,
    error: speechError,
    status: speechStatus,
    startListening,
    stopListening,
    resetTranscript,
  } = useWhisperSpeech();

  const {
    results,
    isChecking,
    error: checkError,
    errorDetails,
    pendingCount,
    checkLive,
    retryLast,
    testApiKeys,
  } = useFactCheck();

  const checkedSentencesRef = useRef<Set<string>>(new Set());
  const lastCheckedRef = useRef("");
  const processingQueueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || processingQueueRef.current.length === 0) return;
    isProcessingRef.current = true;

    while (processingQueueRef.current.length > 0) {
      const batch = processingQueueRef.current.splice(0, BATCH_SIZE);
      if (batch.length === 0) break;

      const textToCheck = batch.join(" ");
      await new Promise<void>((resolve) => {
        checkLive(textToCheck);
        setTimeout(resolve, 100);
      });

      batch.forEach((s) => checkedSentencesRef.current.add(s));

      await new Promise((r) => setTimeout(r, 500));
    }

    isProcessingRef.current = false;
  }, [checkLive]);

  const processTranscript = useCallback(() => {
    if (!transcript || transcript === lastCheckedRef.current) return;

    const sentences = transcript
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 5);

    const unchecked = sentences.filter(
      (s) => !checkedSentencesRef.current.has(s)
    );

    if (unchecked.length > 0) {
      lastCheckedRef.current = transcript;
      processingQueueRef.current.push(...unchecked);
      processQueue();
    }
  }, [transcript, processQueue]);

  useEffect(() => {
    processTranscript();
  }, [processTranscript]);

  const handleClear = () => {
    resetTranscript();
    checkedSentencesRef.current = new Set();
    lastCheckedRef.current = "";
    processingQueueRef.current = [];
    isProcessingRef.current = false;
  };

  const handleTestApi = async () => {
    setIsTestingApi(true);
    setApiStatus(null);
    try {
      const testResults = await testApiKeys();
      const lines = testResults.map(
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
        transcription. Audio is captured in 8-second chunks with overlap for
        context. Sentences are fact-checked automatically.
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

      {speechStatus && (
        <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          {speechStatus}
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

      {(isChecking || pendingCount > 0) && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          {isChecking
            ? `Checking facts...${pendingCount > 0 ? ` (${pendingCount} pending)` : ""}`
            : `${pendingCount} sentence${pendingCount !== 1 ? "s" : ""} pending verification`}
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
