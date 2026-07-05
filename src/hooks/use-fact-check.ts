"use client";

import { useState, useCallback, useRef } from "react";
import type { FactCheckResult } from "@/types";

interface UseFactCheckReturn {
  results: FactCheckResult[];
  isChecking: boolean;
  error: string | null;
  checkLive: (text: string) => Promise<void>;
  checkPrep: (text: string) => Promise<void>;
  clearResults: () => void;
}

export function useFactCheck(): UseFactCheckReturn {
  const [results, setResults] = useState<FactCheckResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkLive = useCallback(async (text: string) => {
    if (!text.trim()) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsChecking(true);
    setError(null);

    try {
      const response = await fetch("/api/check/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Check failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResults((prev) => [...data.results, ...prev]);
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        setError(e.message);
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  const checkPrep = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setIsChecking(true);
    setError(null);
    setResults([]);

    try {
      const response = await fetch("/api/check/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`Check failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.results);
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    isChecking,
    error,
    checkLive,
    checkPrep,
    clearResults,
  };
}
