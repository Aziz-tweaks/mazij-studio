/** Roadmap #13 — pure time/frame math for Lottie playback, shared by the live Stage
 * preview (`LottiePreview.tsx`) and the export frame renderer (`lottieExportEngine.ts`
 * via `exportArtboard.ts`), so a video frame and what the scrubber showed at the same
 * instant are guaranteed to agree — same "one shared formula" discipline the rest of
 * the app already follows for `anim.tracks` (`animTimeline.ts`) and text stagger
 * (`textStagger.ts`). No DOM/lottie-web dependency here — just arithmetic, so it's
 * cheap to unit-test and to call before any player instance exists. */

export interface LottieMeta {
  /** Duration of the animation's own frame range (`op - ip`), in frames. Always >= 1. */
  totalFrames: number;
  frameRate: number;
  /** Intrinsic size from the JSON's own `w`/`h` fields. */
  w: number;
  h: number;
  /** `totalFrames / frameRate`, guarded against a zero/garbage frame rate. */
  durationSeconds: number;
}

/** Reads just the header fields a bodymovin/Lottie JSON always carries (`w`, `h`,
 * `fr`, `ip`, `op`) — never a full lottie-web load, so computing metadata doesn't
 * require a player instance or a DOM container at all. Throws on invalid JSON or a
 * document missing the required numeric fields, so a corrupt/non-Lottie file is
 * rejected at import time instead of silently producing a frozen/blank element. */
export function parseLottieMeta(json: string): LottieMeta {
  const data = JSON.parse(json) as { w?: unknown; h?: unknown; fr?: unknown; ip?: unknown; op?: unknown };
  const w = Number(data.w);
  const h = Number(data.h);
  const fr = Number(data.fr);
  const ip = Number(data.ip ?? 0);
  const op = Number(data.op);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error('ملف Lottie بلا أبعاد صالحة (w/h)');
  if (!Number.isFinite(fr) || fr <= 0) throw new Error('ملف Lottie بلا معدل إطارات صالح (fr)');
  if (!Number.isFinite(op)) throw new Error('ملف Lottie بلا نقطة نهاية صالحة (op)');
  const totalFrames = Math.max(1, op - ip);
  return { totalFrames, frameRate: fr, w, h, durationSeconds: totalFrames / fr };
}

/** Maps an absolute document-timeline time (seconds) to the 0-based frame
 * (relative to the animation's own `ip`, which is what `AnimationItem.goToAndStop`
 * expects) that should be on-screen at that instant. `loop` repeats the native
 * animation for as long as the document timeline runs; otherwise it clamps to the
 * last frame once the native duration has elapsed (same "freeze past the end"
 * convention `localClipTime` uses in `animTimeline.ts`). Deterministic and
 * side-effect-free — the only place either renderer decides which frame to show. */
export function lottieFrameAt(meta: LottieMeta, time: number, loop: boolean): number {
  if (meta.durationSeconds <= 0) return 0;
  const t = Math.max(0, time);
  const localSeconds = loop ? t % meta.durationSeconds : Math.min(t, meta.durationSeconds);
  const frame = (localSeconds / meta.durationSeconds) * meta.totalFrames;
  // Exclusive upper bound: frame === totalFrames would be one past the last valid
  // frame (op is the exclusive end in the Lottie spec), so clamp just under it.
  return Math.min(meta.totalFrames - 0.001, frame);
}
