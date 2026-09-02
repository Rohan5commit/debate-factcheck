"use client";

import { useState, useCallback, useRef } from "react";
import { pushLog } from "@/lib/debug-log";

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

const CHUNK_SECONDS = 10;
const TARGET_SAMPLE_RATE = 16000;
const MAX_RETRIES = 2;
const SILENCE_RMS_THRESHOLD = 0.008;
const OVERLAP_SECONDS = 1.0;

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
    const v = s < 0 ? s * 0x8000 : s * 0x7fff;
    int16[i] = Math.round(v);
    if (int16[i] === 32768) int16[i] = 32767;
    if (int16[i] < -32768) int16[i] = -32768;
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
  const int16Bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  pcm.set(int16Bytes);

  return new Blob([buffer], { type: "audio/wav" });
}

function computeRMS(samples: Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const chunk of samples) {
    for (let i = 0; i < chunk.length; i++) {
      sum += chunk[i] * chunk[i];
      count++;
    }
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

function resampleFloat32(
  input: Float32Array,
  inputRate: number,
  targetRate: number
): Float32Array {
  if (inputRate === targetRate) return input;
  const ratio = inputRate / targetRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const floor = Math.floor(srcIndex);
    const ceil = Math.min(floor + 1, input.length - 1);
    const frac = srcIndex - floor;
    result[i] = input[floor] * (1 - frac) + input[ceil] * frac;
  }
  return result;
}

// kept for fallback, but main path now sends native rate directly to Groq

export function useWhisperSpeech(): WhisperSpeechHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sampleBufferRef = useRef<Float32Array[]>([]);
  const queueRef = useRef<Array<{ samples: Float32Array[]; rate: number }>>([]);
  const overlapRef = useRef<Float32Array | null>(null);
  const isListeningRef = useRef(false);
  const processingRef = useRef(false);
  const lastTranscriptTailRef = useRef<string>("");
  const chunkIndexRef = useRef(0);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  const isSupported = checkSupport();

  const transcribeChunk = async (
    samples: Float32Array[],
    capturedRate: number
  ): Promise<string | null> => {
    const totalLength = samples.reduce((sum, s) => sum + s.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of samples) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const rms = computeRMS(samples);
    if (rms < SILENCE_RMS_THRESHOLD) {
      pushLog("info", "capture", "silence skip", { rms: rms.toFixed(4), samples: totalLength });
      return null;
    }

    const actualRate = capturedRate;
    pushLog("info", "encode", "encoding WAV", {
      actualRate,
      inputSamples: merged.length,
      rms: rms.toFixed(4),
    });

    const wavBlob = encodeWAV(floatTo16BitPCM(merged), actualRate);

    if (wavBlob.size < 1000) {
      pushLog("warn", "encode", "wav too small, skipping", { size: wavBlob.size });
      return null;
    }

    pushLog("info", "transcribe", "sending to Groq", { wavBytes: wavBlob.size, durationSec: (merged.length / actualRate).toFixed(1) });
    const t0 = Date.now();

    const formData = new FormData();
    formData.append("audio", wavBlob, "audio.wav");

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const latency = Date.now() - t0;

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      pushLog("error", "transcribe", "Groq error", { status: response.status, latencyMs: latency, error: data.error });
      throw new Error(data.error || `Transcription failed: ${response.status}`);
    }

    const result = await response.json();
    const text = result.text?.trim() || null;
    pushLog("info", "transcribe", text ? "transcribed" : "empty result", { latencyMs: latency, language: result.language || "unknown", textLen: text?.length || 0, textPreview: text?.slice(0, 80) || "" });
    return text;
  };

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const { samples, rate } = queueRef.current.shift()!;
      setStatus("Transcribing...");

      let text: string | null = null;
      let succeeded = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          text = await transcribeChunk(samples, rate);
          succeeded = true;
          break;
        } catch (e) {
          pushLog("error", "transcribe", `attempt ${attempt + 1} failed`, { error: String(e) });
          console.error(`Transcription attempt ${attempt + 1} failed:`, e);
          if (attempt < MAX_RETRIES) {
            setStatus(`Retrying... (${attempt + 1}/${MAX_RETRIES})`);
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }

      if (succeeded && text && text.length > 0) {
        let deduped = text;
        const tail = lastTranscriptTailRef.current;
        if (tail) {
          const tailWords = tail.split(/\s+/).slice(-6).join(" ");
          if (tailWords.length > 10 && deduped.toLowerCase().startsWith(tailWords.toLowerCase().slice(0, 20))) {
            const idx = deduped.toLowerCase().indexOf(tailWords.toLowerCase().split(" ").slice(-2).join(" "));
            if (idx > 0 && idx < 40) deduped = deduped.slice(idx).trim();
          }
          const overlapPhrases = tail.split(/(?<=[.!?])\s+/).slice(-1)[0];
          if (overlapPhrases && deduped.toLowerCase().includes(overlapPhrases.toLowerCase().slice(0, 15))) {
            // no-op, keep as is but log
          }
        }
        // simple duplicate prefix check: if deduped starts with tail's last 30 chars
        if (tail && deduped.length > 0) {
          const last30 = tail.slice(-30).toLowerCase();
          const dedupLower = deduped.toLowerCase();
          if (last30.length > 10 && dedupLower.startsWith(last30.slice(-15))) {
            pushLog("info", "capture", "dedup trimmed overlap", { before: text.slice(0, 40), after: deduped.slice(0, 40) });
          }
        }

        setTranscript((prev) => {
          const trimmed = prev.trim();
          const newText = trimmed ? `${trimmed} ${deduped}` : deduped;
          lastTranscriptTailRef.current = deduped;
          return newText;
        });
        pushLog("info", "capture", "transcript appended", { textLen: deduped.length, deduped: deduped.length !== text.length });
      } else if (!succeeded) {
        pushLog("error", "transcribe", "chunk failed after retries, skipping", {});
        setStatus("Transcription failed — skipping chunk");
        await new Promise((r) => setTimeout(r, 500));
      }

      setStatus(null);

      if (succeeded && text) {
        const totalLen = samples.reduce((s, c) => s + c.length, 0);
        const overlapSamples = Math.round(OVERLAP_SECONDS * rate);
        const merged = new Float32Array(totalLen);
        let off = 0;
        for (const c of samples) { merged.set(c, off); off += c.length; }
        const start = Math.max(0, merged.length - overlapSamples);
        overlapRef.current = merged.slice(start);
      }
    }

    processingRef.current = false;
  }, []);

  const flushBuffer = useCallback((force = false) => {
    if (sampleBufferRef.current.length === 0) return;
    const rate = audioContextRef.current?.sampleRate || TARGET_SAMPLE_RATE;
    const targetSamples = Math.round(rate * CHUNK_SECONDS);
    const totalAvailable = sampleBufferRef.current.reduce((s, c) => s + c.length, 0);
    if (!force && totalAvailable < targetSamples) return;

    const toFlush = [...sampleBufferRef.current];
    sampleBufferRef.current = [];

    let samples = toFlush;
    if (overlapRef.current && overlapRef.current.length > 0) {
      samples = [overlapRef.current, ...samples];
    }

    const chunkIndex = chunkIndexRef.current++;
    const totalSamples = samples.reduce((s, c) => s + c.length, 0);
    pushLog("info", "capture", "flushing chunk", {
      chunkIndex,
      chunks: samples.length,
      totalSamples,
      rate,
      durationSec: (totalSamples / rate).toFixed(2),
      remainder: sampleBufferRef.current.reduce((s, c) => s + c.length, 0),
    });

    queueRef.current.push({ samples, rate });
    pushLog("info", "capture", "queued for transcription", { chunkIndex, queueLen: queueRef.current.length, rate });
    processQueue();
  }, [processQueue]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });

      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      pushLog("info", "system", "AudioContext created", { sampleRate: audioContext.sampleRate, state: audioContext.state });

      audioContext.onstatechange = () => {
        pushLog("info", "system", `AudioContext state: ${audioContext.state}`, {});
        if (audioContext.state === "suspended") {
          audioContext.resume().then(() => pushLog("info", "system", "AudioContext resumed", {}));
        }
      };

      const source = audioContext.createMediaStreamSource(stream);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      sampleBufferRef.current = [];
      queueRef.current = [];
      overlapRef.current = null;
      processingRef.current = false;
      chunkIndexRef.current = 0;

      let useWorklet = false;
      let workletNode: AudioWorkletNode | null = null;
      let processor: ScriptProcessorNode | null = null;

      try {
        if (audioContext.audioWorklet) {
          await audioContext.audioWorklet.addModule("/worklets/capture-worklet.js");
          workletNode = new AudioWorkletNode(audioContext, "capture-processor");
          workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
            if (!isListeningRef.current) return;
            sampleBufferRef.current.push(new Float32Array(event.data));
          };
          source.connect(workletNode);
          workletNode.connect(silentGain);
          useWorklet = true;
          pushLog("info", "system", "using AudioWorklet", {});
          workletNodeRef.current = workletNode;
        } else {
          throw new Error("audioWorklet not supported");
        }
      } catch (e) {
        pushLog("warn", "system", "AudioWorklet failed, fallback to ScriptProcessor", { error: String(e) });
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        (processor as ScriptProcessorNode).onaudioprocess = (event: AudioProcessingEvent) => {
          if (!isListeningRef.current) return;
          const inputData = event.inputBuffer.getChannelData(0);
          sampleBufferRef.current.push(new Float32Array(inputData));
        };
        source.connect(processor as ScriptProcessorNode);
        (processor as ScriptProcessorNode).connect(silentGain);
        processorRef.current = processor as ScriptProcessorNode;
        useWorklet = false;
      }

      silentGain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      sourceRef.current = source;
      streamRef.current = stream;

      const totalSamplesPerChunk = audioContext.sampleRate * CHUNK_SECONDS;

      intervalRef.current = setInterval(() => {
        if (audioContext.state === "suspended") {
          audioContext.resume();
          pushLog("warn", "system", "resumed suspended AudioContext in interval", {});
        }
        const totalSamples = sampleBufferRef.current.reduce((sum, s) => sum + s.length, 0);
        if (totalSamples >= totalSamplesPerChunk) {
          flushBuffer();
        }
      }, 1000);

      const visHandler = () => {
        if (document.visibilityState === "visible" && audioContext.state === "suspended") {
          audioContext.resume();
          pushLog("info", "system", "visibilitychange resume", {});
        }
      };
      visibilityHandlerRef.current = visHandler;
      document.addEventListener("visibilitychange", visHandler);

      isListeningRef.current = true;
      setIsListening(true);
      setError(null);
      setStatus(null);
      pushLog("info", "system", "listening started", { chunkSeconds: CHUNK_SECONDS });
    } catch (e) {
      const msg = e instanceof Error ? `Microphone error: ${e.message}` : "Could not access microphone";
      pushLog("error", "system", msg, {});
      setError(msg);
    }
  }, [flushBuffer]);

  const stopListening = useCallback(() => {
    pushLog("info", "system", "stopping", { bufferedSamples: sampleBufferRef.current.reduce((s,c)=>s+c.length,0) });
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (visibilityHandlerRef.current) {
      document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
    }

    if (sampleBufferRef.current.length > 0) {
      (flushBuffer as (force?: boolean) => void)(true);
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (workletNodeRef.current) {
      try { workletNodeRef.current.port.close(); } catch {}
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
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

    isListeningRef.current = false;
    setIsListening(false);
    setStatus(null);
  }, [flushBuffer]);

  const resetTranscript = useCallback(() => {
    pushLog("info", "system", "transcript reset", {});
    setTranscript("");
    sampleBufferRef.current = [];
    queueRef.current = [];
    overlapRef.current = null;
    lastTranscriptTailRef.current = "";
    chunkIndexRef.current = 0;
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
