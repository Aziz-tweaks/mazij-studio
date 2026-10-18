import type { LocalModelInfo } from './localModels';

/** On-device background removal (roadmap #9) — inference runs inside the webview
 * via onnxruntime-web (never Rust/a sidecar; see docs/CONTROLS.md "المرحلة 11" for
 * why: the QA harness drives the live UI at localhost:1420, so Rust-side inference
 * would be unverifiable by that harness). Preprocessing/postprocessing here match
 * the reference Python session (`danielgatis/rembg`'s u2net.py) exactly — resize to
 * the model's square input, ImageNet mean/std normalization, CHW batch tensor in;
 * first output channel min-max normalized to a 0..255 mask out — so the model
 * behaves identically to its original PyTorch/ONNX reference implementation. */

type OrtNS = typeof import('onnxruntime-web/webgpu');
type OrtSession = Awaited<ReturnType<OrtNS['InferenceSession']['create']>>;

export interface BackgroundRemovalResult {
  dataUrl: string;
  width: number;
  height: number;
}

let ortPromise: Promise<OrtNS> | null = null;
function loadOrt(): Promise<OrtNS> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web/webgpu').then((mod) => {
      // Served statically from public/ort/ (staged by scripts/setup-onnxruntime-wasm.sh)
      // so the runtime's own bundling doesn't dictate where the .wasm binaries live.
      mod.env.wasm.wasmPaths = '/ort/';
      // Threaded WASM needs cross-origin isolation (SharedArrayBuffer) — fall back to
      // a single thread instead of crashing when the page isn't isolated.
      if (!window.crossOriginIsolated) mod.env.wasm.numThreads = 1;
      return mod;
    });
  }
  return ortPromise;
}

const sessionCache = new Map<string, Promise<OrtSession>>();

/** One cached session per model id — `executionProviders: ['webgpu', 'wasm']` tries
 * WebGPU first and falls back to WASM automatically (a built-in onnxruntime-web
 * behavior: it iterates the list and uses the first provider that actually
 * initializes on this device), never throwing just because WebGPU is unavailable. */
function getSession(model: LocalModelInfo, modelBytes: Uint8Array): Promise<OrtSession> {
  const cached = sessionCache.get(model.id);
  if (cached) return cached;
  const created = loadOrt().then((ort) => ort.InferenceSession.create(modelBytes, { executionProviders: ['webgpu', 'wasm'] }));
  sessionCache.set(model.id, created);
  return created;
}

function loadHtmlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('فشل قراءة الصورة'));
    img.src = dataUrl;
  });
}

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

function preprocess(img: HTMLImageElement, inputSize: number): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = inputSize;
  canvas.height = inputSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, inputSize, inputSize);
  const { data } = ctx.getImageData(0, 0, inputSize, inputSize);

  const plane = inputSize * inputSize;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    chw[i] = (data[i * 4] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    chw[plane + i] = (data[i * 4 + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    chw[plane * 2 + i] = (data[i * 4 + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }
  return chw;
}

/** Runs the model and returns a 0..255 single-channel saliency mask at the model's
 * own square input resolution. Uses the session's own first input/output names
 * (`session.inputNames[0]`/`outputNames[0]`) rather than hardcoded strings, since
 * different model exports (u2net vs u2netp vs a future model) name these
 * differently — this is also exactly what `rembg`'s own `ort_outs[0]` does: take
 * the first output, ignore the rest (side-output saliency maps at other scales). */
async function runMask(ort: OrtNS, session: OrtSession, chw: Float32Array, inputSize: number): Promise<Uint8ClampedArray> {
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const tensor = new ort.Tensor('float32', chw, [1, 3, inputSize, inputSize]);
  const results = await session.run({ [inputName]: tensor });
  const out = results[outputName].data as Float32Array;

  let mi = Infinity;
  let ma = -Infinity;
  for (let i = 0; i < out.length; i++) {
    if (out[i] < mi) mi = out[i];
    if (out[i] > ma) ma = out[i];
  }
  const range = ma - mi || 1;
  const mask = new Uint8ClampedArray(out.length);
  for (let i = 0; i < out.length; i++) mask[i] = Math.round(((out[i] - mi) / range) * 255);
  return mask;
}

/** Upsamples a square `size×size` grayscale mask to `w×h` via a canvas draw — a
 * free bilinear resize (same trick `computeImageCropLayout`'s canvas draws rely
 * on), so the alpha edge is smooth rather than blocky at the model's native
 * resolution. Returns the mask's red channel as the 0..255 alpha value per pixel. */
function upsampleMask(mask: Uint8ClampedArray, size: number, w: number, h: number): Uint8ClampedArray {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = size;
  srcCanvas.height = size;
  const srcCtx = srcCanvas.getContext('2d')!;
  const srcImageData = srcCtx.createImageData(size, size);
  for (let i = 0; i < mask.length; i++) {
    srcImageData.data[i * 4] = mask[i];
    srcImageData.data[i * 4 + 1] = mask[i];
    srcImageData.data[i * 4 + 2] = mask[i];
    srcImageData.data[i * 4 + 3] = 255;
  }
  srcCtx.putImageData(srcImageData, 0, 0);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = w;
  dstCanvas.height = h;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true })!;
  dstCtx.drawImage(srcCanvas, 0, 0, w, h);
  return new Uint8ClampedArray(dstCtx.getImageData(0, 0, w, h).data);
}

/** Removes the background of a (data-URL) image using an on-device segmentation
 * model and returns a new data URL at the *source's own full resolution* (never
 * downscaled to the model's input size) with a real per-pixel alpha channel —
 * object pixels at full opacity, background pixels transparent. */
export async function removeImageBackground(dataUrl: string, model: LocalModelInfo, modelBytes: Uint8Array): Promise<BackgroundRemovalResult> {
  const ort = await loadOrt();
  const session = await getSession(model, modelBytes);
  const img = await loadHtmlImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const chw = preprocess(img, model.inputSize);
  const mask = await runMask(ort, session, chw, model.inputSize);
  const upMask = upsampleMask(mask, model.inputSize, w, h);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!;
  outCtx.drawImage(img, 0, 0, w, h);
  const outData = outCtx.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) {
    outData.data[i * 4 + 3] = upMask[i * 4];
  }
  outCtx.putImageData(outData, 0, 0);

  return { dataUrl: outCanvas.toDataURL('image/png'), width: w, height: h };
}
