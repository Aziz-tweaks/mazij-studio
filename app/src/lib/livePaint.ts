/** **خاماتٌ وعناصرُ حيّة تُرسَم بالقُماش** (١ نوفمبر ٢٠٢٦) — رسّامٌ واحدٌ للمعاينة والتصدير،
 * يُنادى من `paintGlass` نفسِها، فما يُرى على اللوحة هو ما يُصدَّر.
 *
 * - `frost` — زجاجٌ مضبَّبٌ داكن للبطاقات: جسمٌ داكنٌ شفّاف، وصبغة، ولمعةٌ من فوق، وحدٌّ
 *   أبيضُ شفّاف، وظلٌّ ساقط أو توهّجٌ ملوّن.
 * - `wave` — موجةُ صوتٍ حيّة: أعمدةٌ تتراقص، وما «شُغِّل» منها ملوَّنٌ متوهّج.
 * - `chart` — منحنًى يرسم نفسه من اليسار لليمين، بتعبئةٍ تحته ونقطةٍ نابضةٍ على رأسه.
 * - `ring` — حلقةُ تقدّمٍ تتعبّأ بتدرّجٍ متوهّج، ويتحوّل لونُها عند الوصول.
 * - `sheen` — لمعةُ ضوءٍ تعبر حروفَ نصٍّ (تُلبَس نسخةً من النصّ فوقه).
 *
 * كلُّ الأزمنة هنا **ثوانٍ مطلقة** على الخطّ الزمنيّ، وكلُّ الأطوال **بكسلٌ محلّيٌّ** في صندوق
 * العنصر. والظلالُ تُضرَب في مقياس المصفوفة لأنّ ظلَّ القُماش لا يعرف المصفوفة. */

import { alphaShadow } from './shadowAlpha';
type Ctx = CanvasRenderingContext2D;

export interface FrostStyle {
  /** لونُ الجسم (افتراضيًّا داكنٌ شفّاف). */
  body?: string;
  /** صبغةٌ فوق الجسم. */
  tint?: string;
  /** لونُ الحدّ. */
  edge?: string;
  edgeWidth?: number;
  /** شدّةُ اللمعة العلويّة ٠..١ (افتراضيًّا ٠٫١٣). */
  sheen?: number;
  /** توهّجٌ ملوّنٌ بدل الظلّ الساقط (لونٌ أو غيابه). */
  glow?: string;
  /** ظلٌّ ساقط: شفافيّته (افتراضيًّا ٠٫٤٥، و٠ يلغيه). */
  shadow?: number;
}

export interface WaveStyle {
  bars?: number;
  barWidth?: number;
  /** متى تبدأ الأعمدة بالتراقص، ومتى يكتمل التشغيل (ثوانٍ مطلقة). */
  playFrom: number;
  playTo: number;
  /** صفرُ طور الحركة (ثانيةٌ مطلقة). */
  phase?: number;
  played?: string;
  unplayed?: string;
  glow?: string;
}

export interface ChartStyle {
  /** نقاطُ المنحنى ٠..١ من الأسفل، متساويةُ التباعد من اليسار لليمين. */
  points: number[];
  from: number;
  to: number;
  stroke?: string;
  width?: number;
  glow?: string;
  area?: string;
  head?: string;
  headRadius?: number;
}

export interface RingStyle {
  /** القيمتان ٠..١٠٠ والزمنان المطلقان (تخفيفٌ تكعيبيٌّ للخارج، ويُقرَّب للأدنى كالعدّاد). */
  valueFrom: number;
  valueTo: number;
  from: number;
  to: number;
  /** متى يتحوّل اللونُ (ثانيةٌ مطلقة). */
  hitAt?: number;
  width?: number;
  track?: string;
  colors?: [string, string];
  hitColors?: [string, string];
  glow?: string;
  hitGlow?: string;
}

export interface SheenStyle {
  from: number;
  to: number;
  /** نصفُ عرض الشريط كنسبةٍ من عرض الصندوق. */
  band?: number;
  color?: string;
  /** مدى العبور كنسبةٍ من عرض الصندوق خارج كلّ طرف. */
  travel?: number;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t: number, a: number, b: number) => clamp((t - a) / Math.max(1e-6, b - a));
const ioC = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const oC = (u: number) => 1 - Math.pow(1 - u, 3);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** مقياسُ المصفوفة الحاليّة: بكسلُ قُماشٍ لكلّ بكسلٍ محلّيّ. */
function matScale(ctx: Ctx): number {
  const T = ctx.getTransform();
  return Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1;
}

export function paintFrost(ctx: Ctx, _bw: number, bh: number, shape: (c: Ctx) => void, f: FrostStyle, unit = 1): void {
  const s = matScale(ctx) * unit;
  ctx.save();
  if (f.glow) {
    ctx.shadowColor = alphaShadow(ctx, f.glow);
    ctx.shadowBlur = 70 * s;
  } else if ((f.shadow ?? 0.45) > 0) {
    ctx.shadowColor = alphaShadow(ctx, `rgba(0,0,0,${f.shadow ?? 0.45})`);
    ctx.shadowBlur = 60 * s;
    ctx.shadowOffsetY = 24 * s;
  }
  shape(ctx);
  ctx.fillStyle = f.body ?? 'rgba(8,30,22,.55)';
  ctx.fill();
  ctx.restore();
  ctx.save();
  shape(ctx);
  ctx.fillStyle = f.tint ?? 'rgba(255,255,255,.075)';
  ctx.fill();
  const hl = ctx.createLinearGradient(0, 0, 0, bh * 0.6);
  hl.addColorStop(0, `rgba(255,255,255,${f.sheen ?? 0.13})`);
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fill();
  ctx.lineWidth = (f.edgeWidth ?? 2.5) * unit;
  ctx.strokeStyle = f.edge ?? 'rgba(255,255,255,.2)';
  ctx.stroke();
  ctx.restore();
}

export function paintWave(ctx: Ctx, bw: number, bh: number, time: number, w: WaveStyle, unit = 1): void {
  const s = matScale(ctx) * unit;
  const n = Math.max(2, Math.round(w.bars ?? 28));
  const bwid = (w.barWidth ?? 14) * unit;
  const step = (bw - bwid) / (n - 1);
  const u = time - (w.phase ?? 0);
  const amp = time >= w.playFrom ? clamp((time - w.playFrom) * 3) : 0;
  const pp = prog(time, w.playFrom, w.playTo);
  const hu = bh / 124;
  for (let i = 0; i < n; i++) {
    const h = (14 + (Math.abs(Math.sin(i * 1.7 + u * 7)) * 70 + Math.abs(Math.sin(i * 0.6 + u * 3)) * 40) * amp) * hu;
    const played = i / n < pp;
    ctx.save();
    ctx.fillStyle = played ? (w.played ?? '#7FE8BE') : (w.unplayed ?? 'rgba(244,241,232,.25)');
    if (played && w.glow !== 'none') {
      ctx.shadowColor = alphaShadow(ctx, w.glow ?? 'rgba(127,232,190,.8)');
      ctx.shadowBlur = 16 * s;
    }
    ctx.beginPath();
    ctx.roundRect(i * step, bh / 2 - h / 2, bwid, h, bwid / 2);
    ctx.fill();
    ctx.restore();
  }
}

export function paintChart(ctx: Ctx, bw: number, bh: number, time: number, c: ChartStyle, unit = 1): void {
  const pts = c.points.length >= 2 ? c.points : [0, 1];
  const p = ioC(prog(time, c.from, c.to));
  if (p <= 0) return;
  const s = matScale(ctx) * unit;
  const n = pts.length - 1;
  const upto = p * n;
  const P = (i: number): [number, number] => [lerp(0, bw, i / n), bh - bh * pts[i]];
  const fi = Math.floor(upto);
  const fr = upto - fi;
  const head: [number, number] = fi < n ? [lerp(P(fi)[0], P(fi + 1)[0], fr), lerp(P(fi)[1], P(fi + 1)[1], fr)] : P(n);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, bh);
  for (let i = 0; i <= Math.min(fi, n); i++) ctx.lineTo(...P(i));
  ctx.lineTo(...head);
  ctx.lineTo(head[0], bh);
  ctx.closePath();
  const ag = ctx.createLinearGradient(0, 0, 0, bh);
  ag.addColorStop(0, c.area ?? 'rgba(127,232,190,.35)');
  ag.addColorStop(1, 'rgba(127,232,190,0)');
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(...P(0));
  for (let i = 1; i <= Math.min(fi, n); i++) ctx.lineTo(...P(i));
  ctx.lineTo(...head);
  ctx.strokeStyle = c.stroke ?? '#7FE8BE';
  ctx.lineWidth = (c.width ?? 12) * unit;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = alphaShadow(ctx, c.glow ?? 'rgba(127,232,190,.9)');
  ctx.shadowBlur = 30 * s;
  ctx.stroke();
  ctx.fillStyle = c.head ?? '#F6B42C';
  ctx.shadowColor = alphaShadow(ctx, 'rgba(246,180,44,.9)');
  ctx.beginPath();
  ctx.arc(head[0], head[1], ((c.headRadius ?? 22) + 4 * Math.sin((time - c.from + 0.6) * 8)) * unit, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function paintRing(ctx: Ctx, bw: number, bh: number, time: number, r: RingStyle, unit = 1): void {
  const s = matScale(ctx) * unit;
  const lw = (r.width ?? 34) * unit;
  const R = Math.min(bw, bh) / 2 - lw / 2;
  const cx = bw / 2;
  const cy = bh / 2;
  const p = oC(prog(time, r.from, r.to));
  const v = Math.floor(r.valueFrom + (r.valueTo - r.valueFrom) * p + 1e-6);
  const hit = r.hitAt !== undefined && time >= r.hitAt;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = r.track ?? 'rgba(244,241,232,.1)';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  const cols = hit ? (r.hitColors ?? ['#F6B42C', '#10A06B']) : (r.colors ?? ['#7FE8BE', '#10A06B']);
  const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  g.addColorStop(0, cols[0]);
  g.addColorStop(1, cols[1]);
  ctx.strokeStyle = g;
  ctx.shadowColor = alphaShadow(ctx, hit ? (r.hitGlow ?? 'rgba(246,180,44,.8)') : (r.glow ?? 'rgba(127,232,190,.8)'));
  ctx.shadowBlur = 40 * s;
  ctx.beginPath();
  ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 - (Math.PI * 2 * clamp(v / 100)), true);
  ctx.stroke();
  ctx.restore();
}

/** لمعةٌ تعبر الحروف: يُرسَم ظلُّ النصّ مصمتًا ثم يُلوَّن بشريطٍ متدرّجٍ يتحرّك من اليمين لليسار. */
export function paintSheen(ctx: Ctx, bw: number, _bh: number, time: number, sh: SheenStyle, silhouette: (c: Ctx) => void): void {
  const p = prog(time, sh.from, sh.to);
  if (p <= 0 || p >= 1) return;
  const travel = sh.travel ?? 0.6;
  const x = lerp(bw / 2 + bw * travel, bw / 2 - bw * travel, ioC(p));
  const half = bw * (sh.band ?? 0.16);
  const g = ctx.createLinearGradient(x - half, 0, x + half, 0);
  const col = sh.color ?? 'rgba(255,255,255,.75)';
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, col);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  const orig = ctx.fillStyle;
  ctx.fillStyle = g;
  // الظلُّ يُرسَم بلون `fillStyle` الحاليّ — فيصير هو الشريطَ نفسَه، محصورًا في الحروف.
  const proxy = new Proxy(ctx, {
    get(target, prop) {
      if (prop === 'fillStyle') return g;
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(target, prop, value) {
      if (prop === 'fillStyle' || prop === 'strokeStyle') return true;
      (target as unknown as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
  });
  silhouette(proxy as Ctx);
  ctx.fillStyle = orig;
  ctx.restore();
}
