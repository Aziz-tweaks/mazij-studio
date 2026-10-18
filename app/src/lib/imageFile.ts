import { inTauri } from './tauriEnv';

export interface LoadedImage {
  dataUrl: string;
  naturalW: number;
  naturalH: number;
}

function naturalSizeOf(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('فشل قراءة الصورة'));
    img.src = dataUrl;
  });
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function mimeFromExt(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

/** Opens a real native file picker (Tauri dialog) and loads the chosen image's
 * bytes into a data URL. In the plain browser/dev preview there is no native
 * dialog, so a hidden <input type="file"> is used instead — never a simulated pick. */
export async function pickImageFile(): Promise<LoadedImage | null> {
  if (inTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({
      multiple: false,
      filters: [{ name: 'صور', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (!path || typeof path !== 'string') return null;
    const bytes = await readFile(path);
    const dataUrl = bytesToDataUrl(bytes, mimeFromExt(path));
    const { w, h } = await naturalSizeOf(dataUrl);
    return { dataUrl, naturalW: w, naturalH: h };
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    let settled = false;
    const finish = (value: LoadedImage | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      resolve(value);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      finish(await readImageFile(file));
    };
    // Dismissing the native file-picker dialog (Cancel, or closing it without a
    // choice) never fires 'change', so without this the returned promise — and
    // whatever tool state is waiting on it — would hang forever. Modern browsers
    // fire a real 'cancel' event on the input for this; as a defensive fallback for
    // engines that don't, treat the window regaining focus with no file chosen as
    // a cancel too (the only way focus can return here is the dialog closing).
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

export function readImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const { w, h } = await naturalSizeOf(dataUrl);
        resolve({ dataUrl, naturalW: w, naturalH: h });
      } catch (err) {
        reject(err as Error);
      }
    };
    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsDataURL(file);
  });
}
