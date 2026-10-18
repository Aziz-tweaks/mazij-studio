import { videoSourceTimeAt } from './videoPlayback';

/** Roadmap #14 — the export-side counterpart to `VideoPreview.tsx`: seeks a real
 * hidden `<video>` element to the exact source instant `videoSourceTimeAt` computes
 * and hands the caller (`exportArtboard.ts`'s `drawElements`) the element itself to
 * `drawImage` straight into the PNG/video frame being composited — a genuine decoded
 * frame from the source file, never a placeholder box. Same "shared pure time math,
 * separate rendering engine for export vs. live preview" split `lottiePlayback.ts`/
 * `lottieExportEngine.ts` use for Lottie, and the same reason the element is kept
 * off-screen (`position:fixed; left:-99999px`) rather than `display:none` (which can
 * make some engines skip decoding entirely) or never attached (same risk).
 *
 * Instances are keyed by element id and cached across frames within one export run
 * (reloading a multi-megabyte video per frame of a multi-hundred-frame export would
 * be needlessly slow) and must be torn down with `resetVideoExportEngine()` once an
 * export finishes, or the hidden `<video>` elements leak across runs. */

interface Entry {
  video: HTMLVideoElement;
  src: string;
  ready: Promise<void>;
}

const cache = new Map<string, Entry>();

function createEntry(src: string): Entry {
  const video = document.createElement('video');
  video.style.position = 'fixed';
  video.style.left = '-99999px';
  video.style.top = '0';
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  document.body.appendChild(video);
  const ready = new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('فشل تحميل الفيديو للتصدير'));
    video.src = src;
  });
  return { video, src, ready };
}

function disposeEntry(entry: Entry) {
  entry.video.src = '';
  entry.video.remove();
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  // Already-at-target (within a sub-frame epsilon) seeks never fire 'seeked' on some
  // engines — resolve immediately rather than waiting on an event that won't come.
  if (Math.abs(video.currentTime - time) < 0.001) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('فشل البحث داخل الفيديو عند التصدير'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

/** Returns the `<video>` element holding the real decoded frame visible at `time`
 * (seconds, absolute document-timeline time), creating or recreating the cached
 * player for `key` as needed (source changed since last call). */
export async function getVideoExportFrame(key: string, src: string, time: number, trimIn: number, trimOut: number, loop: boolean): Promise<HTMLVideoElement> {
  let entry = cache.get(key);
  if (!entry || entry.src !== src) {
    if (entry) disposeEntry(entry);
    entry = createEntry(src);
    cache.set(key, entry);
  }
  await entry.ready;
  const sourceTime = videoSourceTimeAt(trimIn, trimOut, time, loop);
  await seekTo(entry.video, Math.min(sourceTime, Math.max(0, entry.video.duration - 0.001)));
  return entry.video;
}

/** Tears down every cached player/hidden element — called once an export run (single
 * PNG or a whole video/GIF frame sequence) finishes, so repeated exports never
 * accumulate hidden `<video>` elements on the page. */
export function resetVideoExportEngine(): void {
  for (const entry of cache.values()) disposeEntry(entry);
  cache.clear();
}
