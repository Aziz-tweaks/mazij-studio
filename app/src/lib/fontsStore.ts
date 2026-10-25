// ─────────────────────────────────────────────────────────────────────────────
// خطوطُ المستعمل: من ملفٍّ على جهازه، أو مثبّتةٌ فيه بالاسم — وتبقى (٢٥ أكتوبر ٢٠٢٦)
// ─────────────────────────────────────────────────────────────────────────────
//
// **ما كان.** «أضف خط» يقبل رابطًا وحده، والخطُّ المحمَّل يعيش في ذاكرة الجلسة: بعد إعادة
// التشغيل يرجع النصُّ إلى `sans-serif` بلا كلمة — وعائلتُه مكتوبةٌ في المستند `Name-1729…`
// لا يعرفها أحد. ومقطعٌ يُنسَخ بخطٍّ نسخيّ (أميري) وتسمياتٍ بخطٍّ مثبّتٍ في الجهاز (Arial)
// يحتاج الطريقين معًا، ويحتاجهما بعد كلّ إعادة تشغيل.
//
// **فالقرار:** مكتبةُ خطوطٍ للبرنامج كلّه (لا لمستندٍ واحد) — كالخطوط المثبّتة في نظام
// التشغيل: ملفٌّ في مجلّد بيانات البرنامج (`fonts.json`) في البرنامج المثبّت، و`localStorage`
// في المعاينة؛ بالنمط الذي تُحفَظ به القوالب (`templatesStore.ts`). والملفُّ يُحفَظ ببايتاته
// (عنوان بيانات) فلا يتعلّق بموضعه الأصليّ. وعائلةُ الخطّ **ثابتة** (`Mz-اسم الملف`) لا
// ختمَ وقتٍ فيها: المستندُ يشير إليها بالاسم، والاسمُ يعود هو هو بعد إعادة التشغيل.
//
// **والوزن:** الخطُّ المستورَد ملفٌّ بوزنٍ واحد، فيُسجَّل بمدى أوزانٍ كامل (`100 900`):
// نصٌّ عريضٌ بخطٍّ عريضٍ يُرسَم بحروف الملف نفسها — بلا هذا «يُعرِّض» المتصفّحُ الحروفَ
// العريضةَ أصلًا مرّةً ثانية (font-synthesis)، فيخرج أثقلَ من الملف.

import { inTauri } from './tauriEnv';

export interface UserFont {
  /** الاسم المعروض. */
  name: string;
  /** عائلةُ CSS كما تُكتب في `fontFamily` (مقتبسةٌ إن احتاجت). */
  family: string;
  /** بايتاتُ الملف — وغيابُها = خطٌّ مثبّتٌ في الجهاز يُستعمل باسمه. */
  dataUrl?: string;
}

const LOCAL_KEY = 'mazij.fonts.v1';
const FILE_NAME = 'fonts.json';

export async function saveUserFonts(fonts: UserFont[]): Promise<void> {
  const json = JSON.stringify(fonts);
  if (inTauri) {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(await join(dir, FILE_NAME), json);
  } else {
    window.localStorage.setItem(LOCAL_KEY, json);
  }
}

/** لا يرمي: لا مكتبةَ بعد = قائمةٌ فارغة. */
export async function loadUserFonts(): Promise<UserFont[]> {
  try {
    let json: string | null;
    if (inTauri) {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const filePath = await join(await appDataDir(), FILE_NAME);
      json = (await exists(filePath)) ? await readTextFile(filePath) : null;
    } else {
      json = window.localStorage.getItem(LOCAL_KEY);
    }
    if (!json) return [];
    const parsed = JSON.parse(json) as UserFont[];
    return Array.isArray(parsed) ? parsed.filter((f) => f && typeof f.family === 'string' && typeof f.name === 'string') : [];
  } catch {
    return [];
  }
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(binary)}`;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const FONT_MIME: Record<string, string> = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };

/** عائلةُ CSS لاسمٍ: مقتبسةٌ بعلامتين مفردتين متى لم يكن معرّفًا CSS بسيطًا. */
export function cssFamilyOf(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name) ? name : `'${name.replace(/'/g, '')}'`;
}

/** يسجّل خطًّا من بايتاته في `document.fonts` — للمعاينة والقُماش معًا. */
export async function registerFontBytes(family: string, bytes: ArrayBuffer | Uint8Array): Promise<void> {
  const raw = family.replace(/^'(.*)'$/, '$1');
  const face = new FontFace(raw, bytes instanceof Uint8Array ? bytes.slice().buffer : bytes, { weight: '100 900', style: 'normal' });
  await face.load();
  (document.fonts as FontFaceSet).add(face);
}

export async function registerUserFont(font: UserFont): Promise<void> {
  if (font.dataUrl) await registerFontBytes(font.family, dataUrlToBytes(font.dataUrl));
}

/** ملفُّ خطٍّ مختار → خطٌّ مسجَّلٌ جاهز. الاسمُ اسمُ الملف، والعائلةُ `Mz-…` منه — ثابتةٌ
 * بين الجلسات، ومميَّزةٌ عن خطٍّ مثبّتٍ في النظام بالاسم نفسه. */
export async function fontFromBytes(bytes: Uint8Array, filename: string, taken: Set<string>): Promise<UserFont> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (!FONT_MIME[ext]) throw new Error('ليس ملفَّ خطّ (ttf/otf/woff/woff2)');
  const name = (filename.split(/[\\/]/).pop() ?? filename).replace(/\.[^.]+$/, '');
  const base = `Mz-${name.replace(/[^A-Za-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '') || 'Font'}`;
  let family = cssFamilyOf(base);
  for (let i = 2; taken.has(family); i++) family = cssFamilyOf(`${base}-${i}`);
  await registerFontBytes(family, bytes);
  return { name, family, dataUrl: bytesToDataUrl(bytes, FONT_MIME[ext]) };
}

/** منتقي ملفّ الخطّ — نافذةُ النظام في البرنامج المثبّت، و`<input>` في المعاينة. */
export async function pickFontFile(): Promise<{ bytes: Uint8Array; name: string } | null> {
  if (inTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false, filters: [{ name: 'Font', extensions: ['ttf', 'otf', 'woff', 'woff2'] }] });
    if (!path || typeof path !== 'string') return null;
    return { bytes: await readFile(path), name: path };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ttf,.otf,.woff,.woff2';
    let settled = false;
    const finish = (v: { bytes: Uint8Array; name: string } | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      finish(file ? { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name } : null);
    };
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/** **أهذا الخطّ مثبّتٌ في الجهاز؟** — `document.fonts.check` لا يجيب (يقول «نعم» لكلّ اسمٍ
 * لا يحتاج تحميلًا، موجودًا أو لا). فالقياسُ: عرضُ نصٍّ بالاسم مع خطٍّ احتياطيّ، مقابلَ
 * الاحتياطيّ وحده، على ثلاثة احتياطيّاتٍ مختلفة العرض — فإن اختلف أحدُها فالاسمُ رسم. */
export function isFontInstalled(name: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return false;
  const sample = 'mmmmmmmmmmlli 0123456789 أبجد هوز حطي كلمن';
  const fam = cssFamilyOf(name.trim());
  return ['monospace', 'serif', 'sans-serif'].some((base) => {
    ctx.font = `72px ${base}`;
    const w0 = ctx.measureText(sample).width;
    ctx.font = `72px ${fam}, ${base}`;
    return Math.abs(ctx.measureText(sample).width - w0) > 0.5;
  });
}
