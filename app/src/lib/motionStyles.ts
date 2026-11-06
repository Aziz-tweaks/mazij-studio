import data from '../data/motionStyles.json';
import type { DocElement } from '../state/elements';
import type { StudioActions } from '../state/StudioContext';
import type { StudioState } from '../state/types';
import { sizeAt } from '../data/constants';
import { inTauri } from './tauriEnv';

/** **أنماطُ الحركة الجاهزة** (٦ نوفمبر ٢٠٢٦) — عشرون مشهدَ موشن مرسومةٌ بالكود في
 * `public/motion-styles/<id>/template.html`: نيون، كتابة متحركة، جزيئات، زجاج، تدرّج
 * منساب، صلصال، كوميك… يكتب المصمّمُ نصّه ويختار ألوانه، فيُرسَم المشهدُ **إطارًا إطارًا**
 * على مقاس اللوحة ويُرمَّز مقطعًا يُدرَج على الخطّ الزمنيّ عند المؤشّر بملء اللوحة.
 *
 * كلُّ قالبٍ يكشف `window.renderFrame(t)` ويرسم من الزمن وحده (عشوائيّةٌ ببذرةٍ ثابتة)، فالإطارُ
 * نفسُه يخرج كلَّ مرّة — لا تشغيلَ حيّ ولا إطاراتٍ ساقطة. والحروفُ العربيّة تُرسَم بخطّ
 * «MzArabic» (ألكسندريا، نطاقُ الحروف العربيّة وحده)، والتباعدُ حرفًا حرفًا يُلغى للعربيّ كي
 * لا تتقطّع الحروف. ونمطُ «لوحة مطار» يقلب كلَّ حرفٍ وحده فهو للنصّ اللاتينيّ. */

export interface MotionStyle {
  id: string;
  nameAr: string;
  nameEn: string;
  /** المدّةُ الافتراضيّة بالثواني. */
  dur: number;
  /** هل في النمط نصٌّ رئيسيّ / ثانويّ؟ الأنماطُ بلا نصّ خلفيّاتٌ متحرّكة. */
  text: boolean;
  sub: boolean;
  colors: Record<string, string>;
  /** يصلح للنصّ العربيّ. */
  arabic: boolean;
}

export const MOTION_STYLES: MotionStyle[] = data as MotionStyle[];

export const stylePreviewUrl = (id: string) => `/motion-styles/${id}/preview.jpg`;

export interface StyleRenderOpts {
  id: string;
  w: number;
  h: number;
  fps: number;
  dur: number;
  text?: string;
  sub?: string;
  colors?: Record<string, string>;
}

export function styleTemplateUrl(o: StyleRenderOpts): string {
  const q = new URLSearchParams({ render: '1', w: String(Math.round(o.w)), h: String(Math.round(o.h)), dur: String(o.dur) });
  if (o.text !== undefined) q.set('text', o.text);
  if (o.sub !== undefined) q.set('sub', o.sub);
  for (const [k, v] of Object.entries(o.colors ?? {})) if (v) q.set(k, v.replace('#', ''));
  return `/motion-styles/${o.id}/template.html?${q.toString()}`;
}

type StyleWindow = Window & { renderFrame?: (t: number) => boolean; __dur?: number };

/** يفتح القالبَ في إطارٍ مخفيّ من نفس المصدر ويعيد دالّةَ رسمِ إطار → PNG. */
async function openTemplate(o: StyleRenderOpts): Promise<{ draw: (t: number) => Promise<Blob>; close: () => void }> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:400px;height:400px;border:0;opacity:0;pointer-events:none';
  frame.src = styleTemplateUrl(o);
  document.body.appendChild(frame);
  const close = () => frame.remove();
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error('style template failed to load'));
      setTimeout(() => reject(new Error('style template timed out')), 20000);
    });
    const win = frame.contentWindow as StyleWindow | null;
    const doc = frame.contentDocument;
    if (!win || !doc) throw new Error('style template has no window');
    for (let i = 0; i < 100 && typeof win.renderFrame !== 'function'; i++) await new Promise((r) => setTimeout(r, 50));
    if (typeof win.renderFrame !== 'function') throw new Error('style template has no renderFrame');
    const sample = `${o.text ?? ''}${o.sub ?? ''}`;
    if (doc.fonts) {
      await Promise.all([400, 700, 800].map((w) => doc.fonts.load(`${w} 64px MzArabic`, sample || 'م').catch(() => undefined)));
      await doc.fonts.ready;
    }
    const canvas = doc.getElementById('c') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('style template has no canvas');
    const draw = (t: number) =>
      new Promise<Blob>((resolve, reject) => {
        win.renderFrame!(t);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('frame encode failed'))), 'image/png');
      });
    return { draw, close };
  } catch (err) {
    close();
    throw err;
  }
}

/** إطارٌ واحد صورةً — للمعاينة داخل نافذة الاختيار. */
export async function renderStyleStill(o: StyleRenderOpts, t: number): Promise<string> {
  const { draw, close } = await openTemplate(o);
  try {
    return URL.createObjectURL(await draw(t));
  } finally {
    close();
  }
}

async function runFfmpeg(args: string[]): Promise<void> {
  const { Command } = await import('@tauri-apps/plugin-shell');
  const cmd = Command.sidecar('binaries/ffmpeg', args);
  let stderr = '';
  cmd.stderr.on('data', (l: string) => {
    stderr += `${l}\n`;
  });
  await new Promise<void>((resolve, reject) => {
    cmd.on('close', (d) => (d.code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${d.code}\n${stderr.slice(-1500)}`))));
    cmd.on('error', (e) => reject(new Error(String(e))));
    cmd.spawn().catch(reject);
  });
}

/** يرسم النمطَ كاملًا ويرمّزه H.264 — ملفٌّ جاهزٌ لـ`insertVideoFromFile`. */
export async function renderStyleVideo(o: StyleRenderOpts, onProgress?: (f: number) => void): Promise<File> {
  if (!inTauri) throw new Error('rendering a motion style needs the installed app');
  const { homeDir, join } = await import('@tauri-apps/api/path');
  const { mkdir, writeFile, readFile, remove } = await import('@tauri-apps/plugin-fs');
  const home = await homeDir();
  const tmp = await join(home, 'Mazij', 'style-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmp, { recursive: true });
  const { draw, close } = await openTemplate(o);
  try {
    const n = Math.max(1, Math.round(o.dur * o.fps));
    for (let i = 0; i < n; i++) {
      const blob = await draw(i / o.fps);
      await writeFile(await join(tmp, `f-${String(i + 1).padStart(5, '0')}.png`), new Uint8Array(await blob.arrayBuffer()));
      onProgress?.((i + 1) / n * 0.85);
    }
    const out = await join(tmp, 'style.mp4');
    // أبعادٌ زوجيّة: H.264 بـ yuv420p يرفض العرضَ أو الارتفاعَ الفرديّ.
    await runFfmpeg(['-y', '-framerate', String(o.fps), '-i', await join(tmp, 'f-%05d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
    onProgress?.(0.95);
    const bytes = await readFile(out);
    return new File([bytes as Uint8Array<ArrayBuffer>], `${o.id}.mp4`, { type: 'video/mp4' });
  } finally {
    close();
    await remove(tmp, { recursive: true }).catch(() => undefined);
  }
}

/** يرسم النمط ويُدرجه على الخطّ الزمنيّ عند المؤشّر بملء اللوحة، ظاهرًا في مقطعه وحده. */
export async function insertMotionStyle(
  ctx: { getState: () => StudioState; actions: StudioActions },
  o: Omit<StyleRenderOpts, 'w' | 'h' | 'fps'> & { at?: number },
  onProgress?: (f: number) => void,
): Promise<string> {
  const s0 = ctx.getState();
  const size = sizeAt(s0.sizeIdx, s0.customW, s0.customH);
  const style = MOTION_STYLES.find((x) => x.id === o.id);
  if (!style) throw new Error(`unknown motion style "${o.id}"`);
  const at = Math.max(0, o.at ?? s0.t);
  const file = await renderStyleVideo({ ...o, w: size.w, h: size.h, fps: s0.fps }, onProgress);
  const before = new Set(ctx.getState().elements.map((e) => e.id));
  await ctx.actions.insertVideoFromFile(file);
  let el: DocElement | undefined;
  for (let i = 0; i < 80 && !el; i++) {
    await new Promise((r) => setTimeout(r, 25));
    el = ctx.getState().elements.find((e) => !before.has(e.id) && e.type === 'video');
  }
  if (!el) throw new Error('the rendered style was not inserted');
  const id = el.id;
  const name = s0.lang === 'ar' ? `نمط ${style.nameAr}` : `${style.nameEn} style`;
  ctx.actions.commitElements((els) =>
    els.map((e) => (e.id === id ? ({ ...e, name, geo: { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, anim: { ...e.anim, start: at, duration: o.dur, bounded: true } } as DocElement) : e)),
  );
  onProgress?.(1);
  return id;
}
