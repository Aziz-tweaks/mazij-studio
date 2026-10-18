import lottie, { type AnimationItem } from 'lottie-web';
import { lottieFrameAt, parseLottieMeta } from './lottiePlayback';

/** Roadmap #13 — the export-side counterpart to `LottiePreview.tsx`: renders a
 * Lottie element's current frame into a real `<canvas>` so `exportArtboard.ts` can
 * `drawImage` it straight into the PNG/video frame being composited, through the
 * exact same `parseLottieMeta`/`lottieFrameAt` math the live preview uses — so a
 * video frame and what the scrubber showed at the same instant are pixel-identical,
 * never a reimplementation or an approximation.
 *
 * lottie-web's canvas renderer sizes its internal canvas from its *container's*
 * `offsetWidth`/`offsetHeight` (real CSS layout, not an explicit width/height param),
 * so the container has to actually be in the document to get a non-zero size — it's
 * kept off-screen via `position:fixed; left:-99999px` rather than `display:none`
 * (which reports 0 size) or simply never attached (same reason). Instances are keyed
 * by element id and cached across frames within one export run (recreating a
 * lottie-web player per frame of a multi-hundred-frame video would be needlessly
 * slow) and must be torn down with `resetLottieExportEngine()` once an export
 * finishes, or the hidden canvases/DOM nodes leak across runs. */

interface Entry {
  anim: AnimationItem;
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  json: string;
  w: number;
  h: number;
}

const cache = new Map<string, Entry>();

function createEntry(json: string, pxW: number, pxH: number): Entry {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = `${pxW}px`;
  container.style.height = `${pxH}px`;
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);
  const anim = lottie.loadAnimation({
    container,
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: JSON.parse(json),
    rendererSettings: { clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
  });
  const canvas = container.querySelector('canvas') as HTMLCanvasElement;
  return { anim, container, canvas, json, w: pxW, h: pxH };
}

function disposeEntry(entry: Entry) {
  entry.anim.destroy();
  entry.container.remove();
}

/** Returns the canvas holding the Lottie frame visible at `time` (seconds, absolute
 * document-timeline time), creating or recreating the cached player for `key` as
 * needed (data or pixel size changed since last call). */
export function getLottieExportFrame(key: string, json: string, pxW: number, pxH: number, time: number, loop: boolean): HTMLCanvasElement {
  const w = Math.max(1, Math.round(pxW));
  const h = Math.max(1, Math.round(pxH));
  let entry = cache.get(key);
  if (!entry || entry.json !== json || entry.w !== w || entry.h !== h) {
    if (entry) disposeEntry(entry);
    entry = createEntry(json, w, h);
    cache.set(key, entry);
  }
  const meta = parseLottieMeta(json);
  const frame = lottieFrameAt(meta, time, loop);
  entry.anim.goToAndStop(frame, true);
  return entry.canvas;
}

/** Tears down every cached player/hidden container — called once an export run
 * (single PNG or a whole video/GIF frame sequence) finishes, so repeated exports
 * never accumulate hidden canvases on the page. */
export function resetLottieExportEngine(): void {
  for (const entry of cache.values()) disposeEntry(entry);
  cache.clear();
}
