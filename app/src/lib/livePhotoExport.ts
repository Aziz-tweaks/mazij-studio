import { homeDir, join } from '@tauri-apps/api/path';
import { mkdir, remove, writeFile } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { TIMELINE_DURATION } from './animTimeline';
import { renderArtboardFrames, type ArtboardRenderSpec } from './exportArtboard';

// Roadmap #23 — see docs/ROADMAP-PROGRESS.md "#23 — مواصفة تصدير الصورة الحية"
// and docs/CONTROLS.md for the architecture decision (native AVFoundation tool,
// not FFmpeg, authors the timed metadata track FFmpeg can't reliably produce).
export const LIVE_PHOTO_FPS = 24;
export const LIVE_PHOTO_MIN_DURATION = 1.5;
export const LIVE_PHOTO_MAX_DURATION = 3;
export const LIVE_PHOTO_DEFAULT_DURATION = 2.2;

export interface LivePhotoResult {
  stillPath: string;
  movPath: string;
  contentId: string;
}

const FRAME_DIGITS = 5;
function frameFileName(index: number): string {
  return `frame-${String(index + 1).padStart(FRAME_DIGITS, '0')}.png`;
}

/** Spawns the compiled `livephoto` AVFoundation sidecar (see
 * src-tauri/native/livephoto/main.swift) and reports progress parsed from its
 * own `frame=N` stdout lines during the `mov` subcommand — the same
 * machine-readable-progress pattern `runFfmpeg` in videoExport.ts uses. */
async function runLivePhotoTool(args: string[], onFrame?: (frame: number) => void): Promise<void> {
  const command = Command.sidecar('binaries/livephoto', args);
  let stderr = '';
  command.stderr.on('data', (line: string) => {
    stderr += `${line}\n`;
  });
  command.stdout.on('data', (line: string) => {
    const m = /^frame=(\d+)/.exec(line.trim());
    if (m && onFrame) onFrame(parseInt(m[1], 10));
  });

  await new Promise<void>((resolve, reject) => {
    command.on('close', (data) => {
      if (data.code === 0) resolve();
      else reject(new Error(`livephoto tool (${args[0]}) exited with code ${data.code}\n${stderr.slice(-4000)}`));
    });
    command.on('error', (err) => reject(new Error(String(err))));
    command.spawn().catch(reject);
  });
}

/** Hands an exported Live Photo pair to the macOS Photos library, which pairs
 * them into one real Live Photo asset (iCloud then carries it to the iPhone as
 * one).
 *
 * This exists because the folder of two files `exportLivePhoto` writes is not,
 * by itself, usable by a human: copying or AirDropping a JPEG and a MOV sends
 * them as two independent items and nothing in that path ever performs the
 * pairing, so the iPhone shows a plain video. Only a photo library does the
 * pairing, via PhotoKit's `.pairedVideo` resource — see the `import` subcommand
 * in src-tauri/native/livephoto/main.swift.
 *
 * Rejects with the sidecar's own stderr text, which carries the actionable case
 * (denied Photos permission) in a form the dialog can show verbatim. */
export async function addLivePhotoToPhotos(stillPath: string, movPath: string): Promise<void> {
  await runLivePhotoTool(['import', '--still', stillPath, '--mov', movPath]);
}

/** Exports an iOS Live Photo pair: a still JPEG and a paired MOV, bound by a
 * shared content identifier UUID, into their own folder under
 * `~/Mazij/Exports` so the pair can be AirDropped or imported together.
 *
 * The video window is a short clip (`durationSeconds`, clamped to Apple's
 * documented 1.5-3s range) centered on `playheadTime` (clamped into the
 * timeline), rendered at a fixed 24fps (within Apple's 12-30fps range) via the
 * same `renderArtboardFrames` canvas path PNG/MP4 export use. The still frame
 * is snapped to the nearest frame boundary inside that window and re-encoded
 * from the *exact same rendered PNG* the video frame sequence already wrote —
 * so the still and the video's corresponding frame are pixel-sourced
 * identically, not independently rendered and merely close.
 */
export async function exportLivePhoto(
  spec: Omit<ArtboardRenderSpec, 'time' | 'transparent'>,
  playheadTime: number,
  durationSeconds: number,
  quality: 'high' | 'med',
  destBaseName: string,
  onProgress: (fraction: number) => void,
): Promise<LivePhotoResult> {
  const fps = LIVE_PHOTO_FPS;
  const duration = Math.min(LIVE_PHOTO_MAX_DURATION, Math.max(LIVE_PHOTO_MIN_DURATION, durationSeconds));
  const frameCount = Math.max(1, Math.round(duration * fps));
  const windowStart = Math.min(Math.max(playheadTime - duration / 2, 0), Math.max(0, TIMELINE_DURATION - duration));
  const frameTimes = Array.from({ length: frameCount }, (_, i) => windowStart + i / fps);
  const stillIndex = Math.min(frameCount - 1, Math.max(0, Math.round((playheadTime - windowStart) * fps)));
  const stillRelativeTime = stillIndex / fps;

  const home = await homeDir();
  const exportsDir = await join(home, 'Mazij', 'Exports', destBaseName);
  await mkdir(exportsDir, { recursive: true });
  const tmpDir = await join(home, 'Mazij', 'export-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });

  // Uppercase to match Apple's own example formatting (`E6B3F063-...`) in the
  // roadmap spec — the UUID's case doesn't matter for matching, only that both
  // files carry the exact same literal string, which they do either way.
  const contentId = crypto.randomUUID().toUpperCase();
  // Matching basenames (only the extension differs) is the convention every
  // Live Photo authoring tool follows for Finder/AirDrop pairing, alongside the
  // shared content identifier that's the actual binding mechanism.
  const stillPath = await join(exportsDir, `${destBaseName}.jpg`);
  const movPath = await join(exportsDir, `${destBaseName}.MOV`);

  try {
    let rendered = 0;
    let stillFramePath = '';
    await renderArtboardFrames({ ...spec, transparent: false }, frameTimes, async (blob, i) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const framePath = await join(tmpDir, frameFileName(i));
      await writeFile(framePath, bytes);
      if (i === stillIndex) stillFramePath = framePath;
      rendered += 1;
      onProgress((rendered / frameCount) * 0.45);
    });

    await runLivePhotoTool(['still', '--in', stillFramePath, '--out', stillPath, '--content-id', contentId, '--quality', quality]);
    onProgress(0.5);

    await runLivePhotoTool(
      ['mov', '--frames-dir', tmpDir, '--fps', String(fps), '--out', movPath, '--content-id', contentId, '--still-time', String(stillRelativeTime), '--quality', quality],
      (f) => onProgress(0.5 + (f / frameCount) * 0.5),
    );
    onProgress(1);

    return { stillPath, movPath, contentId };
  } finally {
    await remove(tmpDir, { recursive: true }).catch(() => undefined);
  }
}
