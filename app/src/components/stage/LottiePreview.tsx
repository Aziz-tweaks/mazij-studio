import { useEffect, useMemo, useRef } from 'react';
import lottie, { type AnimationItem } from 'lottie-web';
import { lottieFrameAt, parseLottieMeta } from '../../lib/lottiePlayback';

export interface LottiePreviewProps {
  data: string;
  loop: boolean;
  /** Absolute document-timeline time (seconds) — same clock every other element's
   * entrance animation reads from (`state.t` in StudioContext). */
  time: number;
}

/** Roadmap #13 — live Stage preview of a Lottie element: a canvas-renderer lottie-web
 * instance seeked to the document timeline's current time via the exact same
 * `parseLottieMeta`/`lottieFrameAt` math `lottieExportEngine.ts` uses for PNG/video
 * export, so scrubbing the timeline and exporting a frame at the same instant always
 * agree. Canvas renderer (not SVG) specifically so the live preview and the export
 * path share one rendering engine, not two that could silently drift apart. */
export function LottiePreview({ data, loop, time }: LottiePreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const meta = useMemo(() => {
    try {
      return parseLottieMeta(data);
    } catch {
      return null;
    }
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !meta) return;
    let anim: AnimationItem;
    try {
      anim = lottie.loadAnimation({
        container,
        renderer: 'canvas',
        loop: false,
        autoplay: false,
        animationData: JSON.parse(data),
        rendererSettings: { clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
      });
    } catch {
      return;
    }
    animRef.current = anim;
    // ResizeObserver delivers one synchronous initial callback as soon as it starts
    // observing, with the container's *current* (already-correct, just-measured-by
    // lottie-web-itself) size — calling `anim.resize()` for that first callback is not
    // just redundant: lottie-web's canvas renderer reassigns `canvas.width/height`
    // inside `resize()`, which the browser always treats as "clear this canvas and
    // reset its 2D context state" (fillStyle back to the native default, black) even
    // when the numeric value doesn't change — but lottie-web's own internal fill-style
    // cache (`CVContextData`) isn't aware of that reset, so the *next* paint of an
    // unchanged color skips re-applying it to the native context and silently paints
    // black. Only real subsequent size changes (the element being resized on the
    // artboard) should call `resize()`.
    let firstObservation = true;
    const ro = new ResizeObserver(() => {
      if (firstObservation) {
        firstObservation = false;
        return;
      }
      anim.resize();
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      anim.destroy();
      animRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-creating the player on every `time` tick would defeat the point of goToAndStop below
  }, [data]);

  useEffect(() => {
    if (!animRef.current || !meta) return;
    animRef.current.goToAndStop(lottieFrameAt(meta, time, loop), true);
  }, [time, loop, meta]);

  if (!meta) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'rgba(255,107,107,.12)', color: 'var(--danger)', fontSize: '2.6cqw', textAlign: 'center', padding: '4%' }}>
        ملف Lottie غير صالح
      </div>
    );
  }
  return <div ref={containerRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
