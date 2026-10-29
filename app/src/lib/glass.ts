/** **خامةُ الزجاج** (٢٩ أكتوبر ٢٠٢٦) — لونٌ داخل النصّ أو الشكل يبدو زجاجًا لا طلاءً.
 *
 * نمطان، كلاهما مقيسٌ على المقطع المرجعيّ إطارًا إطارًا:
 * - `tube` — حروفٌ كأنابيب زجاج: حافّةٌ باردة (بنفسجيّ/أزرق)، جسمٌ متدرّج، قلبٌ حارّ
 *   (برتقاليّ)، ولمعةٌ بيضاء على الحافّة العليا. كـ«You» و«Now» في المرجع.
 * - `reeded` — زجاجٌ مضلَّع: الألوانُ تحت الشكل تنكسر في أشرطةٍ رأسيّة، لكلّ شريطٍ
 *   حافّةٌ مضيئة وأخرى معتمة. كالكبسولة وفقاعة «You built».
 *
 * **رسّامٌ واحد للمعاينة والتصدير**: كلاهما يمرّر سياقَ قماشٍ ومصفوفتَه، ودالّةً ترسم
 * **ظلَّ** العنصر (حروفه أو شكله) أسودَ في إحداثيّاته المحلّيّة. فما يُرى هو ما يُصدَّر.
 * والعملُ كلُّه في صندوق العنصر على الجهاز لا في القماش كلّه — الكلفةُ على قدر العنصر. */

export interface GlassStyle {
  mode: 'tube' | 'reeded';
  /** ألوانُ الجسم من البداية إلى النهاية على عرض العنصر (٢ إلى ٦). */
  colors: string[];
  /** لونُ الحافّة الباردة (tube). */
  rim?: string;
  /** لونُ القلب الحارّ (tube). */
  core?: string;
  /** انسيابُ الألوان: كم عرضًا للعنصر تقطع في الثانية (٠ = ثابتة). */
  flow?: number;
  /** زاويةُ تدرّج الجسم (CSS: ٩٠ = من اليسار لليمين). */
  angle?: number;
  /** عددُ الأشرطة على عرض العنصر (reeded). */
  stripes?: number;
  /** قوّةُ الانكسار ٠..١ (reeded). */
  strength?: number;
  /** شدّةُ اللمعة ٠..١. */
  highlight?: number;
  /** حافّةٌ ذائبة: نصفُ قطرِ تلاشي الحدود كنسبةٍ من أصغر بُعدَي العنصر (٠ = حادّة). يصنع
   *  «الهالة» — حقلًا ملوّنًا يذوب في الأبيض كما في المرجع لا مستطيلًا يقطع الإطار. */
  feather?: number;
}

import { drawBlurred } from './canvasBlur';

type Ctx = CanvasRenderingContext2D;

const pool: HTMLCanvasElement[] = [];
function scratch(i: number, w: number, h: number): Ctx | null {
  if (typeof document === 'undefined') return null;
  if (!pool[i]) pool[i] = document.createElement('canvas');
  const c = pool[i];
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, w);
    c.height = Math.max(c.height, h);
  }
  const x = c.getContext('2d');
  if (!x) return null;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.filter = 'none';
  x.clearRect(0, 0, w, h);
  return x;
}

/** تدرّجُ الجسم في الإحداثيّات المحلّيّة، يَنساب مع الزمن ويتكرّر بلا فاصل. */
function bodyGradient(c: Ctx, g: GlassStyle, bw: number, bh: number, time: number): CanvasGradient {
  const cols = g.colors.length >= 2 ? g.colors : [g.colors[0] ?? '#ff4fa3', g.colors[0] ?? '#ff4fa3'];
  const a = (((g.angle ?? 90) - 90) * Math.PI) / 180;
  const span = Math.hypot(bw, bh) || 1;
  const shift = ((g.flow ?? 0) * time * bw) % (span * 2);
  const cx = bw / 2;
  const cy = bh / 2;
  const dx = Math.cos(a) * span;
  const dy = Math.sin(a) * span;
  // دورةٌ كاملةٌ = ضعفُ القطر، والألوانُ مرآةٌ فلا قفزة عند التكرار.
  const x0 = cx - dx - Math.cos(a) * shift;
  const y0 = cy - dy - Math.sin(a) * shift;
  const gr = c.createLinearGradient(x0, y0, x0 + dx * 4, y0 + dy * 4);
  const seq = [...cols, ...cols.slice(0, -1).reverse()];
  const rep = [...seq, ...seq.slice(1)];
  rep.forEach((col, i) => gr.addColorStop(i / (rep.length - 1), col));
  return gr;
}

/**
 * يرسم عنصرًا زجاجيًّا على `ctx` عند مصفوفته الحاليّة.
 * @param depth سُمكُ الأنبوب بالبكسل المحلّيّ — للنصّ نحو ٨٪ من مقاس الخطّ.
 * @param silhouette ترسم ظلَّ العنصر بأيّ لونٍ مصمت في إحداثيّاته المحلّيّة (0..bw, 0..bh).
 */
export function paintGlass(ctx: Ctx, bw: number, bh: number, time: number, g: GlassStyle, depth: number, silhouette: (c: Ctx) => void): void {
  const T = ctx.getTransform();
  const fr = Math.max(0, Math.min(0.5, g.feather ?? 0)) * Math.min(bw, bh);
  const pad = Math.max(bw, bh) * 0.08 + depth * 2 + fr * 1.2;
  const pts = [
    [-pad, -pad],
    [bw + pad, -pad],
    [-pad, bh + pad],
    [bw + pad, bh + pad],
  ].map(([x, y]) => ({ x: T.a * x + T.c * y + T.e, y: T.b * x + T.d * y + T.f }));
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const bx = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
  const by = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))));
  const ex = Math.min(cw, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const ey = Math.min(ch, Math.ceil(Math.max(...pts.map((p) => p.y))));
  const W = ex - bx;
  const H = ey - by;
  if (W <= 0 || H <= 0) return;
  const M = scratch(0, W, H); // الظلّ
  const A = scratch(1, W, H); // الناتج
  const B = scratch(2, W, H); // مؤقّت
  if (!M || !A || !B) {
    ctx.fillStyle = g.colors[0] ?? '#000';
    silhouette(ctx);
    return;
  }
  const local = new DOMMatrix([T.a, T.b, T.c, T.d, T.e - bx, T.f - by]);
  const s = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1; // بكسلُ جهازٍ لكلّ بكسلٍ محلّيّ
  const r = Math.max(0.5, depth * s);

  // ١. الظلّ.
  M.setTransform(local);
  M.fillStyle = '#000';
  M.strokeStyle = '#000';
  silhouette(M);
  M.setTransform(1, 0, 0, 1, 0, 0);

  const body = (c: Ctx) => {
    c.setTransform(local);
    c.fillStyle = bodyGradient(c, g, bw, bh, time);
    c.fillRect(-pad, -pad, bw + pad * 2, bh + pad * 2);
    c.setTransform(1, 0, 0, 1, 0, 0);
  };

  if (g.mode === 'tube') {
    // ٢. الحافّة الباردة تملأ الظلّ كلَّه.
    A.drawImage(M.canvas, 0, 0, W, H, 0, 0, W, H);
    A.globalCompositeOperation = 'source-in';
    A.fillStyle = g.rim ?? '#9db2ff';
    A.fillRect(0, 0, W, H);
    // ٣. الجسم: ظلٌّ مُضبَّبٌ ملوَّنٌ بالتدرّج، يُوضع داخل الحروف — قربَ الحافّة تقلّ
    //    كثافتُه فيظهر لونُ الحافّة، وفي العمق يغلب الجسم. هذا هو «الأنبوب».
    B.drawImage(M.canvas, 0, 0, W, H, 0, 0, W, H);
    B.globalCompositeOperation = 'source-in';
    body(B);
    B.globalCompositeOperation = 'source-over';
    A.globalCompositeOperation = 'source-atop';
    // ثلاثُ طبقاتٍ مضبَّبة تُشبع العمق فيبقى لونُ الحافّة شريطًا رفيعًا لا ضبابًا شاحبًا.
    for (let i = 0; i < 2; i++) drawBlurred(A, B.canvas, 0, 0, W, H, 0, 0, r * 0.45);
    // ٤. القلب الحارّ في أعمق نقطة.
    if (g.core) {
      B.globalCompositeOperation = 'source-over';
      B.clearRect(0, 0, W, H);
      B.drawImage(M.canvas, 0, 0, W, H, 0, 0, W, H);
      B.globalCompositeOperation = 'source-in';
      B.fillStyle = g.core;
      B.fillRect(0, 0, W, H);
      // قلبٌ حارٌّ متدرّج لا مصمت: انتشارٌ واسع بشفافيّةٍ جزئيّة يرسم خطَّ وسطِ كلّ ضربة.
      A.globalAlpha = 0.85;
      drawBlurred(A, B.canvas, 0, 0, W, H, 0, 0, r * 1.3);
      A.globalAlpha = 1;
    }
    // ٥. الانكسارُ البارد أسفلَ كلّ حرف: هلالٌ بلون الحافّة — الظلُّ ناقصَ نفسِه مُزاحًا للأعلى.
    B.globalCompositeOperation = 'source-over';
    B.clearRect(0, 0, W, H);
    B.drawImage(M.canvas, 0, 0, W, H, 0, 0, W, H);
    B.globalCompositeOperation = 'source-in';
    B.fillStyle = g.rim ?? '#9db2ff';
    B.fillRect(0, 0, W, H);
    B.globalCompositeOperation = 'destination-out';
    B.drawImage(M.canvas, 0, 0, W, H, 0, -Math.max(1, r * 0.22), W, H);
    B.globalCompositeOperation = 'source-over';
    A.globalCompositeOperation = 'source-atop';
    A.globalAlpha = 0.85;
    drawBlurred(A, B.canvas, 0, 0, W, H, 0, 0, Math.max(0.5, r * 0.14));
    A.globalAlpha = 1;
  } else {
    // ٢. حقلُ الألوان كلُّه — لا داخل الظلّ — فلا تَعُضّ العدسةُ حافّةَ الشكل بفراغ.
    body(B);
    // ٣. الانكسار: كلُّ شريطٍ يعرض ما تحته مضغوطًا أو مكبَّرًا من مركزه — عدسةٌ أسطوانيّة.
    const stripes = Math.max(2, Math.round(g.stripes ?? 7));
    const sw = Math.max(2, (bw * s) / stripes);
    const k = sw * Math.max(0, Math.min(1, g.strength ?? 0.6)) * 0.9;
    for (let x = -sw; x < W + sw; x += sw) {
      A.drawImage(B.canvas, x - k, 0, sw + 2 * k, H, x, 0, sw, H);
    }
    // ٤. الشكلُ يبقى شكلَه: الانكسار داخل الظلّ وحده.
    A.globalCompositeOperation = 'destination-in';
    A.drawImage(M.canvas, 0, 0, W, H, 0, 0, W, H);
    // ٥. ضلوعُ الزجاج: حافّةٌ مضيئة وأخرى معتمة لكلّ شريط.
    A.globalCompositeOperation = 'source-atop';
    for (let x = -sw; x < W + sw; x += sw) {
      const gr = A.createLinearGradient(x, 0, x + sw, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.28)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.04)');
      gr.addColorStop(0.8, 'rgba(40,0,80,0.06)');
      gr.addColorStop(1, 'rgba(40,0,80,0.16)');
      A.fillStyle = gr;
      A.fillRect(x, 0, sw, H);
    }
  }

  // ٥/٦. اللمعة: هلالٌ أبيض على الحافّة العليا — الظلُّ ناقصَ نفسِه مُزاحًا للأسفل.
  const hi = g.highlight ?? 0.85;
  if (hi > 0) {
    B.globalCompositeOperation = 'source-over';
    B.filter = 'none';
    B.clearRect(0, 0, W, H);
    B.drawImage(M.canvas, 0, 0, W, H, 0, 0, W, H);
    B.globalCompositeOperation = 'source-in';
    B.fillStyle = '#ffffff';
    B.fillRect(0, 0, W, H);
    B.globalCompositeOperation = 'destination-out';
    const o = Math.max(1, r * 0.18);
    B.drawImage(M.canvas, 0, 0, W, H, o * 0.4, o, W, H);
    B.globalCompositeOperation = 'source-over';
    A.globalCompositeOperation = 'source-atop';
    A.globalAlpha = hi;
    drawBlurred(A, B.canvas, 0, 0, W, H, 0, 0, Math.max(0.5, r * 0.1));
    A.globalAlpha = 1;
  }

  // ٧. الحافّة الذائبة: الناتجُ داخل ظلٍّ مُضبَّب — الشكلُ يذوب في الخلفيّة.
  if (fr > 0) {
    B.globalCompositeOperation = 'source-over';
    B.globalAlpha = 1;
    B.clearRect(0, 0, W, H);
    drawBlurred(B, M.canvas, 0, 0, W, H, 0, 0, fr * s * 0.5);
    A.globalCompositeOperation = 'destination-in';
    A.drawImage(B.canvas, 0, 0, W, H, 0, 0, W, H);
  }

  A.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(A.canvas, 0, 0, W, H, bx, by, W, H);
  ctx.restore();
}
