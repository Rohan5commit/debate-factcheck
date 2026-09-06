"use client";

import { useState, useCallback, useRef } from "react";
import { pushLog } from "@/lib/debug-log";

interface StreamingSpeechHook {
  isListening: boolean;
  transcript: string;
  interim: string;
  isSupported: boolean;
  error: string | null;
  status: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

function checkSupport(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function useStreamingSpeech(): StreamingSpeechHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const restartCountRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalRef = useRef("");
  const noSpeechCountRef = useRef(0);

  const MAX_SILENT_RESTARTS = 4;

  const isSupported = checkSupport();

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const startListening = useCallback(() => {
    const w = window as unknown as Record<string, new () => SpeechRecognition>;
    const API = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!API) {
      setError("Speech recognition not supported in this browser.");
      return;
    }

    try {
      recognitionRef.current?.abort();
    } catch {}
    recognitionRef.current = null;
    clearRestartTimer();
    restartCountRef.current = 0;

    const recognition = new API();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const t = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += t + " ";
        else interimText += t + " ";
      }
      interimText = interimText.trim();
      finalText = finalText.trim();
      if (interimText) {
        noSpeechCountRef.current = 0;
        setInterim(interimText);
        setStatus(`Hearing: ${interimText.slice(0, 60)}`);
      }
      if (finalText) {
        noSpeechCountRef.current = 0;
        finalRef.current = finalRef.current ? `${finalRef.current} ${finalText}` : finalText;
        setTranscript(finalRef.current);
        setInterim("");
        setStatus(null);
        pushLog("info", "transcribe", "stream final", {
          textLen: finalText.length,
          textPreview: finalText.slice(0, 80),
        });
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const err = event.error;
      if (err === "no-speech" || err === "audio-capture") {
        const n = ++noSpeechCountRef.current;
        pushLog("warn", "transcribe", "stream notice", { error: err, consecutiveSilent: n });
        if (n === 2) {
          setStatus("No speech detected — check mic volume and playback device. See tip below.");
        }
        return;
      }
      if (err === "aborted" || err === "network") {
        pushLog("warn", "transcribe", "stream error, will restart", { error: err });
        return;
      }
      pushLog("error", "transcribe", "stream error", { error: err });
      setError(`Speech error: ${err}`);
    };

    recognition.onend = () => {
      if (!isListeningRef.current) return;
      if (noSpeechCountRef.current >= MAX_SILENT_RESTARTS) {
        pushLog("error", "transcribe", "stopped after repeated silence", {
          consecutiveSilent: noSpeechCountRef.current,
        });
        isListeningRef.current = false;
        clearRestartTimer();
        if (recognitionRef.current) {
          recognitionRef.current = null;
        }
        setIsListening(false);
        setInterim("");
        setStatus(
          "Stopped: mic heard only silence. Check mic volume and that playback uses speakers your mic can hear — or use Upload Audio with the file directly."
        );
        return;
      }
      const n = ++restartCountRef.current;
      const delay = Math.min(200 * n, 2000);
      pushLog("info", "transcribe", "stream ended, restarting", { attempt: n, delayMs: delay });
      restartTimerRef.current = setTimeout(() => {
        if (!isListeningRef.current) return;
        try {
          recognition.start();
        } catch (e) {
          pushLog("error", "transcribe", "stream restart failed", { error: String(e) });
          setIsListening(false);
          isListeningRef.current = false;
        }
      }, delay);
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    noSpeechCountRef.current = 0;
    try {
      recognition.start();
      setIsListening(true);
      setError(null);
      setStatus("Listening...");
      pushLog("info", "system", "streaming started", { mode: "webspeech", lang: "en-US" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start speech recognition");
      isListeningRef.current = false;
    }
  }, []);

  const stopListening = useCallback(() => {
    const hadSpeech = finalRef.current.trim().length > 0;
    isListeningRef.current = false;
    clearRestartTimer();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterim("");
    if (!hadSpeech) {
      setStatus(null);
      setError(
        "No speech was captured — the mic heard only silence. Check mic volume and that playback uses speakers your mic can hear, or use Upload Audio with the file directly."
      );
      pushLog("error", "transcribe", "stopped with empty transcript", {});
    } else {
      setStatus(null);
    }
    pushLog("info", "system", "streaming stopped", { hadSpeech });
  }, []);

  const resetTranscript = useCallback(() => {
    finalRef.current = "";
    noSpeechCountRef.current = 0;
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { isListening, transcript, interim, isSupported, error, status, startListening, stopListening, resetTranscript };
}
