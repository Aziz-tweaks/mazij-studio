/** Roadmap #14 — pure time math for `VideoElement` playback, shared by the live
 * Stage preview (`VideoPreview.tsx`) and the export frame renderer
 * (`videoExportEngine.ts`, via `exportArtboard.ts`), so a video frame and what the
 * scrubber showed at the same instant are guaranteed to agree. Deliberately the same
 * "local time within a window, loop or clamp" shape as `lottieFrameAt` in
 * `lottiePlayback.ts` — see that file's own doc comment — just operating on seconds
 * within the trimmed source window instead of native animation frames. No DOM/video
 * dependency here, so it's cheap to unit-test and to call before any `<video>`
 * element exists. */

/** Maps an absolute document-timeline time (seconds) to the source-file time
 * (seconds) that should be on-screen at that instant, given the clip's trim window
 * `[trimIn, trimOut)`. `loop` repeats the trimmed window for as long as the document
 * timeline runs; otherwise it clamps to the window's last instant once its own
 * duration has elapsed — the same "freeze past the end" convention `lottieFrameAt`
 * and `localClipTime` (`animTimeline.ts`) both use. Deterministic and side-effect-free. */
export function videoSourceTimeAt(trimIn: number, trimOut: number, time: number, loop: boolean): number {
  const duration = Math.max(0.001, trimOut - trimIn);
  const t = Math.max(0, time);
  const local = loop ? t % duration : Math.min(t, duration);
  // Exclusive upper bound, same reasoning as `lottieFrameAt`'s `totalFrames - 0.001`:
  // landing exactly on `trimOut` can seek one instant past the trimmed window's last
  // real frame on some decoders.
  return trimIn + Math.min(duration - 0.001, local);
}
