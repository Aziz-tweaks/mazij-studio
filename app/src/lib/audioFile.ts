// ─────────────────────────────────────────────────────────────────────────────
// استيرادُ ملفّ صوت — ٢٥ أكتوبر ٢٠٢٦
// ─────────────────────────────────────────────────────────────────────────────
//
// **ما يُقبَل:** أيُّ ملفٍّ فيه مسارُ صوتٍ يقرؤه FFmpeg (في البرنامج المثبّت) أو مُشغِّلُ
// المتصفّح (في المعاينة) — mp3 وm4a وwav وaac وogg وflac، **ومقطعُ فيديو** أيضًا: الراوي
// يأتي كثيرًا داخل فيديو. والقبولُ قرارُ المُفكِّك لا امتدادِ الاسم، كما في `videoFile.ts`.
//
// **ومن الفيديو يُستخرَج الصوتُ وحده** (FFmpeg: `-vn -c:a aac`) قبل أن يُحفَظ في المستند —
// فلا يحمل المستندُ صورَ فيديو كاملٍ لا يُعرَض منها شيء. وفي المعاينة (بلا FFmpeg) يُحفَظ
// الملفُّ كما هو، ومشغّلُ الصوت يقرأ مسارَ صوته ويترك الصورة.

import { hasDesktopSidecars, inTauri } from './tauriEnv';

export interface LoadedAudio {
  dataUrl: string;
  durationSec: number;
  /** اسمُ الملف بلا امتداده — اسمُ الطبقة. */
  name: string;
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(binary)}`;
}

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const baseName = (path: string) => (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '');

/** أهو ملفٌّ يُعامَل صوتًا عند الإفلات والرفع؟ — الصوتُ بنوعه أو امتداده. والفيديو لا
 * يُعدّ صوتًا هنا: إفلاتُه على اللوحة يضعه فيديو كما كان؛ واستخراجُ صوته طريقُه زرُّ «صوت». */
export function isAudioFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(file.name);
}

/** المدّةُ من مشغّل المتصفّح نفسه — وهو المُفكِّك أيضًا: ملفٌّ لا يقرؤه يُرفَض هنا. */
function probeDurationInBrowser(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      audio.src = '';
      if (Number.isFinite(d) && d > 0) resolve(d);
      else reject(new Error('تعذّر قراءة مدّة الصوت'));
    };
    audio.onerror = () => reject(new Error('تعذّر قراءة الصوت — الصيغة غير مدعومة'));
    audio.src = dataUrl;
  });
}

const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;

async function runSidecar(args: string[]): Promise<{ code: number | null; stderr: string }> {
  const { Command } = await import('@tauri-apps/plugin-shell');
  const cmd = Command.sidecar('binaries/ffmpeg', args);
  let stderr = '';
  cmd.stderr.on('data', (line: string) => {
    stderr += `${line}\n`;
  });
  return new Promise((resolve, reject) => {
    cmd.on('close', (data) => resolve({ code: data.code, stderr }));
    cmd.on('error', (err) => reject(new Error(String(err))));
    cmd.spawn().catch(reject);
  });
}

/** في البرنامج المثبّت: FFmpeg يقرأ الملف ويُخرج مسارَ صوته وحده AAC في m4a — صيغةٌ
 * يقرؤها مشغّلُ WebKit ومُفكِّكُ الموجة وFFmpeg عند التصدير جميعًا. ويُقرأ الطولُ من
 * الملف الناتج لا من الأصل: الناتجُ هو ما سيُسمَع. */
async function extractViaFfmpeg(bytes: Uint8Array, filename: string): Promise<{ bytes: Uint8Array; durationSec: number }> {
  const { homeDir, join } = await import('@tauri-apps/api/path');
  const { mkdir, writeFile, readFile, remove } = await import('@tauri-apps/plugin-fs');
  const home = await homeDir();
  const tmpDir = await join(home, 'Mazij', 'import-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  const input = await join(tmpDir, `source.${extOf(filename) || 'bin'}`);
  const output = await join(tmpDir, 'audio.m4a');
  try {
    await writeFile(input, bytes);
    const res = await runSidecar(['-y', '-i', input, '-vn', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k', output]);
    if (res.code !== 0) throw new Error('لا مسارَ صوتٍ في هذا الملف، أو الصيغة غير مدعومة');
    const probe = await runSidecar(['-i', output]);
    const m = DURATION_RE.exec(probe.stderr);
    const durationSec = m ? parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]) : NaN;
    if (!(durationSec > 0)) throw new Error('تعذّر قراءة مدّة الصوت');
    return { bytes: await readFile(output), durationSec };
  } finally {
    await remove(tmpDir, { recursive: true }).catch(() => undefined);
  }
}

/** بايتاتُ ملفٍّ مختار → صوتٌ جاهزٌ للطبقة. */
export async function decodeAudioBytes(bytes: Uint8Array, filename: string): Promise<LoadedAudio> {
  const name = baseName(filename);
  if (hasDesktopSidecars) {
    const out = await extractViaFfmpeg(bytes, filename);
    return { dataUrl: bytesToDataUrl(out.bytes, 'audio/mp4'), durationSec: out.durationSec, name };
  }
  const dataUrl = bytesToDataUrl(bytes, AUDIO_MIME[extOf(filename)] ?? 'audio/mpeg');
  return { dataUrl, durationSec: await probeDurationInBrowser(dataUrl), name };
}

/** منتقي ملفّاتٍ حقيقيّ — نافذةُ النظام في البرنامج المثبّت، و`<input type="file">` في
 * المعاينة. بلا مرشّحِ امتدادٍ على النافذة: الحكمُ للمُفكِّك (انظر أعلى الملف). */
export async function pickAudioFile(): Promise<LoadedAudio | null> {
  if (inTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false });
    if (!path || typeof path !== 'string') return null;
    return decodeAudioBytes(await readFile(path), path);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,video/*';
    let settled = false;
    const finish = (value: LoadedAudio | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      resolve(value);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      finish(await readAudioFile(file).catch(() => null));
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

/** ملفٌّ مُفلَت أو مرفوع. */
export async function readAudioFile(file: File): Promise<LoadedAudio> {
  return decodeAudioBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}
