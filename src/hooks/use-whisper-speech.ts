"use client";

import { useState, useCallback, useRef } from "react";

interface WhisperSpeechHook {
  isListening: boolean;
  transcript: string;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useWhisperSpeech(): WhisperSpeechHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported = typeof window !== "undefined" && !!getSpeechRecognition();

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Use Chrome or Edge.");
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text.length > 0) {
            finalTranscript += (finalTranscript ? " " : "") + text;
            setTranscript(finalTranscript);
          }
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errType = event.error;
      if (errType === "no-speech") return;
      if (errType === "aborted") return;
      console.error("Speech recognition error:", errType, event.message);
      setError(`Speech recognition error: ${errType}`);
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        restartTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch {
              setIsListening(false);
            }
          }
        }, 200);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start speech recognition");
    }
  }, []);

  const stopListening = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      try { rec.stop(); } catch {}
    }

    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  return {
    isListening,
    transcript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
