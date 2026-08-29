import { useCallback, useRef } from "react";

export type BleepKind = "warn" | "alarm";

/**
 * A short square-wave blip, synthesised rather than loaded, so it costs no
 * asset and works with the venue wifi down.
 *
 * Audio is a nicety: every path is wrapped so a browser that blocks or lacks
 * the Web Audio API can never take the run down with it.
 */
export function useBleep(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  return useCallback(
    (kind: BleepKind = "warn") => {
      if (!enabled) return;
      try {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;

        const ctx = (ctxRef.current ??= new Ctor());
        // Browsers suspend audio until a gesture; the game is all clicks, so by
        // the time a stat goes bad we have one.
        if (ctx.state === "suspended") void ctx.resume();

        // warn: two quick high blips. alarm: three low ones, more insistent.
        const notes = kind === "alarm" ? [220, 185, 155] : [740, 560];
        const step = kind === "alarm" ? 0.11 : 0.09;
        const t0 = ctx.currentTime;

        notes.forEach((hz, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(hz, t0 + i * step);
          // hard on/off envelope, no fade -- a fade sounds modern, not retro
          gain.gain.setValueAtTime(0.0001, t0 + i * step);
          gain.gain.exponentialRampToValueAtTime(0.05, t0 + i * step + 0.005);
          gain.gain.setValueAtTime(0.05, t0 + i * step + step * 0.62);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * step + step * 0.72);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0 + i * step);
          osc.stop(t0 + i * step + step);
        });
      } catch {
        /* no audio, no problem */
      }
    },
    [enabled]
  );
}
