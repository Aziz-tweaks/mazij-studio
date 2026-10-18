import type { LocalModelInfo } from './localModels';

/** On-device image upscaling (roadmap #24-أ) — same shape as `backgroundRemoval.ts`
 * (#9) and `autoCaptions.ts` (#15): inference runs inside this webview via
 * onnxruntime-web, never Rust/a sidecar, because the QA harness only ever drives
 * the live UI. Model is `realesr-general-x4v3` (see localModels.ts) — a fixed 4x
 * upscaler with a dynamic H/W input, so every tile below is fed at its native size
 * with no resize step. */

type OrtNS = typeof import('onnxruntime-web/webgpu');
type OrtSession = Awaited<ReturnType<OrtNS['InferenceSession']['create']>>;

export interface UpscaleResult {
  dataUrl: string;
  width: number;
  height: number;
}

const SCALE = 4;

let ortPromise: Promise<OrtNS> | null = null;
function loadOrt(): Promise<OrtNS> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web/webgpu').then((mod) => {
      mod.env.wasm.wasmPaths = '/ort/';
      if (!window.crossOriginIsolated) mod.env.wasm.numThreads = 1;
      return mod;
    });
  }
  return ortPromise;
}

const sessionCache = new Map<string, Promise<OrtSession>>();

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

/** Max input-tile edge (pixels) fed to one `session.run` — keeps a single
 * inference's memory/compute bounded regardless of the source image's size, at
 * the cost of needing the overlap/crop stitching below. Chosen so a worst-case
 * tile (TILE+2*OVERLAP)² × 3 channels float32 tensor stays a few MB, not hundreds. */
const TILE = 192;
/** Extra context (pixels) read around each tile and cropped back off its *output*
 * after upscaling — without it, every tile's own edge pixels would be upscaled
 * with no neighboring context, producing a visible seam at tile boundaries. */
const OVERLAP = 12;

interface Tile {
  /** Source-space read rect, already clamped to the image bounds. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Where this tile's *cropped* (overlap-free) output lands in the final canvas,
   * in output (×SCALE) space. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Offset of the cropped region within this tile's own upscaled output. */
  cropX: number;
  cropY: number;
}

function planTiles(w: number, h: number): Tile[] {
  const tiles: Tile[] = [];
  for (let y0 = 0; y0 < h; y0 += TILE) {
    const coreH = Math.min(TILE, h - y0);
    for (let x0 = 0; x0 < w; x0 += TILE) {
      const coreW = Math.min(TILE, w - x0);
      const sx = Math.max(0, x0 - OVERLAP);
      const sy = Math.max(0, y0 - OVERLAP);
      const sEndX = Math.min(w, x0 + coreW + OVERLAP);
      const sEndY = Math.min(h, y0 + coreH + OVERLAP);
      tiles.push({
        sx,
        sy,
        sw: sEndX - sx,
        sh: sEndY - sy,
        dx: x0 * SCALE,
        dy: y0 * SCALE,
        dw: coreW * SCALE,
        dh: coreH * SCALE,
        cropX: (x0 - sx) * SCALE,
        cropY: (y0 - sy) * SCALE,
      });
    }
  }
  return tiles;
}

/** RGBA ImageData region -> NCHW float32 tensor, values normalized 0..1 (the
 * range `realesr-general-x4v3`'s SRVGGNetCompact graph was exported for — not
 * ImageNet-normalized like the segmentation models in backgroundRemoval.ts). */
function tileToTensor(imgData: ImageData, sx: number, sy: number, sw: number, sh: number, fullW: number): Float32Array {
  const plane = sw * sh;
  const chw = new Float32Array(3 * plane);
  const data = imgData.data;
  for (let row = 0; row < sh; row++) {
    const srcRowBase = ((sy + row) * fullW + sx) * 4;
    const dstRowBase = row * sw;
    for (let col = 0; col < sw; col++) {
      const srcI = srcRowBase + col * 4;
      const dstI = dstRowBase + col;
      chw[dstI] = data[srcI] / 255;
      chw[plane + dstI] = data[srcI + 1] / 255;
      chw[plane * 2 + dstI] = data[srcI + 2] / 255;
    }
  }
  return chw;
}

/** NCHW float32 output (0..1, clamped) -> an ImageData, opaque alpha. */
function tensorToImageData(out: Float32Array, w: number, h: number): ImageData {
  const plane = w * h;
  const imgData = new ImageData(w, h);
  for (let i = 0; i < plane; i++) {
    imgData.data[i * 4] = Math.round(Math.min(1, Math.max(0, out[i])) * 255);
    imgData.data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, out[plane + i])) * 255);
    imgData.data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, out[plane * 2 + i])) * 255);
    imgData.data[i * 4 + 3] = 255;
  }
  return imgData;
}

/** Upscales a (data-URL) image 4x on-device, tiling internally for large sources
 * so a single `session.run` never has to hold a huge tensor — stitched back into
 * one full-resolution result with no visible seams (each tile's overlap border is
 * cropped off before it's placed). `onProgress` reports tiles completed/total,
 * real (one call per finished tile), never simulated. */
export async function upscaleImage(dataUrl: string, model: LocalModelInfo, modelBytes: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<UpscaleResult> {
  const ort = await loadOrt();
  const session = await getSession(model, modelBytes);
  const img = await loadHtmlImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) throw new Error('الصورة فارغة');

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  srcCtx.drawImage(img, 0, 0, w, h);
  const srcData = srcCtx.getImageData(0, 0, w, h);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w * SCALE;
  outCanvas.height = h * SCALE;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!;

  const tiles = planTiles(w, h);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const chw = tileToTensor(srcData, t.sx, t.sy, t.sw, t.sh, w);
    const tensor = new ort.Tensor('float32', chw, [1, 3, t.sh, t.sw]);
    const results = await session.run({ [inputName]: tensor });
    const out = results[outputName].data as Float32Array;
    const outW = t.sw * SCALE;
    const outH = t.sh * SCALE;
    const tileImgData = tensorToImageData(out, outW, outH);

    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = outW;
    tileCanvas.height = outH;
    tileCanvas.getContext('2d')!.putImageData(tileImgData, 0, 0);

    outCtx.drawImage(tileCanvas, t.cropX, t.cropY, t.dw, t.dh, t.dx, t.dy, t.dw, t.dh);
    onProgress?.(i + 1, tiles.length);
  }

  return { dataUrl: outCanvas.toDataURL('image/png'), width: w * SCALE, height: h * SCALE };
}
