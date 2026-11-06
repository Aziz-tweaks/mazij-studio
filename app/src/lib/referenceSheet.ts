import type { ReferenceVideoStructure } from './referenceVideo';

/** **قراءةُ المرجع بعين المخرج** (٦ نوفمبر ٢٠٢٦) — فوق كشف القطعات (`referenceVideo.ts`):
 * - **ورقةُ اللقطات**: إطارٌ من منتصف كلّ لقطة في شبكةٍ واحدة — تشوف الفيديو كلّه بنظرة.
 * - **طاقةُ الحركة**: كم يتغيّر الإطارُ عن سابقه، ثانيةً ثانية (٠..١٠٠). القمّةُ = حركةٌ
 *   سريعة أو انتقال، والهدوءُ = لقطةٌ ثابتة يُقرأ فيها النص. يدلّك على إيقاع المرجع
 *   قبل ما تبني عليه.
 * - **متوسّطُ طول اللقطة** — أسرعُ مقياسٍ لإيقاع القصّ. */

export interface ReferenceReading {
  sheetDataUrl: string | null;
  /** ٠..١٠٠ لكلّ ثانية. */
  energy: number[];
  avgShot: number;
  /** أعلى ثلاث ثوانٍ حركةً. */
  peaks: number[];
}

async function ffmpeg(args: string[]): Promise<string> {
  const { Command } = await import('@tauri-apps/plugin-shell');
  const cmd = Command.sidecar('binaries/ffmpeg', args);
  let stderr = '';
  cmd.stderr.on('data', (l: string) => {
    stderr += `${l}\n`;
  });
  await new Promise<void>((resolve, reject) => {
    cmd.on('close', () => resolve());
    cmd.on('error', (e) => reject(new Error(String(e))));
    cmd.spawn().catch(reject);
  });
  return stderr;
}

export function parseEnergy(stderr: string): number[] {
  const perSec: number[][] = [];
  let t = 0;
  for (const line of stderr.split('\n')) {
    const pt = /pts_time:([\d.]+)/.exec(line);
    if (pt) t = parseFloat(pt[1]);
    const y = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(line);
    if (y) (perSec[Math.floor(t)] ??= []).push(parseFloat(y[1]));
  }
  // الفرقُ بين إطارين نادرًا ما يتجاوز ٦٠ من ٢٥٥؛ نمدّ المقياس ليصير ٠..١٠٠ مقروءًا.
  return Array.from({ length: perSec.length }, (_, i) => {
    const v = perSec[i] ?? [];
    const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    return Math.min(100, Math.round((avg / 40) * 100));
  });
}

export async function readReference(path: string, s: ReferenceVideoStructure): Promise<ReferenceReading> {
  const { homeDir, join } = await import('@tauri-apps/api/path');
  const { mkdir, readFile, remove } = await import('@tauri-apps/plugin-fs');
  const tmp = await join(await homeDir(), 'Mazij', 'ref-tmp', `${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    const energy = parseEnergy(await ffmpeg(['-i', path, '-vf', 'fps=10,scale=96:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-an', '-f', 'null', '-']));
    const shots = s.shots.slice(0, 16);
    const frames: HTMLImageElement[] = [];
    for (let i = 0; i < shots.length; i++) {
      const out = await join(tmp, `s${i}.jpg`);
      await ffmpeg(['-y', '-ss', String(shots[i].start + shots[i].duration / 2), '-i', path, '-frames:v', '1', '-vf', 'scale=-2:220', out]);
      try {
        const bytes = await readFile(out);
        const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
        const img = new Image();
        await new Promise<void>((r) => {
          img.onload = () => r();
          img.onerror = () => r();
          img.src = url;
        });
        if (img.naturalWidth) frames.push(img);
      } catch {
        /* إطارٌ ناقص لا يُفشل الورقة */
      }
    }
    let sheetDataUrl: string | null = null;
    if (frames.length) {
      const cols = Math.min(4, frames.length);
      const rows = Math.ceil(frames.length / cols);
      const cw = Math.max(...frames.map((f) => f.naturalWidth));
      const ch = 220;
      const c = document.createElement('canvas');
      c.width = cols * cw;
      c.height = rows * (ch + 26);
      const g = c.getContext('2d')!;
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      frames.forEach((f, i) => {
        const x = (i % cols) * cw;
        const y = Math.floor(i / cols) * (ch + 26);
        g.drawImage(f, x + (cw - f.naturalWidth) / 2, y, f.naturalWidth, ch);
        g.fillStyle = '#fff';
        g.font = '600 15px Alexandria, sans-serif';
        g.fillText(`${i + 1} · ${shots[i].start.toFixed(1)}s`, x + 8, y + ch + 18);
      });
      sheetDataUrl = c.toDataURL('image/jpeg', 0.85);
    }
    const avgShot = s.shots.length ? s.totalDuration / s.shots.length : s.totalDuration;
    const peaks = energy
      .map((v, i) => [v, i] as const)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 3)
      .map(([, i]) => i)
      .sort((a, b) => a - b);
    return { sheetDataUrl, energy, avgShot, peaks };
  } finally {
    await remove(tmp, { recursive: true }).catch(() => undefined);
  }
}
