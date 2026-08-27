"use client";

import { useState, useCallback, useRef } from "react";

interface WhisperSpeechHook {
  isListening: boolean;
  transcript: string;
  isSupported: boolean;
  error: string | null;
  status: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

const CHUNK_INTERVAL_MS = 8000;
const OVERLAP_SECONDS = 2;

function checkSupport(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function useWhisperSpeech(): WhisperSpeechHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const overlapBufferRef = useRef<Blob[]>([]);
  const queueRef = useRef<Blob[][]>([]);
  const processingRef = useRef(false);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 2;

  const isSupported = checkSupport();

  const transcribeChunk = async (chunks: Blob[]): Promise<string | null> => {
    const allChunks = [...overlapBufferRef.current, ...chunks];
    const audioBlob = new Blob(allChunks, { type: "audio/webm" });

    if (audioBlob.size < 1000) {
      return null;
    }

    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.webm");

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Transcription failed: ${response.status}`);
    }

    const result = await response.json();
    return result.text?.trim() || null;
  };

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const chunks = queueRef.current.shift()!;
      setStatus("Transcribing...");

      let text: string | null = null;
      let succeeded = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          text = await transcribeChunk(chunks);
          succeeded = true;
          retryCountRef.current = 0;
          break;
        } catch (e) {
          retryCountRef.current++;
          console.error(`Transcription attempt ${attempt + 1} failed:`, e);
          if (attempt < MAX_RETRIES) {
            setStatus(`Retrying... (${attempt + 1}/${MAX_RETRIES})`);
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }

      if (succeeded && text && text.length > 0) {
        setTranscript((prev) => {
          const trimmed = prev.trim();
          return trimmed ? `${trimmed} ${text}` : text;
        });
        overlapBufferRef.current = chunks.slice(-Math.ceil(OVERLAP_SECONDS));
        setStatus(null);
      } else if (!succeeded) {
        setStatus("Transcription failed — skipping chunk");
        overlapBufferRef.current = [];
        await new Promise((r) => setTimeout(r, 500));
        setStatus(null);
      } else {
        setStatus(null);
      }
    }

    processingRef.current = false;
  }, []);

  const flushChunks = useCallback(() => {
    if (audioChunksRef.current.length === 0) return;
    const chunks = [...audioChunksRef.current];
    audioChunksRef.current = [];
    queueRef.current.push(chunks);
    processQueue();
  }, [processQueue]);

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
      queueRef.current = [];
      processingRef.current = false;
      retryCountRef.current = 0;

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
        if (mediaRecorder.state === "recording" && audioChunksRef.current.length > 0) {
          flushChunks();
        }
      }, CHUNK_INTERVAL_MS);

      setIsListening(true);
      setError(null);
      setStatus(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Microphone error: ${e.message}`
          : "Could not access microphone"
      );
    }
  }, [flushChunks]);

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
    flushChunks();
    setIsListening(false);
    setStatus(null);
  }, [flushChunks]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    audioChunksRef.current = [];
    overlapBufferRef.current = [];
    queueRef.current = [];
  }, []);

  return {
    isListening,
    transcript,
    isSupported,
    error,
    status,
    startListening,
    stopListening,
    resetTranscript,
  };
}
