/** **مكتبةُ الفلاتر والمؤثّرات والانتقالات** (٢٨ أكتوبر ٢٠٢٦).
 *
 * **الفكرة: طبقةُ مؤثّر.** المؤثّرُ عنصرٌ في الطبقات (`FxElement`) لا يُرسَم بنفسه، بل
 * يُغيّر **كلَّ ما تحته** في مقطعه الزمنيّ — كطبقة التعديل في برامج الفيديو. فيُنقَل
 * ويُقصّ من حافّتيه ويُقفَل ويُخفى ويُحذَف ويُتراجَع عنه بالأدوات القائمة نفسها، ولا
 * واجهةَ ثانية. ما فوقه لا يتأثّر: نصٌّ فوق طبقة «أبيض وأسود» يبقى ملوّنًا.
 *
 * **وصيغةٌ واحدة يقرؤها الرسّامان.** `resolveFx` تُرجع وصفًا رقميًّا (عمليّات لونٍ
 * بمعاملاتها، ونصف قطر ضبابيّة، وتكبير، وإزاحة، وطبقات تغطية). المعاينةُ تحوّله إلى
 * CSS `filter`/`transform` (`fxCss`)، والتصديرُ يطبّقه بكسلًا بكسلًا بمعادلات مواصفة
 * Filter Effects نفسها التي يطبّقها المتصفّح (`applyFxToCanvas`) — فلا يعتمد التصدير
 * على `ctx.filter` في عمليّات اللون، وهي غير مضمونة في WebKit.
 *
 * **القوّة والزمن.** القوّةُ ٠..١ = `amount` × ظرفُ الزمن (تلاشي دخولٍ وخروج، أو قمّةٌ في
 * المنتصف للانتقالات) × شفافيّةُ العنصر المتحرّكة إن رُسمت لها مفاتيح. فالمصمّم يتحكّم
 * بالقوّة من شريطٍ واحد، وبوقت الظهور والاختفاء بسحب حافّتَي المقطع. */

export type FxCategory = 'filter' | 'effect' | 'transition';

export type FxKind =
  // فلاتر لونيّة
  | 'bw' | 'warm' | 'cool' | 'vintage' | 'vivid' | 'faded' | 'cinema' | 'noir' | 'night' | 'invert'
  // مؤثّرات
  | 'blur' | 'vignette' | 'grain' | 'shake' | 'pulse' | 'flicker' | 'glow'
  // انتقالات
  | 'tr_flash' | 'tr_dip' | 'tr_blur' | 'tr_zoom' | 'tr_shake';

export interface FxSpec {
  id: FxKind;
  cat: FxCategory;
  ar: string;
  en: string;
  /** المدّةُ الافتراضيّة عند الإضافة بالثواني. */
  defaultDuration: number;
}

export const FX_CATALOG: FxSpec[] = [
  { id: 'bw', cat: 'filter', ar: 'أبيض وأسود', en: 'Black & white', defaultDuration: 3 },
  { id: 'warm', cat: 'filter', ar: 'دافئ', en: 'Warm', defaultDuration: 3 },
  { id: 'cool', cat: 'filter', ar: 'بارد', en: 'Cool', defaultDuration: 3 },
  { id: 'vintage', cat: 'filter', ar: 'قديم', en: 'Vintage', defaultDuration: 3 },
  { id: 'vivid', cat: 'filter', ar: 'حيوي', en: 'Vivid', defaultDuration: 3 },
  { id: 'faded', cat: 'filter', ar: 'باهت', en: 'Faded', defaultDuration: 3 },
  { id: 'cinema', cat: 'filter', ar: 'سينمائي', en: 'Cinematic', defaultDuration: 3 },
  { id: 'noir', cat: 'filter', ar: 'درامي', en: 'Noir', defaultDuration: 3 },
  { id: 'night', cat: 'filter', ar: 'ليلي', en: 'Night', defaultDuration: 3 },
  { id: 'invert', cat: 'filter', ar: 'معكوس', en: 'Invert', defaultDuration: 3 },
  { id: 'blur', cat: 'effect', ar: 'ضبابية', en: 'Blur', defaultDuration: 3 },
  { id: 'vignette', cat: 'effect', ar: 'تعتيم الأطراف', en: 'Vignette', defaultDuration: 3 },
  { id: 'grain', cat: 'effect', ar: 'حبيبات فيلم', en: 'Film grain', defaultDuration: 3 },
  { id: 'shake', cat: 'effect', ar: 'اهتزاز', en: 'Shake', defaultDuration: 2 },
  { id: 'pulse', cat: 'effect', ar: 'نبض', en: 'Pulse', defaultDuration: 2 },
  { id: 'flicker', cat: 'effect', ar: 'وميض متقطّع', en: 'Flicker', defaultDuration: 2 },
  { id: 'glow', cat: 'effect', ar: 'إشراق', en: 'Glow', defaultDuration: 3 },
  { id: 'tr_flash', cat: 'transition', ar: 'وميض أبيض', en: 'Flash', defaultDuration: 0.6 },
  { id: 'tr_dip', cat: 'transition', ar: 'غمس للأسود', en: 'Dip to black', defaultDuration: 0.8 },
  { id: 'tr_blur', cat: 'transition', ar: 'ضبابية عابرة', en: 'Blur through', defaultDuration: 0.6 },
  { id: 'tr_zoom', cat: 'transition', ar: 'تكبير خاطف', en: 'Zoom punch', defaultDuration: 0.5 },
  { id: 'tr_shake', cat: 'transition', ar: 'هزّة', en: 'Jolt', defaultDuration: 0.5 },
];

export function fxSpec(kind: FxKind): FxSpec {
  return FX_CATALOG.find((f) => f.id === kind) ?? FX_CATALOG[0];
}

export function isFxKind(v: unknown): v is FxKind {
  return typeof v === 'string' && FX_CATALOG.some((f) => f.id === v);
}

/** عمليّةُ لونٍ بمعامل — أسماؤها أسماءُ دوالّ CSS `filter` بعينها. */
export type ColorOp =
  | { fn: 'grayscale' | 'sepia' | 'saturate' | 'brightness' | 'contrast' | 'invert'; v: number }
  | { fn: 'hue-rotate'; v: number /* درجات */ };

export type FxOverlay =
  | { kind: 'solid'; color: string; a: number }
  | { kind: 'vignette'; a: number }
  | { kind: 'grain'; a: number; seed: number };

export interface FxResolved {
  /** نصفُ قطر الضبابيّة كسرًا من عرض اللوح (يُطبَّق أوّلًا، قبل اللون). */
  blur: number;
  ops: ColorOp[];
  /** تكبيرٌ حول المركز، وإزاحةٌ كسرًا من **العرض** للمحورين (وحدةُ `cqw`). */
  zoom: number;
  dx: number;
  dy: number;
  overlays: FxOverlay[];
}

const IDENTITY: FxResolved = { blur: 0, ops: [], zoom: 1, dx: 0, dy: 0, overlays: [] };

/** ظرفُ الزمن عند اللحظة المحلّيّة `u` (ثوانٍ من بداية المقطع) لمقطعٍ طوله `d`. */
export function fxEnvelope(cat: FxCategory, u: number, d: number, fadeIn: number, fadeOut: number): number {
  if (d <= 0 || u < 0 || u > d) return 0;
  if (cat === 'transition') {
    // قمّةٌ واحدة في المنتصف: صفرٌ عند الحافّتين، فلا قفزةَ عند دخول المقطع أو خروجه.
    const p = u / d;
    return 0.5 - 0.5 * Math.cos(2 * Math.PI * p);
  }
  let e = 1;
  if (fadeIn > 0 && u < fadeIn) e = Math.min(e, u / fadeIn);
  if (fadeOut > 0 && d - u < fadeOut) e = Math.min(e, (d - u) / fadeOut);
  return Math.max(0, Math.min(1, e));
}

/** اهتزازٌ حتميّ: مجموعُ موجاتٍ بتردّداتٍ غير متناسبة — يبدو عشوائيًّا، ويعطي الإطارُ
 * نفسُه القيمةَ نفسَها في المعاينة والتصدير. */
function jitter(t: number, seed: number): number {
  return (Math.sin(t * 37.1 + seed) * 0.5 + Math.sin(t * 61.7 + seed * 2.3) * 0.3 + Math.sin(t * 91.3 + seed * 5.1) * 0.2);
}

/** الوصفُ الرقميّ للمؤثّر عند قوّةٍ `s` (٠..١، بعد الظرف) ولحظةٍ محلّيّة `u` (ثوانٍ). */
export function resolveFx(kind: FxKind, s: number, u: number): FxResolved {
  if (!(s > 0)) return IDENTITY;
  const r: FxResolved = { blur: 0, ops: [], zoom: 1, dx: 0, dy: 0, overlays: [] };
  switch (kind) {
    case 'bw':
      r.ops = [{ fn: 'grayscale', v: s }, { fn: 'contrast', v: 1 + 0.1 * s }];
      break;
    case 'warm':
      r.ops = [{ fn: 'sepia', v: 0.3 * s }, { fn: 'saturate', v: 1 + 0.3 * s }, { fn: 'hue-rotate', v: -8 * s }];
      break;
    case 'cool':
      r.ops = [{ fn: 'hue-rotate', v: 14 * s }, { fn: 'saturate', v: 1 - 0.1 * s }, { fn: 'brightness', v: 1 + 0.04 * s }];
      break;
    case 'vintage':
      r.ops = [{ fn: 'sepia', v: 0.55 * s }, { fn: 'contrast', v: 1 - 0.12 * s }, { fn: 'brightness', v: 1 + 0.06 * s }, { fn: 'saturate', v: 1 - 0.2 * s }];
      r.overlays = [{ kind: 'vignette', a: 0.35 * s }];
      break;
    case 'vivid':
      r.ops = [{ fn: 'saturate', v: 1 + 0.7 * s }, { fn: 'contrast', v: 1 + 0.1 * s }];
      break;
    case 'faded':
      r.ops = [{ fn: 'contrast', v: 1 - 0.25 * s }, { fn: 'brightness', v: 1 + 0.08 * s }, { fn: 'saturate', v: 1 - 0.3 * s }];
      break;
    case 'cinema':
      r.ops = [{ fn: 'contrast', v: 1 + 0.25 * s }, { fn: 'saturate', v: 1 - 0.15 * s }, { fn: 'brightness', v: 1 - 0.05 * s }];
      r.overlays = [{ kind: 'vignette', a: 0.3 * s }];
      break;
    case 'noir':
      r.ops = [{ fn: 'grayscale', v: s }, { fn: 'contrast', v: 1 + 0.6 * s }, { fn: 'brightness', v: 1 - 0.1 * s }];
      r.overlays = [{ kind: 'vignette', a: 0.45 * s }];
      break;
    case 'night':
      r.ops = [{ fn: 'brightness', v: 1 - 0.35 * s }, { fn: 'saturate', v: 1 - 0.3 * s }, { fn: 'hue-rotate', v: 20 * s }, { fn: 'contrast', v: 1 + 0.1 * s }];
      break;
    case 'invert':
      r.ops = [{ fn: 'invert', v: s }];
      break;
    case 'blur':
      r.blur = 0.02 * s;
      break;
    case 'vignette':
      r.overlays = [{ kind: 'vignette', a: 0.8 * s }];
      break;
    case 'grain':
      // البذرةُ تتغيّر كلَّ ١/١٢ ثانية: حبيباتٌ حيّة لا نقشٌ ثابت.
      r.overlays = [{ kind: 'grain', a: 0.4 * s, seed: Math.floor(u * 12) % GRAIN_SEEDS }];
      break;
    case 'shake': {
      const amp = 0.012 * s;
      r.zoom = 1 + 2.5 * amp;
      r.dx = amp * jitter(u, 1);
      r.dy = amp * jitter(u, 7);
      break;
    }
    case 'pulse': {
      const beat = 0.5 - 0.5 * Math.cos((2 * Math.PI * u) / 0.6);
      r.zoom = 1 + 0.06 * s * beat;
      break;
    }
    case 'flicker': {
      const on = Math.sin(u * 47.3) + Math.sin(u * 23.9) > 0.6 ? 1 : 0;
      r.ops = [{ fn: 'brightness', v: 1 + 0.45 * s * on }];
      break;
    }
    case 'glow':
      r.ops = [{ fn: 'brightness', v: 1 + 0.2 * s }, { fn: 'saturate', v: 1 + 0.25 * s }, { fn: 'contrast', v: 1 - 0.08 * s }];
      r.overlays = [{ kind: 'solid', color: '#ffffff', a: 0.08 * s }];
      break;
    case 'tr_flash':
      r.overlays = [{ kind: 'solid', color: '#ffffff', a: s }];
      r.ops = [{ fn: 'brightness', v: 1 + 0.5 * s }];
      break;
    case 'tr_dip':
      r.overlays = [{ kind: 'solid', color: '#000000', a: s }];
      break;
    case 'tr_blur':
      r.blur = 0.035 * s;
      break;
    case 'tr_zoom':
      r.zoom = 1 + 0.25 * s;
      r.blur = 0.006 * s;
      break;
    case 'tr_shake': {
      const amp = 0.03 * s;
      r.zoom = 1 + 2.2 * amp;
      r.dx = amp * jitter(u, 3);
      r.dy = amp * jitter(u, 11);
      break;
    }
  }
  return r;
}

/** القوّةُ الفعليّة للعنصر عند لحظةٍ على الخطّ الزمنيّ — صيغةٌ واحدة للرسّامَين. */
export function fxStrengthAt(
  el: { fx: FxKind; amount: number; fadeIn?: number; fadeOut?: number; opacity?: number },
  anim: { start: number; duration: number },
  t: number,
  animOpacity: number,
): { s: number; u: number } {
  const u = t - anim.start;
  const env = fxEnvelope(fxSpec(el.fx).cat, u, anim.duration, el.fadeIn ?? 0, el.fadeOut ?? 0);
  const base = Math.max(0, Math.min(1, el.amount)) * ((el.opacity ?? 100) / 100) * Math.max(0, Math.min(1, animOpacity));
  return { s: base * env, u };
}

// ———————————————————————— المعاينة (CSS) ————————————————————————

function opCss(op: ColorOp): string {
  return op.fn === 'hue-rotate' ? `hue-rotate(${op.v.toFixed(3)}deg)` : `${op.fn}(${op.v.toFixed(4)})`;
}

/** `filter` و`transform` لغلافِ ما تحت طبقة المؤثّر. الضبابيّةُ بـ`cqw` (اللوحُ حاضنٌ
 * بعرضه)، فلا تحتاج المعاينةُ أن تعرف مقاس اللوح — العقدُ نفسُه في `entranceStyleAt`. */
export function fxCss(r: FxResolved): { filter?: string; transform?: string } {
  const parts: string[] = [];
  if (r.blur > 0) parts.push(`blur(${(r.blur * 100).toFixed(4)}cqw)`);
  for (const op of r.ops) parts.push(opCss(op));
  const tr: string[] = [];
  if (r.dx !== 0 || r.dy !== 0) tr.push(`translate(${(r.dx * 100).toFixed(4)}cqw, ${(r.dy * 100).toFixed(4)}cqw)`);
  if (r.zoom !== 1) tr.push(`scale(${r.zoom.toFixed(5)})`);
  return { filter: parts.length ? parts.join(' ') : undefined, transform: tr.length ? tr.join(' ') : undefined };
}

/** خلفيّةُ CSS لطبقة التغطية — المعادلةُ نفسُها التي يرسمها `paintOverlay` على القُماش. */
export function overlayCss(o: FxOverlay): { background?: string; backgroundImage?: string; backgroundSize?: string; opacity?: number } {
  if (o.kind === 'solid') return { background: o.color, opacity: o.a };
  if (o.kind === 'vignette') {
    return { background: `radial-gradient(ellipse farthest-corner at 50% 50%, rgba(0,0,0,0) ${VIGNETTE_INNER * 100}%, rgba(0,0,0,1) 100%)`, opacity: o.a };
  }
  return { backgroundImage: `url(${grainTileUrl(o.seed)})`, backgroundSize: `${GRAIN_TILE_CQW}cqw ${GRAIN_TILE_CQW}cqw`, opacity: o.a };
}

const VIGNETTE_INNER = 0.42;

// ———————————————————————— الحبيبات ————————————————————————

const GRAIN_SEEDS = 8;
const GRAIN_TILE = 160;
/** حجمُ البلاطة كسرًا مئويًّا من عرض اللوح — والقُماشُ يرسمها بالنسبة نفسها. */
const GRAIN_TILE_CQW = 18;
const grainCanvases = new Map<number, HTMLCanvasElement>();
const grainUrls = new Map<number, string>();

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grainTile(seed: number): HTMLCanvasElement {
  const hit = grainCanvases.get(seed);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = GRAIN_TILE;
  c.height = GRAIN_TILE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(GRAIN_TILE, GRAIN_TILE);
  const rnd = mulberry32(seed * 7919 + 17);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() < 0.5 ? 0 : 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.round(rnd() * 160);
  }
  g.putImageData(img, 0, 0);
  grainCanvases.set(seed, c);
  return c;
}

function grainTileUrl(seed: number): string {
  let u = grainUrls.get(seed);
  if (!u) {
    u = grainTile(seed).toDataURL('image/png');
    grainUrls.set(seed, u);
  }
  return u;
}

// ———————————————————————— التصدير (القُماش) ————————————————————————

let canvasBlurSupport: boolean | null = null;
function canvasSupportsBlurFilter(): boolean {
  if (canvasBlurSupport === null) {
    // **يُقاس بالرسم لا بقراءة الخاصّيّة.** WebKit يقبل `ctx.filter` ويُعيده كما كُتب ثم
    // **لا يُطبّقه** (مقيسٌ في `qa/effects.spec.mjs` §٨ على WebKit: التصديرُ خرج حادًّا).
    // فنرسم نقطةً مضبَّبةً ونقرأ بكسلًا بجانبها: إن بقي فارغًا فلا ضبابيّة.
    try {
      const cv = document.createElement('canvas');
      cv.width = 9;
      cv.height = 9;
      const c = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D & { filter?: string };
      c.filter = 'blur(2px)';
      c.fillStyle = '#000';
      c.fillRect(4, 4, 1, 1);
      canvasBlurSupport = c.getImageData(7, 4, 1, 1).data[3] > 0;
    } catch {
      canvasBlurSupport = false;
    }
  }
  return canvasBlurSupport;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** مصفوفةُ ٣×٣ لعمليّات اللون الخطّيّة — معاملاتُها من مواصفة Filter Effects حرفيًّا. */
function opMatrix(op: ColorOp): number[] | null {
  switch (op.fn) {
    case 'grayscale': {
      const s = 1 - clamp01(op.v);
      return [0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s];
    }
    case 'sepia': {
      const s = 1 - clamp01(op.v);
      return [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s];
    }
    case 'saturate': {
      const s = Math.max(0, op.v);
      return [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
    }
    case 'hue-rotate': {
      const a = (op.v * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
      ];
    }
    default:
      return null;
  }
}

/** يطبّق عمليّات اللون على بايتات الصورة بالترتيب، مع القصّ إلى [٠،١] بعد كلّ عمليّة
 * كما يفعل المتصفّح بين بدائيّات الفلتر. */
export function applyColorOps(data: Uint8ClampedArray, ops: ColorOp[]): void {
  if (!ops.length) return;
  const prepared = ops.map((op) => ({ op, m: opMatrix(op) }));
  const n = data.length;
  for (let i = 0; i < n; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;
    for (const { op, m } of prepared) {
      if (m) {
        const nr = m[0] * r + m[1] * g + m[2] * b;
        const ng = m[3] * r + m[4] * g + m[5] * b;
        const nb = m[6] * r + m[7] * g + m[8] * b;
        r = clamp01(nr);
        g = clamp01(ng);
        b = clamp01(nb);
      } else if (op.fn === 'brightness') {
        r = clamp01(r * op.v);
        g = clamp01(g * op.v);
        b = clamp01(b * op.v);
      } else if (op.fn === 'contrast') {
        const k = op.v;
        const c0 = 0.5 - 0.5 * k;
        r = clamp01(r * k + c0);
        g = clamp01(g * k + c0);
        b = clamp01(b * k + c0);
      } else if (op.fn === 'invert') {
        const a = clamp01(op.v);
        r = a + r * (1 - 2 * a);
        g = a + g * (1 - 2 * a);
        b = a + b * (1 - 2 * a);
      }
    }
    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
}

/** ضبابيّةٌ احتياطيّة حين لا يعرف القُماشُ `ctx.filter` (WebKit): ثلاثُ تمريراتِ صندوقٍ
 * تقارب الغاوسيّة بانحرافٍ `sigma` — وهو معنى `blur(Npx)` في CSS. */
function boxBlurImage(img: ImageData, sigma: number): void {
  const w = img.width;
  const h = img.height;
  const boxes = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / boxes + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - boxes * wl * wl - 4 * boxes * wl - 3 * boxes) / (-4 * wl - 4));
  const radii = [0, 1, 2].map((i) => ((i < m ? wl : wu) - 1) / 2);
  const src = new Float32Array(img.data.length);
  for (let i = 0; i < src.length; i++) src[i] = img.data[i];
  const tmp = new Float32Array(src.length);
  const pass = (a: Float32Array, b: Float32Array, r: number, horiz: boolean) => {
    const len = horiz ? w : h;
    const lines = horiz ? h : w;
    const inv = 1 / (2 * r + 1);
    for (let line = 0; line < lines; line++) {
      for (let c = 0; c < 4; c++) {
        const idx = (k: number) => {
          const kk = k < 0 ? 0 : k >= len ? len - 1 : k;
          return ((horiz ? line * w + kk : kk * w + line) << 2) + c;
        };
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += a[idx(k)];
        for (let k = 0; k < len; k++) {
          b[idx(k)] = acc * inv;
          acc += a[idx(k + r + 1)] - a[idx(k - r)];
        }
      }
    }
  };
  for (const r of radii) {
    if (r <= 0) continue;
    pass(src, tmp, r, true);
    pass(tmp, src, r, false);
  }
  for (let i = 0; i < src.length; i++) img.data[i] = src[i];
}

function paintOverlay(ctx: CanvasRenderingContext2D, o: FxOverlay, w: number, h: number): void {
  if (!(o.a > 0)) return;
  ctx.save();
  ctx.globalAlpha = clamp01(o.a);
  if (o.kind === 'solid') {
    ctx.fillStyle = o.color;
    ctx.fillRect(0, 0, w, h);
  } else if (o.kind === 'vignette') {
    // قطعٌ ناقص يمرّ بالزاوية الأبعد (`farthest-corner`): نصفا قطره (w/√2, h/√2).
    ctx.translate(w / 2, h / 2);
    ctx.scale(1, h / w);
    const R = w / Math.SQRT2;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(VIGNETTE_INNER, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g;
    // في الفضاء المضغوط رأسيًّا يغطّي المربّعُ w×w اللوحَ كلَّه بالضبط.
    ctx.fillRect(-w / 2, -w / 2, w, w);
  } else {
    const tile = grainTile(o.seed);
    const size = (GRAIN_TILE_CQW / 100) * w;
    const pat = ctx.createPattern(tile, 'repeat');
    if (pat) {
      pat.setTransform(new DOMMatrix().scale(size / GRAIN_TILE));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.restore();
}

/** يطبّق المؤثّر على **كلّ ما رُسم على القُماش حتى الآن** — نظيرُ غلاف المعاينة الذي
 * يضمّ ما تحت الطبقة. الترتيبُ ترتيبُ CSS: الفلتر في الفضاء المحلّيّ (ضبابيّةٌ ثم لون)،
 * ثم التحويلُ، ثم طبقاتُ التغطية فوق الكلّ. */
export function applyFxToCanvas(ctx: CanvasRenderingContext2D, r: FxResolved): void {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  const hasPixelWork = r.blur > 0 || r.ops.length > 0 || r.zoom !== 1 || r.dx !== 0 || r.dy !== 0;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (hasPixelWork) {
    const work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    const wctx = work.getContext('2d', { willReadFrequently: true })!;
    const blurPx = r.blur * w;
    if (blurPx > 0 && canvasSupportsBlurFilter()) {
      (wctx as CanvasRenderingContext2D & { filter: string }).filter = `blur(${blurPx.toFixed(3)}px)`;
      wctx.drawImage(canvas, 0, 0);
      (wctx as CanvasRenderingContext2D & { filter: string }).filter = 'none';
      if (r.ops.length) {
        const img = wctx.getImageData(0, 0, w, h);
        applyColorOps(img.data, r.ops);
        wctx.putImageData(img, 0, 0);
      }
    } else {
      wctx.drawImage(canvas, 0, 0);
      if (blurPx > 0 || r.ops.length) {
        const img = wctx.getImageData(0, 0, w, h);
        if (blurPx > 0) boxBlurImage(img, blurPx);
        applyColorOps(img.data, r.ops);
        wctx.putImageData(img, 0, 0);
      }
    }
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2 + r.dx * w, h / 2 + r.dy * w);
    ctx.scale(r.zoom, r.zoom);
    ctx.drawImage(work, -w / 2, -h / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  for (const o of r.overlays) paintOverlay(ctx, o, w, h);
  ctx.restore();
}
