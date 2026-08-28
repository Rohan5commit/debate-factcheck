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

const CHUNK_SECONDS = 8;
const TARGET_SAMPLE_RATE = 16000;
const MAX_RETRIES = 2;

function checkSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!((window as any).AudioContext || (window as any).webkitAudioContext)
  );
}

function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function encodeWAV(samples: Int16Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  const pcm = new Uint8Array(buffer, 44);
  const int16Bytes = new Uint8Array(samples.buffer);
  pcm.set(int16Bytes);

  return new Blob([buffer], { type: "audio/wav" });
}

function resample(
  buffer: AudioBuffer,
  targetRate: number
): Float32Array {
  const ratio = buffer.sampleRate / targetRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, channelData.length - 1);
    const frac = srcIndex - srcIndexFloor;
    result[i] = channelData[srcIndexFloor] * (1 - frac) + channelData[srcIndexCeil] * frac;
  }

  return result;
}

export function useWhisperSpeech(): WhisperSpeechHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sampleBufferRef = useRef<Float32Array[]>([]);
  const queueRef = useRef<Float32Array[][]>([]);
  const processingRef = useRef(false);

  const isSupported = checkSupport();

  const transcribeChunk = async (samples: Float32Array[]): Promise<string | null> => {
    const totalLength = samples.reduce((sum, s) => sum + s.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of samples) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const wavBlob = encodeWAV(floatTo16BitPCM(merged), TARGET_SAMPLE_RATE);

    if (wavBlob.size < 1000) {
      return null;
    }

    const formData = new FormData();
    formData.append("audio", wavBlob, "audio.wav");

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
      const samples = queueRef.current.shift()!;
      setStatus("Transcribing...");

      let text: string | null = null;
      let succeeded = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          text = await transcribeChunk(samples);
          succeeded = true;
          break;
        } catch (e) {
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
      }

      setStatus(null);
    }

    processingRef.current = false;
  }, []);

  const flushBuffer = useCallback(() => {
    if (sampleBufferRef.current.length === 0) return;
    const samples = [...sampleBufferRef.current];
    sampleBufferRef.current = [];
    queueRef.current.push(samples);
    processQueue();
  }, [processQueue]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      sampleBufferRef.current = [];
      queueRef.current = [];
      processingRef.current = false;

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!isListening) return;
        const inputData = event.inputBuffer.getChannelData(0);
        sampleBufferRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      processorRef.current = processor;
      sourceRef.current = source;
      streamRef.current = stream;

      const totalSamplesPerChunk = TARGET_SAMPLE_RATE * CHUNK_SECONDS;
      const checkInterval = 1000;

      intervalRef.current = setInterval(() => {
        const totalSamples = sampleBufferRef.current.reduce(
          (sum, s) => sum + s.length,
          0
        );
        if (totalSamples >= totalSamplesPerChunk) {
          flushBuffer();
        }
      }, checkInterval);

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
  }, [flushBuffer, isListening]);

  const stopListening = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    flushBuffer();
    setIsListening(false);
    setStatus(null);
  }, [flushBuffer]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    sampleBufferRef.current = [];
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
