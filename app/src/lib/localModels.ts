import { inTauri } from './tauriEnv';

/** One file belonging to a multi-file model (roadmap #15's whisper-tiny.en — unlike
 * the single-.onnx background-removal models, a real Whisper ONNX export needs its
 * encoder, decoder, tokenizer and config as separate files). Each part carries its
 * own real size/sha256, exactly like a single-file model's top-level fields. */
export interface LocalModelPart {
  filename: string;
  url: string;
  sha256: string;
  sizeBytes: number;
}

/** Code-defined registry of on-device AI models (roadmap #9, the practical seed of
 * the broader #24 "local models" vision in ROADMAP-PROGRESS.md). Every entry here is
 * a real downloadable model *except* `downloadable: false` ones, which the UI only
 * ever shows as a labeled, inert option — never fetched automatically. */
export interface LocalModelInfo {
  id: string;
  task: 'background-removal' | 'speech-to-text' | 'super-resolution';
  label: string;
  labelEn: string;
  /** Real size in bytes of the published file at `url` (0 for a non-downloadable entry,
   * or the sum of `parts[].sizeBytes` for a multi-file model). */
  sizeBytes: number;
  /** Empty when `parts` is set — a multi-file model has no single top-level file. */
  url: string;
  sha256: string;
  license: string;
  /** Model's expected square input resolution in pixels. Unused (0) for non-vision tasks. */
  inputSize: number;
  /** false = listed for transparency only; the app never downloads or runs it. */
  downloadable: boolean;
  /** Set for a multi-file model (e.g. Whisper's encoder/decoder/tokenizer) — when
   * present, every storage/verification function below operates on each part instead
   * of the single-file `url`/`sha256` fields, which are left empty ('') on such entries. */
  parts?: LocalModelPart[];
}

export const LOCAL_MODELS: LocalModelInfo[] = [
  {
    id: 'u2netp',
    task: 'background-removal',
    label: 'U2-Netp (خفيف — Apache-2.0)',
    labelEn: 'U2-Netp (light — Apache-2.0)',
    sizeBytes: 4_574_861,
    // Byte-identical mirror of danielgatis/rembg's GitHub release asset (verified by
    // sha256 below) — Hugging Face's CDN sets permissive CORS headers for browser
    // fetches, which GitHub's release-asset redirect (Azure blob SAS URL) does not;
    // without that, a plain browser `fetch()` (the dev/QA preview path — see
    // tauriEnv.ts) is blocked outright, even though the packaged Tauri app's
    // `@tauri-apps/plugin-http` fetch has no such restriction.
    url: 'https://huggingface.co/edgetools/u2netp/resolve/main/u2netp.onnx',
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
    license: 'Apache-2.0',
    inputSize: 320,
    downloadable: true,
  },
  {
    id: 'rmbg-1.4',
    task: 'background-removal',
    label: 'RMBG-1.4 (جودة أعلى على الشعر/الزجاج — غير تجاري)',
    labelEn: 'RMBG-1.4 (higher quality on hair/glass — non-commercial)',
    sizeBytes: 0,
    url: '',
    sha256: '',
    license: 'bria-rmbg-1.4 — للاستخدام غير التجاري فقط',
    inputSize: 1024,
    downloadable: false,
  },
  {
    id: 'whisper-tiny-en',
    task: 'speech-to-text',
    label: 'Whisper Tiny — إنجليزي فقط (MIT)',
    labelEn: 'Whisper Tiny — English only (MIT)',
    // Sum of the 7 parts below — real sizes of onnx-community/whisper-tiny.en's
    // published files (a quantized ONNX export of openai/whisper-tiny.en, the exact
    // model+file set `@huggingface/transformers`'s ASR pipeline requests — verified
    // by actually running it once and inspecting which files it fetched; see
    // docs/CONTROLS.md's auto-captions stage).
    sizeBytes: 43_536_374,
    url: '',
    sha256: '',
    license: 'MIT',
    inputSize: 0,
    downloadable: true,
    parts: [
      { filename: 'config.json', url: 'https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/config.json', sha256: '251ea843b5901a99efa58c0b99b8052c6019aa3e7d2baf46693a1128ff606233', sizeBytes: 2197 },
      { filename: 'generation_config.json', url: 'https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/generation_config.json', sha256: '7b2e8451ed5f118e75fdd991409d72119d21d2fef1eba9723f68fb9c57fe5dc9', sizeBytes: 1646 },
      { filename: 'preprocessor_config.json', url: 'https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/preprocessor_config.json', sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d', sizeBytes: 339 },
      { filename: 'tokenizer.json', url: 'https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/tokenizer.json', sha256: '5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0', sizeBytes: 2_405_679 },
      { filename: 'tokenizer_config.json', url: 'https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/tokenizer_config.json', sha256: '93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c', sizeBytes: 282_662 },
      { filename: 'onnx/encoder_model_quantized.onnx', url: 'https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/onnx/encoder_model_quantized.onnx', sha256: 'e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25', sizeBytes: 10_124_993 },
      { filename: 'onnx/decoder_model_merged_quantized.onnx', url: 'https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/onnx/decoder_model_merged_quantized.onnx', sha256: 'c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52', sizeBytes: 30_718_858 },
    ],
  },
  {
    id: 'realesr-general-x4v3',
    task: 'super-resolution',
    label: 'Real-ESRGAN General x4v3 (خفيف — BSD-3-Clause)',
    labelEn: 'Real-ESRGAN General x4v3 (light — BSD-3-Clause)',
    sizeBytes: 4_871_181,
    // Hugging Face-hosted re-export of xinntao/Real-ESRGAN's official
    // `realesr-general-x4v3.pth` (the lightweight SRVGGNetCompact architecture, not
    // the heavier RRDB `x4plus`) — `access-control-allow-origin: *` confirmed by a
    // real HEAD request, unlike Qualcomm's AI-Hub mirror of the same family (a .zip
    // behind an S3 redirect with no such header — unusable from a browser fetch).
    url: 'https://huggingface.co/Heliosoph/realesrgan-onnx/resolve/main/realesr-general-x4v3.onnx',
    sha256: '09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4',
    license: 'BSD-3-Clause',
    // Dynamic H/W input (verified via `onnx.load` on the real file) — 0 means
    // "no fixed square input", unlike the background-removal models above.
    inputSize: 0,
    downloadable: true,
  },
];

/** Virtual "repo id" used only as the local cache-key namespace for Whisper's files
 * (see `src/lib/autoCaptions.ts`) — never actually requested over the network, since
 * `transcribe()` intercepts every one of these paths with the bytes downloaded
 * through `downloadModel()` below before transformers.js's own fetch runs. */
export const WHISPER_REPO_ID = 'onnx-community/whisper-tiny.en';

export const DEFAULT_MODEL_ID = 'u2netp';

export function modelById(id: string): LocalModelInfo | undefined {
  return LOCAL_MODELS.find((m) => m.id === id);
}

const CACHE_NAME = 'mazij-local-models-v1';
const MODELS_SUBDIR = 'models';

/** A single-file model is treated as a model with exactly one implicit "part" whose
 * storage filename is `${id}.onnx` (unchanged from before `parts` existed, so a
 * previously downloaded `u2netp.onnx` on disk is still found) — every storage
 * function below operates uniformly on this list instead of branching per call. */
function storageParts(model: LocalModelInfo): LocalModelPart[] {
  if (model.parts) return model.parts;
  return [{ filename: `${model.id}.onnx`, url: model.url, sha256: model.sha256, sizeBytes: model.sizeBytes }];
}

/** Flat, filesystem/Cache-API-safe storage name for one part — `/` (present in
 * Whisper's `onnx/encoder_model_quantized.onnx`) can't be a bare Tauri filename
 * without creating a subdirectory, so it's flattened into the name itself. */
function partStorageName(model: LocalModelInfo, part: LocalModelPart): string {
  const flatFilename = part.filename.replace(/\//g, '__');
  return model.parts ? `${model.id}__${flatFilename}` : flatFilename;
}

function cacheKeyFor(storageName: string): string {
  return `https://mazij.local/models/${storageName}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function partExists(storageName: string): Promise<boolean> {
  if (inTauri) {
    const { exists } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const filePath = await join(await appDataDir(), MODELS_SUBDIR, storageName);
    return exists(filePath).catch(() => false);
  }
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(cacheKeyFor(storageName))) != null;
}

export async function isModelDownloaded(model: LocalModelInfo): Promise<boolean> {
  if (!model.downloadable) return false;
  const results = await Promise.all(storageParts(model).map((part) => partExists(partStorageName(model, part))));
  return results.every(Boolean);
}

export async function deleteModel(model: LocalModelInfo): Promise<void> {
  for (const part of storageParts(model)) {
    const storageName = partStorageName(model, part);
    if (inTauri) {
      const { remove, exists } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const filePath = await join(await appDataDir(), MODELS_SUBDIR, storageName);
      if (await exists(filePath)) await remove(filePath);
    } else {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(cacheKeyFor(storageName));
    }
  }
}

async function downloadOnePart(model: LocalModelInfo, part: LocalModelPart, onBytes: (loaded: number) => void): Promise<void> {
  const response = inTauri ? await (await import('@tauri-apps/plugin-http')).fetch(part.url) : await fetch(part.url);
  if (!response.ok || !response.body) throw new Error(`فشل تنزيل الملف ${part.filename} (HTTP ${response.status})`);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onBytes(loaded);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  const digest = await sha256Hex(bytes);
  if (digest !== part.sha256) {
    throw new Error(`فشل التحقق من بصمة ${part.filename} — توقعنا ${part.sha256.slice(0, 12)}… ووجدنا ${digest.slice(0, 12)}…`);
  }

  const storageName = partStorageName(model, part);
  if (inTauri) {
    const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const dir = await join(await appDataDir(), MODELS_SUBDIR);
    await mkdir(dir, { recursive: true });
    await writeFile(await join(dir, storageName), bytes);
  } else {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKeyFor(storageName), new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
  }
}

/** Downloads, sha256-verifies, and stores a model's file(s) — real progress from
 * each part's response-body stream reader (reported loaded/total as bytes actually
 * received, never simulated, summed across every part for a multi-file model like
 * Whisper), and a hash mismatch throws instead of silently storing a corrupt/
 * tampered file. Storage mirrors `templatesStore.ts`: the Tauri app-data dir when
 * packaged, the browser Cache API in the dev/QA preview. Parts download
 * sequentially — simpler progress accounting than interleaving concurrent streams,
 * and none of today's models are large enough for that to matter. */
export async function downloadModel(model: LocalModelInfo, onProgress?: (loaded: number, total: number) => void): Promise<void> {
  if (!model.downloadable) throw new Error('هذا النموذج غير متاح للتنزيل الآلي');

  const parts = storageParts(model);
  const total = parts.reduce((sum, p) => sum + p.sizeBytes, 0) || model.sizeBytes || 0;
  let completedBytes = 0;
  for (const part of parts) {
    await downloadOnePart(model, part, (loaded) => onProgress?.(completedBytes + loaded, total));
    completedBytes += part.sizeBytes;
    onProgress?.(completedBytes, total);
  }
}

/** Single-file accessor — throws for a multi-file model (`parts` set); use
 * `getModelPartBytes`/`getModelPartsMap` for those (Whisper). */
export async function getModelBytes(model: LocalModelInfo): Promise<Uint8Array> {
  if (model.parts) throw new Error(`"${model.id}" نموذج متعدد الملفات — استخدم getModelPartsMap`);
  return getModelPartBytes(model, storageParts(model)[0]);
}

export async function getModelPartBytes(model: LocalModelInfo, part: LocalModelPart): Promise<Uint8Array> {
  const storageName = partStorageName(model, part);
  if (inTauri) {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const filePath = await join(await appDataDir(), MODELS_SUBDIR, storageName);
    return readFile(filePath);
  }
  const cache = await caches.open(CACHE_NAME);
  const match = await cache.match(cacheKeyFor(storageName));
  if (!match) throw new Error(`الملف ${part.filename} غير مُنزَّل بعد`);
  return new Uint8Array(await match.arrayBuffer());
}

/** Reads every part of a multi-file model into memory, keyed by its own `filename`
 * (e.g. `'onnx/encoder_model_quantized.onnx'`) — what `src/lib/autoCaptions.ts`
 * hands to its local-fetch intercept so `@huggingface/transformers` never touches
 * the network for a file this registry already downloaded and verified. */
export async function getModelPartsMap(model: LocalModelInfo): Promise<Record<string, Uint8Array>> {
  const parts = storageParts(model);
  const entries = await Promise.all(parts.map(async (part) => [part.filename, await getModelPartBytes(model, part)] as const));
  return Object.fromEntries(entries);
}
