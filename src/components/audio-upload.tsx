"use client";

import { useState, useRef } from "react";
import { pushLog } from "@/lib/debug-log";

export function AudioUpload() {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setTranscript(null);
    setLanguage(null);
    setIsTranscribing(true);

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    pushLog("info", "transcribe", "uploading file", { name: file.name, size: file.size, type: file.type });

    try {
      const formData = new FormData();
      formData.append("audio", file, file.name);

      const t0 = Date.now();
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const latency = Date.now() - t0;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Transcription failed: ${res.status}`);
      }

      const data = await res.json();
      pushLog("info", "transcribe", "upload transcribed", {
        latencyMs: latency,
        language: data.language,
        textLen: data.text?.length || 0,
        textPreview: data.text?.slice(0, 80) || "",
      });

      setTranscript(data.text || "");
      setLanguage(data.language || null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      pushLog("error", "transcribe", "upload failed", { error: msg });
      setError(msg);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-800">Test Audio Directly (bypass mic)</h3>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.opus,.ogg,.wav,.mp3,.m4a,.webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isTranscribing}
          className="px-3 py-1.5 rounded text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {isTranscribing ? "Transcribing..." : "Upload Audio"}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Drag your WhatsApp <code>.opus</code> here to test Groq directly without speaker re-recording. Compares mic vs file accuracy.
      </p>

      {audioUrl && (
        <audio controls src={audioUrl} className="w-full" />
      )}

      {isTranscribing && (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Sending to Groq...
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
      )}

      {transcript !== null && (
        <div className="p-3 bg-gray-50 rounded border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Transcript {language && `(detected: ${language})`}:</p>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{transcript || "(empty)"}</p>
        </div>
      )}
    </div>
  );
}
