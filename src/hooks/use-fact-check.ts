"use client";

import { useState, useCallback, useRef } from "react";
import type { FactCheckResult } from "@/types";

interface ApiTestResult {
  provider: string;
  status: "ok" | "error";
  message: string;
  latencyMs?: number;
}

interface UseFactCheckReturn {
  results: FactCheckResult[];
  isChecking: boolean;
  error: string | null;
  errorDetails: string | null;
  checkLive: (text: string) => Promise<void>;
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<{ text: string; mode: "live" | "prep" } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkLive = useCallback(async (text: string) => {
    if (!text.trim()) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    return new Promise<void>((resolve) => {
      debounceTimerRef.current = setTimeout(async () => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        lastRequestRef.current = { text, mode: "live" };
        setIsChecking(true);
        setError(null);
        setErrorDetails(null);

        try {
          const response = await fetch("/api/check/live", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: abortControllerRef.current.signal,
          });

          const data = await response.json();

          if (!response.ok) {
            const errorMsg = data.error || `Check failed: ${response.statusText}`;
            const details = data.details || null;
            setError(errorMsg);
            setErrorDetails(details);
          } else if (data.results) {
            setResults((prev) => [...data.results, ...prev]);
          }
        } catch (e) {
          if (e instanceof Error && e.name !== "AbortError") {
            setError(e.message);
            setErrorDetails(null);
          }
        } finally {
          setIsChecking(false);
          resolve();
        }
      }, 300);
    });
  }, []);

  const checkPrep = useCallback(async (text: string) => {
    if (!text.trim()) return;

    lastRequestRef.current = { text, mode: "prep" };
    setIsChecking(true);
    setError(null);
    setErrorDetails(null);
    setResults([]);

    try {
      const response = await fetch("/api/check/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

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
      if (e instanceof Error) {
        setError(e.message);
        setErrorDetails(null);
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  const retryLast = useCallback(async () => {
    if (!lastRequestRef.current) return;
    const { text, mode } = lastRequestRef.current;
    if (mode === "live") {
      await checkLive(text);
    } else {
      await checkPrep(text);
    }
  }, [checkLive, checkPrep]);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
    setErrorDetails(null);
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
    checkLive,
    checkPrep,
    retryLast,
    clearResults,
    testApiKeys,
  };
}
