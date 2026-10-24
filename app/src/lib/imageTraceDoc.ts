/** **تتبُّع عنصرِ صورةٍ في المستند** — الجسر بين `imageTrace.ts` (بكسلاتٌ ← مسارات،
 * بلا DOM) والمستند (عناصرُ بإحداثيّاتٍ كسريّةٍ من اللوحة).
 *
 * يُتتبَّع **ما يُرى في الإطار** لا الملفّ كلّه: الملاءمةُ والقصّ والتكبير
 * (`computeImageCropLayout` — المعادلة نفسها التي ترسم بها المعاينةُ والتصديران
 * الصورة) تقرّر أيّ جزءٍ من الصورة ظاهر، فيُقصّ هو وحده ويُتتبَّع، ثم توضع الأشكال
 * فوق ما رُسم بالضبط: بالقلب والتدوير نفسيهما، كلُّ شكلٍ بصندوقه المحكم ودورانه حول
 * مركزه — وهو الدورانُ نفسه حول مركز الصورة بعد إزاحة المركز.
 *
 * والقطعة ذات المحيط الواحد تصير مسارًا بنقاطٍ ومقابض (`points`/`handles`) يُحرَّر
 * بأداة النقاط كأيّ مسارٍ رُسم بالقلم؛ وذات الثقوب المقصوصة تصير مخطّطًا مركّبًا
 * (`outline`) كمخطّط النصّ — الثقوب بالتفافٍ معاكس، فتُثقَب بقاعدة nonzero. */

import type { DocElement, ElementAnim, Geometry, ImageElement } from '../state/elements';
import { newElementId } from '../state/elements';
import { newFillLayer } from './appearance';
import { computeImageCropLayout } from './imageCrop';
import type { PathCmd } from './pathGeometry';
import { traceImage, type RgbaImage, type TraceAnchor, type TraceOptions, type TraceResult } from './imageTrace';

/** أطول ضلعٍ يُتتبَّع بالبكسل. صورةٌ أكبر تُصغَّر أوّلًا: الحوافُّ تبقى بدقّةٍ تحت
 * البكسل، والزمنُ يبقى ثوانيَ لا دقائق. */
export const TRACE_MAX_SIDE = 2048;

/** أين يقع البكسل (0,0) من الصورة المتتبَّعة في إطار العنصر وكم بكسلًا من الإطار
 * يساوي بكسلُها (`ax/ay/sx/sy`)، ثم كيف يُقلَب الإطار ويُدار ويوضع على اللوحة. كلّها
 * بكسلاتُ لوحة. */
export interface TracePlacement {
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  /** مقاس الإطار نفسه. */
  bw: number;
  bh: number;
  flipH: boolean;
  flipV: boolean;
  /** زاوية الإطار العليا اليسرى قبل الدوران. */
  frameX: number;
  frameY: number;
  rotation: number;
  artW: number;
  artH: number;
}

/** الجزء الظاهر من الصورة داخل إطارها: مستطيلُه في بكسلات الملفّ (`u0…sv`)، وموضعُه
 * في الإطار (`fx0…fh`). `null` = لا شيء ظاهر (صورةٌ مُزاحةٌ خارج إطارها كلّها). */
export function visibleSource(
  el: Pick<ImageElement, 'geo' | 'fit' | 'cropX' | 'cropY' | 'cropScale'>,
  art: { w: number; h: number },
  natural: { w: number; h: number },
): { u0: number; v0: number; su: number; sv: number; fx0: number; fy0: number; fw: number; fh: number; bw: number; bh: number } | null {
  const bw = el.geo.w * art.w;
  const bh = el.geo.h * art.h;
  if (!(bw > 0) || !(bh > 0) || !(natural.w > 0) || !(natural.h > 0)) return null;
  const L = computeImageCropLayout({ w: bw, h: bh }, natural, el.fit, el.cropX, el.cropY, el.cropScale);
  const kx = L.dw / natural.w;
  const ky = L.dh / natural.h;
  const fx0 = Math.max(0, L.tx);
  const fy0 = Math.max(0, L.ty);
  const fx1 = Math.min(bw, L.tx + L.dw);
  const fy1 = Math.min(bh, L.ty + L.dh);
  if (fx1 - fx0 < 1 || fy1 - fy0 < 1) return null;
  return { u0: (fx0 - L.tx) / kx, v0: (fy0 - L.ty) / ky, su: (fx1 - fx0) / kx, sv: (fy1 - fy0) / ky, fx0, fy0, fw: fx1 - fx0, fh: fy1 - fy0, bw, bh };
}

/** أقصى امتدادٍ لمنحنى بيزييه تكعيبيٍّ على محورٍ واحد: طرفاه وجذور مشتقّته. */
function cubicExtent(a: number, b: number, c: number, d: number): [number, number] {
  let lo = Math.min(a, d);
  let hi = Math.max(a, d);
  // B'(t)/3 = (−a+3b−3c+d)t² + 2(a−2b+c)t + (b−a)
  const A = -a + 3 * b - 3 * c + d;
  const B = 2 * (a - 2 * b + c);
  const C = b - a;
  const roots: number[] = [];
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) > 1e-12) roots.push(-C / B);
  } else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      roots.push((-B + sq) / (2 * A), (-B - sq) / (2 * A));
    }
  }
  for (const t of roots) {
    if (t <= 0 || t >= 1) continue;
    const u = 1 - t;
    const v = u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

type Anchor = { x: number; y: number; in: { x: number; y: number } | null; out: { x: number; y: number } | null };

/** الصندوق المحكم لمحيطاتٍ مغلقة: نقاطُها وأقصى ما تبلغه منحنياتها (لا مقابضها). */
function tightBox(contours: Anchor[][]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of contours) {
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      const c1 = a.out ? { x: a.x + a.out.x, y: a.y + a.out.y } : a;
      const c2 = b.in ? { x: b.x + b.in.x, y: b.y + b.in.y } : b;
      const [lx, hx] = cubicExtent(a.x, c1.x, c2.x, b.x);
      const [ly, hy] = cubicExtent(a.y, c1.y, c2.y, b.y);
      if (lx < x0) x0 = lx;
      if (hx > x1) x1 = hx;
      if (ly < y0) y0 = ly;
      if (hy > y1) y1 = hy;
    }
  }
  return { x: x0, y: y0, w: Math.max(x1 - x0, 0.01), h: Math.max(y1 - y0, 0.01) };
}

/** صندوقٌ في إطار الصورة (قبل دورانه) ← هندسةُ عنصرٍ على اللوحة: يُدار مركزه حول مركز
 * الإطار، ويأخذ الشكلُ زاويةَ الصورة نفسها. */
function geoOf(pl: TracePlacement, box: { x: number; y: number; w: number; h: number }): Geometry {
  const cx = box.x + box.w / 2 - pl.bw / 2;
  const cy = box.y + box.h / 2 - pl.bh / 2;
  const t = (pl.rotation * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const X = pl.frameX + pl.bw / 2 + cx * cos - cy * sin;
  const Y = pl.frameY + pl.bh / 2 + cx * sin + cy * cos;
  return { x: (X - box.w / 2) / pl.artW, y: (Y - box.h / 2) / pl.artH, w: box.w / pl.artW, h: box.h / pl.artH, rotation: pl.rotation };
}

export interface TracedElementsOptions {
  groupId: string;
  opacity: number;
  /** حركةُ الصورة الأصليّة: تُنسخ إلى كلّ شكلٍ فيظهر المتتبَّع كما كانت تظهر. */
  anim: ElementAnim;
  /** اسمُ مستطيل الخلفيّة في قائمة الطبقات. */
  backgroundName: string;
  /** تدويرُ زوايا إطار الصورة (كسرٌ من أصغر ضلعيه، `ImageElement.radius`): الصورة
   * تُقَصّ به، فمستطيلُ الخلفيّة الذي يملأ الإطار يأخذه — وإلّا ظهرت زواياه حادّةً حيث
   * كانت الصورة مدوَّرة. */
  frameRadius?: number;
}

/** نتيجةُ التتبّع (بكسلات الصورة المقصوصة) ← عناصرُ المستند، بترتيب الرسم: الخلفيّة
 * أوّلًا ثم القطع من الأكبر إلى الأصغر. كلّها في مجموعةٍ واحدة. دالّةٌ محضة. */
export function tracedElements(res: TraceResult, pl: TracePlacement, opts: TracedElementsOptions): DocElement[] {
  const fx = (x: number) => {
    const v = pl.ax + x * pl.sx;
    return pl.flipH ? pl.bw - v : v;
  };
  const fy = (y: number) => {
    const v = pl.ay + y * pl.sy;
    return pl.flipV ? pl.bh - v : v;
  };
  const hv = (h: { x: number; y: number } | null) => (h ? { x: (pl.flipH ? -h.x : h.x) * pl.sx, y: (pl.flipV ? -h.y : h.y) * pl.sy } : null);
  const toFrame = (c: TraceAnchor[]): Anchor[] => c.map((a) => ({ x: fx(a.x), y: fy(a.y), in: hv(a.in), out: hv(a.out) }));
  const anim = (): ElementAnim => JSON.parse(JSON.stringify(opts.anim)) as ElementAnim;
  const base = (geo: Geometry, color: string) => ({
    visible: true,
    locked: false,
    opacity: opts.opacity,
    maskId: null,
    anim: anim(),
    geo,
    groupId: opts.groupId,
    fill: color,
    fillToken: 'fg' as const,
    stroke: null,
    strokeWidth: 0,
    radius: 0,
    // مظهرٌ صريح: مسارٌ بلا مظهرٍ يأخذ حدًّا افتراضيًّا بسُمك ٢ (`migrateAppearance`)،
    // والمتتبَّع تعبئةٌ محضة بلونها كما في الصورة.
    appearance: { fills: [newFillLayer({ color })], strokes: [], shadows: [] },
  });

  const out: DocElement[] = [];
  if (res.background) {
    const x0 = fx(0);
    const x1 = fx(res.width);
    const y0 = fy(0);
    const y1 = fy(res.height);
    const box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    const fillsFrame = box.x < 0.5 && box.y < 0.5 && box.w > pl.bw - 1 && box.h > pl.bh - 1;
    out.push({
      id: newElementId('trace'),
      type: 'shape',
      name: opts.backgroundName,
      shape: 'rect',
      ...base(geoOf(pl, box), res.background),
      radius: fillsFrame ? Math.max(0, opts.frameRadius ?? 0) : 0,
    });
  }
  for (const sh of res.shapes) {
    const contours = sh.contours.map(toFrame);
    if (!contours.length || contours[0].length < 2) continue;
    const box = tightBox(contours.slice(0, 1));
    const px = (a: { x: number; y: number }) => ({ x: (a.x - box.x) / box.w, y: (a.y - box.y) / box.h });
    const pv = (h: { x: number; y: number } | null) => (h ? { x: h.x / box.w, y: h.y / box.h } : null);
    const geo = geoOf(pl, box);
    if (contours.length === 1) {
      const c = contours[0];
      const curved = c.some((a) => a.in || a.out);
      out.push({
        id: newElementId('trace'),
        type: 'shape',
        shape: 'path',
        ...base(geo, sh.color),
        points: c.map(px),
        ...(curved ? { handles: c.map((a) => (a.in || a.out ? { in: pv(a.in), out: pv(a.out) } : null)) } : {}),
        closed: true,
      });
      continue;
    }
    const outline: PathCmd[] = [];
    for (const c of contours) {
      const p0 = px(c[0]);
      outline.push({ c: 'M', x: p0.x, y: p0.y });
      for (let i = 0; i < c.length; i++) {
        const a = c[i];
        const b = c[(i + 1) % c.length];
        const pb = px(b);
        if (a.out || b.in) {
          const c1 = px(a.out ? { x: a.x + a.out.x, y: a.y + a.out.y } : a);
          const c2 = px(b.in ? { x: b.x + b.in.x, y: b.y + b.in.y } : b);
          outline.push({ c: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: pb.x, y: pb.y });
        } else if (i < c.length - 1) {
          outline.push({ c: 'L', x: pb.x, y: pb.y });
        }
      }
      outline.push({ c: 'Z' });
    }
    out.push({ id: newElementId('trace'), type: 'shape', shape: 'path', ...base(geo, sh.color), closed: true, outline });
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = src;
  });
}

/** ما سيُتتبَّع وأين يقع: مستطيلُ الملفّ الظاهر (`src`)، ومقاسُ اللوح الذي يُرسَم عليه
 * (`rw×rh`، بحدّ `maxSide`)، وكيف يعود بكسلُ ذلك اللوح إلى اللوحة (`placement`). دالّةٌ
 * محضة — يقيسها `qa/image-trace.spec.mjs` على سلسلة المُصيِّر نفسها. */
export function placementFor(
  el: Pick<ImageElement, 'geo' | 'fit' | 'cropX' | 'cropY' | 'cropScale' | 'flipH' | 'flipV'>,
  art: { w: number; h: number },
  natural: { w: number; h: number },
  maxSide = TRACE_MAX_SIDE,
): { src: { u0: number; v0: number; su: number; sv: number }; rw: number; rh: number; placement: TracePlacement } | null {
  const vis = visibleSource(el, art, natural);
  if (!vis) return null;
  const k = Math.min(1, maxSide / Math.max(vis.su, vis.sv));
  const rw = Math.max(1, Math.round(vis.su * k));
  const rh = Math.max(1, Math.round(vis.sv * k));
  return {
    src: { u0: vis.u0, v0: vis.v0, su: vis.su, sv: vis.sv },
    rw,
    rh,
    placement: {
      ax: vis.fx0,
      ay: vis.fy0,
      sx: vis.fw / rw,
      sy: vis.fh / rh,
      bw: vis.bw,
      bh: vis.bh,
      flipH: !!el.flipH,
      flipV: !!el.flipV,
      frameX: el.geo.x * art.w,
      frameY: el.geo.y * art.h,
      rotation: el.geo.rotation || 0,
      artW: art.w,
      artH: art.h,
    },
  };
}

/** يرسم الجزء الظاهر من الصورة على لوحٍ بمقاسه ويقرأ بكسلاته. */
export async function rasterizeVisible(el: ImageElement, art: { w: number; h: number }): Promise<{ img: RgbaImage; placement: TracePlacement }> {
  if (!el.src) throw new Error('no-src');
  const image = await loadImage(el.src);
  // صورة SVG بلا مقاسٍ ذاتيّ تُعطي صفرًا: فالمقاسُ المحفوظ، ثم الإطار.
  const natural = {
    w: image.naturalWidth || el.naturalW || el.geo.w * art.w,
    h: image.naturalHeight || el.naturalH || el.geo.h * art.h,
  };
  const plan = placementFor(el, art, natural);
  if (!plan) throw new Error('empty');
  const canvas = document.createElement('canvas');
  canvas.width = plan.rw;
  canvas.height = plan.rh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, plan.src.u0, plan.src.v0, plan.src.su, plan.src.sv, 0, 0, plan.rw, plan.rh);
  const { data } = ctx.getImageData(0, 0, plan.rw, plan.rh);
  return { img: { width: plan.rw, height: plan.rh, data }, placement: plan.placement };
}

/** التتبّع في عاملٍ خلفيّ فلا تتجمّد الواجهة (صورةٌ كبيرة قد تأخذ ثوانيَ). وإن تعذّر
 * العامل — بيئةٌ بلا عمّال، أو فشلُ تحميله — فهنا في الخيط الرئيس بعد إطارٍ يُرسَم فيه
 * «جارٍ التتبّع…»: النتيجة نفسها، أبطأ قليلًا. */
export function runTrace(img: RgbaImage, opts: TraceOptions = {}): Promise<TraceResult> {
  return new Promise((resolve, reject) => {
    const inline = () => {
      setTimeout(() => {
        try {
          resolve(traceImage(img, opts));
        } catch (err) {
          reject(err);
        }
      }, 30);
    };
    let worker: Worker;
    try {
      worker = new Worker(new URL('./imageTrace.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      inline();
      return;
    }
    worker.onmessage = (e: MessageEvent<{ result?: TraceResult; error?: string }>) => {
      worker.terminate();
      if (e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error || 'trace'));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker.terminate();
      inline();
    };
    worker.postMessage({ width: img.width, height: img.height, data: img.data, opts });
  });
}

export interface TraceRun {
  result: TraceResult;
  placement: TracePlacement;
}

/** من عنصر الصورة إلى نتيجةٍ جاهزةٍ للوضع في المستند. */
export async function traceImageElement(el: ImageElement, art: { w: number; h: number }, opts: TraceOptions = {}): Promise<TraceRun> {
  const { img, placement } = await rasterizeVisible(el, art);
  const result = await runTrace(img, opts);
  return { result, placement };
}
