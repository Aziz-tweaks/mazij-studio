import { unzipSync } from 'fflate';
import { inTauri } from './tauriEnv';
import { parseLottieMeta } from './lottiePlayback';

export interface LoadedLottie {
  /** Raw bodymovin/Lottie JSON text, with any `.lottie` image assets already
   * inlined as data URLs (see `inlineDotLottieAssets` below) — always directly
   * loadable by lottie-web with no further file resolution needed. */
  json: string;
  naturalW: number;
  naturalH: number;
}

const IMAGE_MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(binary)}`;
}

function extOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

/** `.lottie` is a zip container (the dotLottie spec): a `manifest.json` pointing at
 * one or more `animations/<id>.json` entries, plus any raster assets the animation
 * references under `images/`. This picks the manifest's first animation (or, failing
 * that, the first `animations/*.json` entry found) and rewrites every asset whose `p`
 * is a relative filename into an embedded `data:` URL sourced from the same zip's
 * `images/` folder — so the returned JSON is self-contained and loads in lottie-web
 * with no further file resolution, exactly like a plain `.json` export. Assets that
 * are already embedded (`e: 1`) or reference something outside the zip are left as-is
 * (lottie-web will skip what it can't resolve rather than this throwing) — documented
 * as a known limitation, not silently pretended away. */
function extractDotLottie(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  let animJson: string | null = null;

  const manifestBytes = files['manifest.json'];
  if (manifestBytes) {
    try {
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as { animations?: Array<{ id?: string }> };
      const id = manifest.animations?.[0]?.id;
      if (id && files[`animations/${id}.json`]) animJson = new TextDecoder().decode(files[`animations/${id}.json`]);
    } catch {
      // fall through to the generic scan below
    }
  }
  if (!animJson) {
    const path = Object.keys(files).find((p) => /^animations\/.+\.json$/.test(p));
    if (!path) throw new Error('حزمة .lottie لا تحتوي على ملف حركة صالح');
    animJson = new TextDecoder().decode(files[path]);
  }

  const anim = JSON.parse(animJson) as { assets?: Array<Record<string, unknown>> };
  for (const asset of anim.assets ?? []) {
    const p = asset.p;
    const u = asset.u;
    if (asset.e === 1 || typeof p !== 'string' || typeof u !== 'string') continue;
    const candidates = [`${u}${p}`, `images/${p}`].filter((c) => files[c]);
    const match = candidates[0];
    if (!match) continue; // referenced asset isn't in this archive — left unresolved, documented in CONTROLS.md
    const mime = IMAGE_MIME_BY_EXT[extOf(p)] ?? 'application/octet-stream';
    asset.p = bytesToDataUrl(files[match], mime);
    asset.u = '';
    asset.e = 1;
  }
  return JSON.stringify(anim);
}

async function decodeLottieBytes(bytes: Uint8Array, filename: string): Promise<LoadedLottie> {
  // Detect by magic bytes ('PK' zip signature), not just the extension — a renamed
  // file should still be read correctly rather than failing confusingly.
  const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  const json = isZip ? extractDotLottie(bytes) : new TextDecoder().decode(bytes);
  try {
    const meta = parseLottieMeta(json);
    return { json, naturalW: meta.w, naturalH: meta.h };
  } catch (err) {
    throw new Error(`"${filename}" ليس ملف Lottie صالحًا: ${(err as Error).message}`);
  }
}

/** Opens a real native file picker (Tauri dialog) and loads the chosen animation —
 * same "no simulated pick" discipline as `pickImageFile` in `imageFile.ts`. Falls
 * back to a hidden `<input type="file">` in the plain browser/dev preview. */
export async function pickLottieFile(): Promise<LoadedLottie | null> {
  if (inTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false, filters: [{ name: 'Lottie', extensions: ['json', 'lottie'] }] });
    if (!path || typeof path !== 'string') return null;
    const bytes = await readFile(path);
    return decodeLottieBytes(bytes, path);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.lottie,application/json';
    let settled = false;
    const finish = (value: LoadedLottie | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      resolve(value);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      finish(await readLottieFile(file).catch(() => null));
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
 * the counterpart to `readImageFile` in `imageFile.ts`, handling both plain `.json`
 * and zipped `.lottie` containers. */
export async function readLottieFile(file: File): Promise<LoadedLottie> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return decodeLottieBytes(bytes, file.name);
}
