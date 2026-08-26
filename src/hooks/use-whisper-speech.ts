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

function checkSupport(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function useWhisperSpeech(): WhisperSpeechHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overlapBufferRef = useRef<Blob[]>([]);

  const isSupported = checkSupport();

  const processAudio = useCallback(async () => {
    if (processingRef.current || audioChunksRef.current.length === 0) return;
    processingRef.current = true;

    const chunks = [...audioChunksRef.current];
    audioChunksRef.current = [];

    try {
      const audioBlob = new Blob(chunks, { type: "audio/webm" });
      if (audioBlob.size < 1500) {
        processingRef.current = false;
        return;
      }

      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Transcription failed");
      }

      const result = await response.json();
      const text = result.text?.trim();

      if (text && text.length > 0) {
        setTranscript((prev) => {
          const trimmed = prev.trim();
          return trimmed ? `${trimmed} ${text}` : text;
        });
      }

      const overlapChunks = chunks.slice(-6);
      overlapBufferRef.current = overlapChunks;
    } catch (e) {
      console.error("Transcription error:", e);
      if (chunks.length > 0) {
        overlapBufferRef.current = chunks.slice(-6);
      }
    } finally {
      processingRef.current = false;
    }
  }, []);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];
      overlapBufferRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);

      intervalRef.current = setInterval(() => {
        if (
          mediaRecorder.state === "recording" &&
          audioChunksRef.current.length > 0 &&
          !processingRef.current
        ) {
          processAudio();
        }
      }, 5000);

      setTimeout(() => {
        if (
          mediaRecorder.state === "recording" &&
          audioChunksRef.current.length > 0 &&
          !processingRef.current
        ) {
          processAudio();
        }
      }, 2500);

      setIsListening(true);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Microphone error: ${e.message}`
          : "Could not access microphone"
      );
    }
  }, [processAudio]);

  const stopListening = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTimeout(() => {
      if (audioChunksRef.current.length > 0 && !processingRef.current) {
        processAudio();
      }
    }, 200);
    setIsListening(false);
  }, [processAudio]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    audioChunksRef.current = [];
    overlapBufferRef.current = [];
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
