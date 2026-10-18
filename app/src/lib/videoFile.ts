import { inTauri } from './tauriEnv';

export interface LoadedVideo {
  dataUrl: string;
  naturalW: number;
  naturalH: number;
  durationSec: number;
  /** Null only if the probe/thumbnail step itself failed — never a placeholder image. */
  poster: string | null;
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(binary)}`;
}

function mimeFromExt(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  return 'video/mp4'; // ffmpeg already validated the bytes by the time this is used — the exact mime only affects how <video> sniffs it, not whether the data is accepted
}

const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const RESOLUTION_RE = /Video:[^\n]*?(\d{2,5})x(\d{2,5})/;

/** Loads a `<video>` element from a data URL and resolves once its metadata (hence
 * `duration`/`videoWidth`/`videoHeight`) is available, or rejects if the browser's own
 * decoder can't make sense of it — the browser-dev-preview fallback for both probing
 * (no FFmpeg sidecar there) and thumbnail capture below. */
function loadVideoMeta(dataUrl: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('تعذّر قراءة الفيديو — الصيغة غير مدعومة'));
    video.src = dataUrl;
  });
}

/** Captures a representative frame from an already-loaded `<video>` as a PNG data
 * URL — the browser-side counterpart to the FFmpeg frame-extraction path below. */
function captureVideoFrame(video: HTMLVideoElement, atSec: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('تعذّر إنشاء سطح رسم للقطة الفيديو'));
      ctx.drawImage(video, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.min(atSec, Math.max(0, video.duration - 0.01));
  });
}

/** Probes a real file on disk with the bundled FFmpeg sidecar and extracts a
 * thumbnail frame — Tauri-only (spawns a real child process), exactly like
 * `detectReferenceVideoStructure` in `referenceVideo.ts`. Deliberately validates by
 * actually asking FFmpeg to read the file rather than checking its extension against
 * a fixed allowlist — any container/codec FFmpeg itself can decode is accepted,
 * and anything it can't is rejected with FFmpeg's own real failure, not a guess. */
async function probeAndThumbnailViaFfmpeg(filePath: string, tmpDir: string): Promise<{ durationSec: number; naturalW: number; naturalH: number; poster: string | null }> {
  const { Command } = await import('@tauri-apps/plugin-shell');
  // No output at all: FFmpeg always prints its input-analysis banner (Duration +
  // per-stream Video:/Audio: lines) to stderr before it even checks for an output
  // file, so this is a metadata-only probe — no real decode, no wasted time on a
  // long source file.
  const probe = Command.sidecar('binaries/ffmpeg', ['-i', filePath]);
  let stderr = '';
  probe.stderr.on('data', (line: string) => {
    stderr += `${line}\n`;
  });
  await new Promise<void>((resolve, reject) => {
    probe.on('close', () => resolve()); // nonzero exit (no output file) is expected — see comment above
    probe.on('error', (err) => reject(new Error(String(err))));
    probe.spawn().catch(reject);
  });

  const durationMatch = DURATION_RE.exec(stderr);
  const resMatch = RESOLUTION_RE.exec(stderr);
  if (!durationMatch || !resMatch) {
    throw new Error('تعذّر قراءة الفيديو — ليس ملف فيديو صالحًا أو الصيغة غير مدعومة');
  }
  const durationSec = parseInt(durationMatch[1], 10) * 3600 + parseInt(durationMatch[2], 10) * 60 + parseFloat(durationMatch[3]);
  const naturalW = parseInt(resMatch[1], 10);
  const naturalH = parseInt(resMatch[2], 10);
  if (!(durationSec > 0) || !(naturalW > 0) || !(naturalH > 0)) {
    throw new Error('تعذّر قراءة الفيديو — بيانات الأبعاد/المدة غير صالحة');
  }

  const { join } = await import('@tauri-apps/api/path');
  const { readFile, remove } = await import('@tauri-apps/plugin-fs');
  const posterPath = await join(tmpDir, 'poster.png');
  const atSec = Math.min(0.15, durationSec / 4);
  let poster: string | null = null;
  try {
    const extract = Command.sidecar('binaries/ffmpeg', ['-y', '-ss', String(atSec), '-i', filePath, '-frames:v', '1', '-f', 'image2', posterPath]);
    await new Promise<void>((resolve, reject) => {
      extract.on('close', () => resolve());
      extract.on('error', (err) => reject(new Error(String(err))));
      extract.spawn().catch(reject);
    });
    const bytes = await readFile(posterPath);
    poster = bytesToDataUrl(bytes, 'image/png');
  } catch {
    poster = null; // a missing thumbnail is an honest gap, never a fabricated placeholder image
  } finally {
    await remove(posterPath).catch(() => undefined);
  }

  return { durationSec, naturalW, naturalH, poster };
}

/** Exported so `aiProviders.ts` (roadmap #22) can turn a provider's raw returned
 * video bytes into exactly the same `LoadedVideo` shape a real file import
 * produces — same FFmpeg-probe-in-Tauri / `<video>`-metadata-in-browser path, no
 * parallel decode logic for AI-generated clips. */
export async function decodeVideoBytes(bytes: Uint8Array, filename: string): Promise<LoadedVideo> {
  const dataUrl = bytesToDataUrl(bytes, mimeFromExt(filename));

  if (inTauri) {
    const { homeDir, join } = await import('@tauri-apps/api/path');
    const { mkdir, writeFile, remove } = await import('@tauri-apps/plugin-fs');
    const home = await homeDir();
    const tmpDir = await join(home, 'Mazij', 'import-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    const ext = filename.split('.').pop()?.toLowerCase() || 'mp4';
    const tmpInput = await join(tmpDir, `source.${ext}`);
    try {
      await writeFile(tmpInput, bytes);
      const probed = await probeAndThumbnailViaFfmpeg(tmpInput, tmpDir);
      return { dataUrl, naturalW: probed.naturalW, naturalH: probed.naturalH, durationSec: probed.durationSec, poster: probed.poster };
    } finally {
      await remove(tmpDir, { recursive: true }).catch(() => undefined);
    }
  }

  // Browser/dev-preview fallback: no FFmpeg sidecar, so the browser's own decoder is
  // both the validator and the metadata/thumbnail source — same "no simulated result"
  // discipline as `detectReferenceVideoStructure`'s Tauri-only limitation, except here
  // a real (just less capable) fallback exists instead of a hard error, matching how
  // `pickImageFile`/`pickLottieFile` behave outside Tauri.
  const video = await loadVideoMeta(dataUrl);
  try {
    const poster = await captureVideoFrame(video, Math.min(0.15, video.duration / 4)).catch(() => null);
    return { dataUrl, naturalW: video.videoWidth, naturalH: video.videoHeight, durationSec: video.duration, poster };
  } finally {
    video.src = '';
  }
}

/** Opens a real native file picker (Tauri dialog) and loads the chosen video —
 * same "no simulated pick" discipline as `pickImageFile`/`pickLottieFile`. No
 * extension filter on the dialog itself (so it never rejects a valid file FFmpeg
 * could otherwise read) — validity is decided by whether FFmpeg/the browser can
 * actually probe it, not by its filename. Falls back to a hidden
 * `<input type="file">` in the plain browser/dev preview. */
export async function pickVideoFile(): Promise<LoadedVideo | null> {
  if (inTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false });
    if (!path || typeof path !== 'string') return null;
    const bytes = await readFile(path);
    return decodeVideoBytes(bytes, path);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    let settled = false;
    const finish = (value: LoadedVideo | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      resolve(value);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      finish(await readVideoFile(file).catch(() => null));
    };
    input.addEventListener('cancel', () => finish(null));
    function onWindowFocus() {
      setTimeout(() => {
        if (!settled && !input.files?.length) finish(null);
      }, 300);
    }
    window.addEventListener('focus', onWindowFocus);
    input.click();
  });
}

/** Reads a dropped/picked `File` (drag-and-drop or the browser-fallback input) —
 * the counterpart to `readImageFile`/`readLottieFile`. */
export async function readVideoFile(file: File): Promise<LoadedVideo> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return decodeVideoBytes(bytes, file.name);
}
