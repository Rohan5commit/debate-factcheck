"use client";

import { useState, useCallback, useRef } from "react";
import type { FactCheckResult } from "@/types";
import { pushLog } from "@/lib/debug-log";

interface ApiTestResult {
  provider: string;
  status: "ok" | "error";
  message: string;
  latencyMs?: number;
}

interface QueuedRequest {
  text: string;
  mode: "live" | "prep";
  resolve: () => void;
}

interface UseFactCheckReturn {
  results: FactCheckResult[];
  isChecking: boolean;
  error: string | null;
  errorDetails: string | null;
  pendingCount: number;
  checkLive: (text: string) => void;
  checkPrep: (text: string) => Promise<void>;
  retryLast: () => Promise<void>;
  clearResults: () => void;
  testApiKeys: () => Promise<ApiTestResult[]>;
}

export function useFactCheck(): UseFactCheckReturn {
  const [results, setResults] = useState<FactCheckResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const queueRef = useRef<QueuedRequest[]>([]);
  const processingRef = useRef(false);
  const lastRequestRef = useRef<{ text: string; mode: "live" | "prep" } | null>(null);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const req = queueRef.current.shift()!;
      setPendingCount(queueRef.current.length);
      setIsChecking(true);
      setError(null);
      setErrorDetails(null);
      lastRequestRef.current = { text: req.text, mode: req.mode };

      pushLog("info", "fact-check", "sending batch", { textLen: req.text.length, textPreview: req.text.slice(0, 60) });
      const t0 = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 50000);

        const response = await fetch(
          req.mode === "live" ? "/api/check/live" : "/api/check/prep",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: req.text }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);
        const data = await response.json();
        const latency = Date.now() - t0;

        if (!response.ok) {
          const errorMsg = data.error || `Check failed: ${response.statusText}`;
          const details = data.details || null;
          pushLog("error", "fact-check", "batch failed", { status: response.status, latencyMs: latency, error: errorMsg });
          setError(errorMsg);
          setErrorDetails(details);
        } else if (data.results) {
          pushLog("info", "fact-check", "batch done", { results: data.results.length, latencyMs: latency });
          setResults((prev) => [...prev, ...data.results]);
        }
      } catch (e) {
        const latency = Date.now() - t0;
        if (e instanceof Error && e.name === "AbortError") {
          pushLog("error", "fact-check", "timeout", { latencyMs: latency });
          setError("Fact-check timed out. Try checking fewer sentences at once.");
          setErrorDetails(null);
        } else if (e instanceof Error) {
          pushLog("error", "fact-check", "fetch error", { latencyMs: latency, error: e.message });
          setError(e.message);
          setErrorDetails(null);
        }
      } finally {
        req.resolve();
      }
    }

    setIsChecking(false);
    setPendingCount(0);
    processingRef.current = false;
  }, []);

  const checkLive = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      return new Promise<void>((resolve) => {
        queueRef.current.push({ text, mode: "live", resolve });
        setPendingCount(queueRef.current.length);
        processQueue();
      });
    },
    [processQueue]
  );

  const checkPrep = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      lastRequestRef.current = { text, mode: "prep" };
      setIsChecking(true);
      setError(null);
      setErrorDetails(null);
      setResults([]);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 50000);

        const response = await fetch("/api/check/prep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await response.json();

        if (!response.ok) {
          const errorMsg = data.error || `Check failed: ${response.statusText}`;
          const details = data.details || null;
          setError(errorMsg);
          setErrorDetails(details);
        } else if (data.results) {
          setResults(data.results);
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          setError("Fact-check timed out.");
        } else if (e instanceof Error) {
          setError(e.message);
          setErrorDetails(null);
        }
      } finally {
        setIsChecking(false);
      }
    },
    []
  );

  const retryLast = useCallback(async () => {
    if (!lastRequestRef.current) return;
    const { text, mode } = lastRequestRef.current;
    if (mode === "live") {
      checkLive(text);
    } else {
      await checkPrep(text);
    }
  }, [checkLive, checkPrep]);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
    setErrorDetails(null);
    setPendingCount(0);
    queueRef.current = [];
    lastRequestRef.current = null;
  }, []);

  const testApiKeys = useCallback(async (): Promise<ApiTestResult[]> => {
    try {
      const response = await fetch("/api/test-keys");
      const data = await response.json();
      return [data.groq, data.nim, data.serper].filter(Boolean);
    } catch {
      return [{ provider: "Unknown", status: "error", message: "Failed to reach server" }];
    }
  }, []);

  return {
    results,
    isChecking,
    error,
    errorDetails,
    pendingCount,
    checkLive,
    checkPrep,
    retryLast,
    clearResults,
    testApiKeys,
  };
}
