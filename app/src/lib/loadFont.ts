import { inTauri } from './tauriEnv';
import { registerFontBytes } from './fontsStore';

export interface LoadedFont {
  family: string;
  /** بايتاتُ الملف — تُحفَظ في مكتبة الخطوط فيبقى الخطُّ بعد إعادة التشغيل (`fontsStore.ts`). */
  bytes: Uint8Array;
}

function guessFileName(url: string) {
  try {
    return decodeURIComponent((url.split('/').pop() || '').split('?')[0]);
  } catch {
    return url;
  }
}

/** Fetches a font file from a URL, registers it with the FontFace API so it can
 * be used by both DOM text and canvas rendering (export). Uses Tauri's http
 * plugin when packaged, to avoid browser CORS limits; falls back to window.fetch
 * in the plain dev/browser preview. */
export async function fetchAndRegisterFont(url: string, familyName: string): Promise<LoadedFont> {
  const fileName = guessFileName(url);
  if (!/\.(ttf|otf|woff2?)(\?|#|$)/i.test(fileName)) {
    throw new Error('الرابط لا يشير لملف خط (ttf/otf/woff/woff2)');
  }

  let bytes: ArrayBuffer;
  if (inTauri) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const res = await tauriFetch(url);
    if (!res.ok) throw new Error(`فشل التحميل (HTTP ${res.status})`);
    bytes = await res.arrayBuffer();
  } else {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`فشل التحميل (HTTP ${res.status})`);
    bytes = await res.arrayBuffer();
  }

  // التسجيلُ الواحد للمكتبة كلّها — بمدى الأوزان الكامل، فلا يُعرَّض خطٌّ عريضٌ مرّةً ثانية.
  await registerFontBytes(familyName, bytes);
  return { family: familyName, bytes: new Uint8Array(bytes) };
}
