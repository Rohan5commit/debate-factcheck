"use client";

import { useEffect, useRef, useState } from "react";
import { pushLog } from "@/lib/debug-log";

export function MicLevel({ active }: { active: boolean }) {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number>(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AudioCtx =
          (window as unknown as Record<string, new () => AudioContext>).AudioContext ||
          (window as unknown as Record<string, new () => AudioContext>).webkitAudioContext;
        ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setLevel(Math.min(1, rms * 3));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();

        cleanupRef.current = () => {
          cancelAnimationFrame(rafRef.current);
          try { source.disconnect(); } catch {}
          try { analyser.disconnect(); } catch {}
          ctx?.close().catch(() => {});
          stream?.getTracks().forEach((t) => t.stop());
        };
      } catch (e) {
        pushLog("error", "system", "mic meter failed", { error: String(e) });
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [active]);

  if (!active) return null;

  const pct = Math.round(level * 100);
  const color = pct < 5 ? "bg-gray-300" : pct < 30 ? "bg-yellow-400" : "bg-green-500";

  return (
    <span className="flex items-center gap-2 text-xs text-gray-600" title="Mic input level">
      <span className="text-gray-500">Mic</span>
      <span className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden inline-block">
        <span className={`h-full block rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-gray-400 w-8">{pct}%</span>
    </span>
  );
}
