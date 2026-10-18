import { useEffect, useRef, useState } from 'react';
import { videoSourceTimeAt } from '../../lib/videoPlayback';

export interface VideoPreviewProps {
  src: string;
  poster: string | null;
  trimIn: number;
  trimOut: number;
  loop: boolean;
  /** Absolute document-timeline time (seconds) — same clock every other element's
   * entrance animation reads from (`state.t` in StudioContext), and the same prop
   * `LottiePreview` takes. */
  time: number;
}

/** Roadmap #14 — live Stage preview of a video element: a real `<video>` element,
 * always paused and explicitly seeked to `videoSourceTimeAt(...)` rather than played
 * natively — the same deterministic "seek to the exact frame this instant maps to"
 * contract `LottiePreview`'s `goToAndStop` gives Lottie, so scrubbing the timeline and
 * exporting a frame at the same instant always agree, and playback never drifts out
 * of sync with the document clock. A real side effect of this choice (documented in
 * docs/CONTROLS.md, not hidden): since the element is never actually played, no audio
 * is ever heard in-app — `volume`/`muted` have no in-app effect this pass. Unlike
 * `LottiePreview` (which needs lottie-web's own canvas renderer), a plain `<video>`
 * tag is both the live-preview element and a real decoder, so no extra canvas layer
 * is needed here — only the export path (`videoExportEngine.ts`) needs one, to draw
 * into an offscreen canvas it doesn't otherwise have. */
export function VideoPreview({ src, poster, trimIn, trimOut, loop, time }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setReady(false);
    setError(false);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready || error) return;
    const target = videoSourceTimeAt(trimIn, trimOut, time, loop);
    const clamped = Math.min(target, Math.max(0, video.duration - 0.001));
    if (Number.isFinite(clamped) && Math.abs(video.currentTime - clamped) > 0.01) video.currentTime = clamped;
  }, [time, trimIn, trimOut, loop, ready, error]);

  if (error) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'rgba(217,122,108,.12)', color: '#D97A6C', fontSize: '2.6cqw', textAlign: 'center', padding: '4%' }}>
        ملف فيديو غير صالح
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster ?? undefined}
      muted
      playsInline
      preload="auto"
      onLoadedData={() => setReady(true)}
      onError={() => setError(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
    />
  );
}
