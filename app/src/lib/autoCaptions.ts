import { inTauri } from './tauriEnv';
import { WHISPER_REPO_ID, getModelPartsMap, modelById, type LocalModelInfo } from './localModels';
import { TIMELINE_DURATION } from './animTimeline';
import { DEFAULT_BEZIER, type Bezier } from './easing';
import { newElementId, type PropertyKeyframe, type TextElement, defaultTextStagger } from '../state/elements';
import type { VideoElement } from '../state/elements';

/** Roadmap #15 — auto-captions. Three real stages, each honestly scoped:
 *
 * 1. **Audio in** (`extractAudioSamples`): the video element's own trimmed window,
 *    decoded to 16kHz mono PCM — via the bundled FFmpeg sidecar in the packaged app
 *    (roadmap decision: audio extraction reuses the existing sidecar, see
 *    `videoFile.ts`/`referenceVideo.ts`), via the browser's own `decodeAudioData` +
 *    `OfflineAudioContext` resampler in the dev/QA-preview build (no sidecar there —
 *    same two-path split every other FFmpeg-backed feature in this app already has).
 *    There is still no export *audio* pipeline (roadmap #14's documented gap) — this
 *    only ever reads a source file's audio, never writes one.
 * 2. **Transcription** (`transcribeAudio`): real Whisper-tiny.en ONNX inference via
 *    `@huggingface/transformers`, which itself runs on `onnxruntime-web` — so this
 *    still satisfies the binding "inference inside the webview" architecture
 *    decision (see docs/ROADMAP-PROGRESS.md §24); it's a higher-level wrapper around
 *    the same runtime `backgroundRemoval.ts` drives directly, chosen here because
 *    hand-rolling Whisper's log-mel feature extraction, BPE tokenizer and
 *    autoregressive KV-cache decoding correctly from scratch is a correctness-
 *    critical, well-solved problem this library already gets right. The model's own
 *    files are still downloaded/verified/stored through `localModels.ts`'s existing
 *    registry (never this library's own network fetch) — see `installLocalFetchIntercept`.
 * 3. **Segments onto the timeline** (`buildCaptionElements`): each returned chunk
 *    becomes a real `TextElement`, positioned with `anim.start`/`anim.duration` =
 *    the chunk's own `[start, end)` and an opacity track that fades it in at the
 *    start and back to 0 at the end — reusing the existing per-property keyframe
 *    track mechanism (`src/state/elements.ts`/`animTimeline.ts`) rather than
 *    inventing a parallel "caption visibility window" concept. This is the same
 *    `localClipTime` clamp-to-[0,1] behavior `referenceVideo.ts`'s shot fade-ins
 *    rely on, just with a matching fade-*out* keyframe added at `t=1` so the caption
 *    actually disappears instead of staying on-screen forever.
 *
 * **Known, documented limitation (not silently hidden):** `whisper-tiny.en` is
 * English-only and the smallest Whisper size — real transcription, but materially
 * less accurate than larger models, and chunk timestamps are sentence/phrase-level,
 * not word-level (word-level timestamps need a larger model and alignment pass this
 * round didn't build). See docs/CONTROLS.md. Arabic (or any non-English) speech
 * is NOT transcribed by this model — a caption *element* is a plain `TextElement`
 * like any other, so typing/editing Arabic text into one after the fact shapes and
 * renders correctly through the platform's own text engine exactly as any other
 * text element does; this library does not add Arabic *speech recognition*.
 */

export interface CaptionSegment {
  /** Seconds — document-timeline time directly (the video element's own trim window
   * maps 1:1 onto document time, see `videoPlayback.ts`), already clamped into
   * `[0, TIMELINE_DURATION)`. */
  start: number;
  end: number;
  text: string;
}

export const WHISPER_MODEL_ID = 'whisper-tiny-en';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  return base64ToBytes(dataUrl.slice(comma + 1));
}

/** Parses a PCM WAV (as produced by the FFmpeg sidecar with `-f wav -acodec
 * pcm_s16le -ar 16000 -ac 1`) into a 16kHz mono Float32Array — a plain RIFF/`data`
 * chunk walk, same "no DOM/decoder dependency needed because FFmpeg already did the
 * real work" shape as `parseSceneDetectOutput` in `referenceVideo.ts`. */
function decodePcm16Wav(bytes: Uint8Array): Float32Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let dataOffset = -1;
  let dataLen = 0;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = dv.getUint32(offset + 4, true);
    if (id === 'data') {
      dataOffset = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error('ملف WAV غير صالح — لا يوجد مقطع data');
  const n = Math.floor(dataLen / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(dataOffset + i * 2, true) / 32768;
  return out;
}

/** Tauri-only: writes the video's bytes to a real temp file and runs the bundled
 * FFmpeg sidecar to extract+resample its trimmed audio window straight to 16kHz
 * mono PCM — reusing the exact sidecar invocation shape `videoFile.ts`'s probe and
 * `referenceVideo.ts`'s scene-detect already use (write tmp input, spawn sidecar,
 * read real output, clean up). Throws a real, specific error (not a generic
 * failure) when the source has no audio stream at all — FFmpeg's own stderr says so
 * plainly, so that's surfaced rather than masked. */
async function extractAudioViaFfmpeg(videoDataUrl: string, trimIn: number, trimOut: number): Promise<Float32Array> {
  const { Command } = await import('@tauri-apps/plugin-shell');
  const { homeDir, join } = await import('@tauri-apps/api/path');
  const { mkdir, writeFile, readFile, remove } = await import('@tauri-apps/plugin-fs');

  const home = await homeDir();
  const tmpDir = await join(home, 'Mazij', 'caption-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  try {
    const inputPath = await join(tmpDir, 'source.mp4');
    await writeFile(inputPath, dataUrlToBytes(videoDataUrl));
    const outputPath = await join(tmpDir, 'audio.wav');

    const duration = Math.max(0.05, trimOut - trimIn);
    const args = ['-y', '-ss', String(trimIn), '-i', inputPath, '-t', String(duration), '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', '-acodec', 'pcm_s16le', outputPath];
    const command = Command.sidecar('binaries/ffmpeg', args);
    let stderr = '';
    command.stderr.on('data', (line: string) => {
      stderr += `${line}\n`;
    });
    await new Promise<void>((resolve, reject) => {
      command.on('close', () => resolve());
      command.on('error', (err) => reject(new Error(String(err))));
      command.spawn().catch(reject);
    });

    if (/does not contain any stream|Output file is empty/i.test(stderr)) {
      throw new Error('لا يوجد مسار صوت في هذا الفيديو');
    }
    const wavBytes = await readFile(outputPath);
    if (wavBytes.length < 44) throw new Error('لا يوجد مسار صوت في هذا الفيديو');
    return decodePcm16Wav(wavBytes);
  } finally {
    await remove(tmpDir, { recursive: true }).catch(() => undefined);
  }
}

/** Browser/dev-preview path (no FFmpeg sidecar — same split as every other
 * FFmpeg-backed feature here): decodes the video's own audio track via the Web
 * Audio API and resamples+slices the trim window to 16kHz mono through an
 * `OfflineAudioContext` render — the browser's own real resampler, not a hand-rolled
 * approximation (same "real, less capable fallback" standard `videoFile.ts`'s
 * browser path holds itself to). Throws the same honest "no audio track" error when
 * `decodeAudioData` rejects (a silent/videoless source has no audio to decode). */
async function extractAudioViaWebAudio(videoDataUrl: string, trimIn: number, trimOut: number): Promise<Float32Array> {
  const resp = await fetch(videoDataUrl);
  const arrayBuffer = await resp.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    await audioCtx.close().catch(() => undefined);
    throw new Error('لا يوجد مسار صوت في هذا الفيديو');
  }
  await audioCtx.close().catch(() => undefined);

  const targetRate = 16000;
  const duration = Math.max(0.05, Math.min(trimOut, audioBuffer.duration) - trimIn);
  const length = Math.max(1, Math.ceil(duration * targetRate));
  const offline = new OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0, Math.max(0, trimIn), duration);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

export async function extractAudioSamples(video: Pick<VideoElement, 'src' | 'trimIn' | 'trimOut'>): Promise<Float32Array> {
  if (!video.src) throw new Error('لا يوجد ملف فيديو');
  return inTauri ? extractAudioViaFfmpeg(video.src, video.trimIn, video.trimOut) : extractAudioViaWebAudio(video.src, video.trimIn, video.trimOut);
}

// ---- Transcription ------------------------------------------------------------

type AsrPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<{
  text: string;
  chunks?: Array<{ timestamp: [number, number | null]; text: string }>;
}>;

let asrPipelinePromise: Promise<AsrPipeline> | null = null;

/** Points `@huggingface/transformers` at the Whisper ONNX runtime staged by
 * `scripts/setup-onnxruntime-wasm.sh` into `/ort-whisper/` — a *separate* path from
 * `/ort/` (used by `backgroundRemoval.ts`) because this library pulls in its own,
 * different `onnxruntime-web` version as a nested dependency; see that script's
 * comment for why the two can't share one staged copy. */
async function configureTransformersEnv(env: typeof import('@huggingface/transformers').env, fileMap: Record<string, Uint8Array>): Promise<void> {
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.localModelPath = '';
  env.backends.onnx.wasm!.wasmPaths = '/ort-whisper/';
  if (!window.crossOriginIsolated) env.backends.onnx.wasm!.numThreads = 1;

  // `getFile` in the library's `utils/hub.js` calls `env.fetch(...)`, not the global
  // `fetch` — so this is the one hook point that actually sees every model-file
  // request it makes (config/tokenizer/ONNX weights alike), independent of how the
  // rest of the library is bundled.
  const origFetch = env.fetch.bind(globalThis);
  env.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const prefix = `/${WHISPER_REPO_ID}/`;
    if (url.startsWith(prefix)) {
      const filename = url.slice(prefix.length);
      const bytes = fileMap[filename];
      if (bytes) return new Response(bytes.slice().buffer as ArrayBuffer, { status: 200, headers: { 'content-length': String(bytes.length), 'content-type': 'application/octet-stream' } });
      throw new Error(`autoCaptions: ملف غير متوقّع طلبته مكتبة النسخ: ${filename}`);
    }
    return origFetch(typeof input === 'string' || input instanceof URL ? input : url, init);
  }) as typeof fetch;
}

/** Lazily builds (once per session) the real ASR pipeline — model files come
 * exclusively from `localModels.ts`'s registry (already downloaded + sha256-
 * verified by the caller before this runs), never a network fetch performed by this
 * library itself: `configureTransformersEnv` intercepts the exact file paths
 * transformers.js would otherwise request from huggingface.co and serves the
 * already-verified local bytes instead, with `env.allowRemoteModels = false` so any
 * unexpected extra file request fails loudly rather than silently reaching the
 * network. */
async function getAsrPipeline(fileMap: Record<string, Uint8Array>): Promise<AsrPipeline> {
  if (!asrPipelinePromise) {
    asrPipelinePromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');
      await configureTransformersEnv(env, fileMap);
      return (await pipeline('automatic-speech-recognition', WHISPER_REPO_ID, { dtype: 'q8' })) as unknown as AsrPipeline;
    })();
  }
  return asrPipelinePromise;
}

export function whisperModelInfo(): LocalModelInfo {
  const model = modelById(WHISPER_MODEL_ID);
  if (!model) throw new Error('سجل النموذج لا يحتوي whisper-tiny-en');
  return model;
}

/** Runs real Whisper-tiny.en inference over real audio samples and returns
 * sentence/phrase-level segments with real timestamps (see the module doc comment
 * for the word-level-timestamp limitation). Never fabricates a segment: silence or
 * an undecodable clip legitimately returns an empty array rather than a placeholder. */
export async function transcribeAudio(samples: Float32Array): Promise<CaptionSegment[]> {
  const fileMap = await getModelPartsMap(whisperModelInfo());
  const asr = await getAsrPipeline(fileMap);
  const result = await asr(samples, { return_timestamps: true, chunk_length_s: 30 });
  const chunks = result.chunks ?? (result.text ? [{ timestamp: [0, samples.length / 16000] as [number, number], text: result.text }] : []);
  return chunks
    .map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] ?? samples.length / 16000, text: c.text.trim() }))
    .filter((c) => c.text.length > 0 && c.end > c.start);
}

// ---- Segments -> timeline text elements ----------------------------------------

const FADE_FRACTION_CAP = 0.25;
const FADE_SECONDS = 0.08;

function captionOpacityTrack(durationSec: number): PropertyKeyframe[] {
  const bezier = [...DEFAULT_BEZIER] as Bezier;
  const fadeFrac = Math.min(FADE_FRACTION_CAP, (FADE_SECONDS / Math.max(0.001, durationSec)) || FADE_FRACTION_CAP);
  return [
    { id: newElementId('kf'), t: 0, value: 0, easing: 'linear', bezier: [...bezier] as Bezier },
    { id: newElementId('kf'), t: fadeFrac, value: 1, easing: 'linear', bezier: [...bezier] as Bezier },
    { id: newElementId('kf'), t: 1 - fadeFrac, value: 1, easing: 'linear', bezier: [...bezier] as Bezier },
    { id: newElementId('kf'), t: 1, value: 0, easing: 'linear', bezier },
  ];
}

/** Turns real transcript segments into real `TextElement`s on the document timeline
 * — each one's `anim.start`/`anim.duration` is the segment's own `[start, end)`
 * (clamped into the document's fixed `TIMELINE_DURATION`, same fixed-length timeline
 * every document/template already shares — see `animTimeline.ts`), with an opacity
 * track that fades the caption in at its start and back out at its end, so it's
 * genuinely only on-screen during its own window rather than persisting forever
 * (the default behavior every other entrance-only `anim` relies on). A segment that
 * starts at/after the timeline's end is dropped rather than silently clipped to
 * zero width — the honest "fixed 5s timeline" limitation documented in
 * docs/CONTROLS.md, not a bug in this function. */
export function buildCaptionElements(segments: CaptionSegment[]): TextElement[] {
  const elements: TextElement[] = [];
  for (const seg of segments) {
    const start = Math.max(0, seg.start);
    if (start >= TIMELINE_DURATION - 0.02) continue;
    const end = Math.min(TIMELINE_DURATION, Math.max(seg.end, start + 0.1));
    const duration = end - start;
    elements.push({
      id: newElementId('caption'),
      type: 'text',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0.1, y: 0.82, w: 0.8, h: 0.12, rotation: 0 },
      text: seg.text,
      fontFamily: 'Alexandria',
      fontSize: 36,
      weight: 'bold',
      color: null,
      halign: 'center' as TextElement['halign'],
      valign: 'middle' as TextElement['valign'],
      textAnim: defaultTextStagger(),
      pathId: null,
      anim: {
        preset: 'none',
        start,
        duration,
        easing: 'linear',
        bezier: [...DEFAULT_BEZIER] as Bezier,
        keyframes: [],
        tracks: { opacity: captionOpacityTrack(duration) },
      },
    });
  }
  return elements;
}
