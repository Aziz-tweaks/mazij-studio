import type { Palette } from '../data/constants';
import type {
  AppearanceBlend,
  AppearanceFillLayer,
  AppearanceShadowLayer,
  AppearanceStrokeLayer,
  AppearanceStack,
  DocElement,
  StrokePosition,
} from '../state/elements';
import { newElementId, resolvePaletteToken } from '../state/elements';
import type { PathCmd } from './pathGeometry';
import type { StrokeWidthProfile } from './variableStroke';

/** Roadmap #17 — the single function every one of the three render paths (live DOM
 * preview in `ElementView.tsx`, canvas PNG/MP4/GIF frames in `exportArtboard.ts`'s
 * `drawElements`, and the SVG document builder `renderArtboardSvg`) calls to find out
 * *what to paint* for an element's fill/stroke/shadow — exactly the role
 * `shapeTextOnCurve` plays for "نص على مسار" (roadmap #12): one shared resolution
 * function, three format-specific consumers. Never re-derive fill/stroke/shadow layers
 * independently in a render path — always go through `resolveAppearance`. */
export interface ResolvedFillPaint {
  id: string;
  opacity: number;
  blend: AppearanceFillLayer['blend'];
  kind: 'solid' | 'gradient';
  color: string;
  gradient?: { angle: number; from: string; to: string };
}

export interface ResolvedStrokePaint {
  id: string;
  opacity: number;
  width: number;
  position: StrokePosition;
  color: string;
  /** مَلمحُ السُّمك المتغيّر إن وُجد — انظر `AppearanceStrokeLayer.widthProfile`.
   * `undefined` يعني حدًّا منتظمًا، وهو حال كلّ طبقةٍ في كلّ مستندٍ قائم. */
  widthProfile?: StrokeWidthProfile | null;
}

export interface ResolvedShadowPaint {
  id: string;
  opacity: number;
  kind: 'outer' | 'inner';
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

export interface ResolvedAppearance {
  fills: ResolvedFillPaint[];
  strokes: ResolvedStrokePaint[];
  shadows: ResolvedShadowPaint[];
}

function hasAnyLayer(a: AppearanceStack | undefined): a is AppearanceStack {
  return !!a && (a.fills.length > 0 || a.strokes.length > 0 || a.shadows.length > 0);
}

/** يصبغ **الطبقة القاعديّة** في كومة مظهرٍ مُجسَّدة سلفًا بلونٍ صريح، ويترك ما
 * عداها كما هو. ويُرجع `el.appearance` بلا تغيير إن لم تكن هناك كومة، فيبقى
 * المسار القديم (`migrateAppearance` من `fill`) هو العامل كما كان بالضبط.
 *
 * **سبب وجوده.** صفّ «اللون» في لوح الخصائص ينادي `setShapeFill` التي تكتب
 * الحقل القديم `el.fill` وحده، بينما `currentAppearance` تُفضّل الكومة متى
 * وُجدت — وكلّ شكل يُوضَع من المكتبة يُولَد بكومة (`libraryAppearance`). فكانت
 * شريحة اللون **تعمل في الحالة ولا تُرى على اللوحة**: حلقة «نشِط» تنتقل إلى
 * اللون المختار بينما يبقى الشكل رماديًّا — وهو بعينه الزرّ الميّت الذي يمنعه
 * هذا المشروع. (الأشكال المرسومة بالسحب لا كومة لها، فكانت تستجيب أصلًا.)
 *
 * ولونُ الشكل المفتوح (خطّ/سهم) هو لون **الحدّ** لا التعبئة، لأن كومته تُولَد
 * بطبقة حدٍّ واحدة بلا تعبئة؛ فصبغُ التعبئة وحدها كان سيُبقيه رماديًّا. ولهذا
 * تُعدَّل الكومة ولا تُمسح: مسحُها يُفقد طبقة الحدّ تلك (`el.stroke` فيها
 * `null`) فيختفي الخطّ عن اللوحة رأسًا. */
export function withBaseLayerColor(el: DocElement, hex: string): AppearanceStack | undefined {
  const a = el.appearance;
  if (!hasAnyLayer(a)) return a;
  if (a.fills.length > 0) {
    return { ...a, fills: a.fills.map((f, i) => (i === 0 ? { ...f, color: hex, colorToken: null } : f)) };
  }
  if (a.strokes.length > 0) {
    return { ...a, strokes: a.strokes.map((s, i) => (i === 0 ? { ...s, color: hex, colorToken: null } : s)) };
  }
  return a;
}

/** A reasonable literal fallback for a layer created from a palette-token legacy field
 * (e.g. a shape's `fillToken` with no explicit `fill`) — only ever shown if the user
 * later clears the token in the new layer editor; the token itself takes priority in
 * both `migrateAppearance`'s output and `resolveAppearance`'s resolution step, so this
 * value never affects a migrated document's actual rendered color. */
const TOKEN_FALLBACK_COLOR = '#8a8a8a';

/** Builds the one-layer-per-category stack a pre-roadmap-#17 element's legacy single
 * fields (`fill`/`fillToken`/`stroke`/`strokeWidth`/`color`) are equivalent to — the
 * "ترحيل بلا فقد" contract: a document saved before this roadmap item carries no
 * `appearance` at all, and this function is what both `normalizeDoc` (eagerly, at load)
 * and every layer-editing action in `StudioContext` (lazily, on first edit) call to
 * materialize a real stack that resolves/paints pixel-identically to the legacy fields
 * it came from. Returns `el.appearance` unchanged if it already has any real layer. */
/** معرّفا الطبقتين المشتقّتين من الحقول القديمة — ثابتان لا مولَّدان.
 *
 * `migrateAppearance` **دالّةٌ خالصة تُستدعى في كل تصيير** لأيّ عنصرٍ لم تُثبَّت
 * كومتُه بعد (عبر `currentAppearance`)، وكانت تولّد معرّفًا جديدًا في كل مرّة.
 * ومحرّر الطبقات يَفهرس صفوفه بـ`key={f.id}`، فكان الصفّ **يُفكَّك ويُركَّب من
 * جديد مع كل تصيير**: يضيع التركيز من حقوله عند أوّل ضغطة مفتاح، فتذهب بقيّة
 * الحروف إلى النافذة وتصير اختصارات أدوات، ولا يُضبط لونٌ أبدًا.
 *
 * ولم يظهر العطل على الأشكال لأنها تُنشأ بكومةٍ مخزّنة، فظهر على النصّ وحده —
 * وهذا بالضبط ما أسقط أربعة بنودٍ في حلقة المحاكاة على الهدف المنشور الحقيقي: نصٌّ
 * أبيض لا يقبل لونًا، ومسارٌ أحمر لا يقبل حدًّا.
 *
 * والقاعدة التي تمنع عودته: قيمةٌ مشتقّةٌ يجب أن تكون **حتميّة**. وما إن
 * يحرّرها المصمّم حتى تُثبَّت الكومة في المستند ويصير المعرّف مخزّنًا كغيره،
 * وكلّ طبقةٍ تُضاف بعدها تأخذ معرّفًا مولَّدًا فريدًا لا يصطدم بهذين. */
const LEGACY_FILL_ID = 'fill-legacy';
const LEGACY_STROKE_ID = 'stroke-legacy';

export function migrateAppearance(el: DocElement): AppearanceStack {
  if (hasAnyLayer(el.appearance)) return el.appearance;
  const fills: AppearanceFillLayer[] = [];
  const strokes: AppearanceStrokeLayer[] = [];
  if (el.type === 'shape') {
    if (el.fill !== 'transparent') {
      fills.push(newFillLayer({ id: LEGACY_FILL_ID, color: el.fill ?? TOKEN_FALLBACK_COLOR, colorToken: el.fill == null ? el.fillToken : null }));
    }
    if (el.shape === 'path' && !el.outline?.length) {
      // A hand-drawn pen path/boolean-op result always painted *some* stroke before
      // this roadmap item, even with no explicit color set (DOM/canvas/SVG all fell
      // back to `spec.palette.fg` at a mandatory 2px) — never omitted like rect/
      // ellipse/image, which only ever got a stroke when one was explicitly set.
      strokes.push(newStrokeLayer({ id: LEGACY_STROKE_ID, color: el.stroke ?? TOKEN_FALLBACK_COLOR, colorToken: el.stroke == null ? 'fg' : null, width: el.strokeWidth || 2, position: 'center' }));
    } else if (el.stroke) {
      strokes.push(newStrokeLayer({ id: LEGACY_STROKE_ID, color: el.stroke, width: el.strokeWidth, position: 'center' }));
    }
  } else if (el.type === 'text') {
    fills.push(newFillLayer({ id: LEGACY_FILL_ID, color: el.color ?? TOKEN_FALLBACK_COLOR, colorToken: el.color == null ? 'fg' : null }));
  } else if (el.type === 'image') {
    if (el.stroke) strokes.push(newStrokeLayer({ id: LEGACY_STROKE_ID, color: el.stroke, width: el.strokeWidth, position: 'center' }));
  }
  // video/lottie had no fill/stroke/shadow concept at all before this roadmap item —
  // an empty stack renders identically to their previous unconditional plain playback.
  return { fills, strokes, shadows: [] };
}

/** Returns the element's real appearance stack if it has one, otherwise the
 * equivalent legacy-derived stack (see `migrateAppearance`) — never mutates/stores
 * anything, just the read-side half of the lazy-migration contract. Every mutating
 * layer action in `StudioContext.tsx` calls this first so an element that has never
 * been touched by the new layer editor still gets a real stack materialized on its
 * first edit (one `commitElements` call = one undo step, same as every other edit). */
export function currentAppearance(el: DocElement): AppearanceStack {
  return hasAnyLayer(el.appearance) ? el.appearance : migrateAppearance(el);
}

/** Exported for the layer-editor UI (`PropsTab.tsx`'s `AppearanceSection`), which
 * needs to show a layer's *effective* swatch color (resolving a palette token the
 * same way `resolveAppearance` itself does) without re-deriving the resolution rule
 * a second time. */
export function resolveLayerColor(color: string, colorToken: string | null, pal: Palette): string {
  return colorToken ? resolvePaletteToken(pal, colorToken as 'bg' | 'fg' | 'ac') : color;
}

/** يقرأ ستّ عشريًّا كتبه المصمّم ويردّ صورةً واحدة `#rrggbb` صغيرة — أو `null`
 * لِما لم يكتمل بعد.
 *
 * لماذا احتاجه البرنامج أصلًا: حلقة المحاكاة على الهدف المنشور الحقيقيّ
 * (`qa/replication/targets/t02-kashida`). ألوان ذلك التصميم الأربعة —
 * `#f4f1ea` و`#12382a` و`#1f8f55` و`#d93025` — لا تعطيها أيُّ لوحةٍ في
 * `PALETTES` خلفيّةً ولا تعبئة، وشرائح لوح الخصائص خمسةُ ألوانٍ كلّها من اللوحة
 * المطبَّقة. فلم يكن في لوح الخصائص كلّه سطحٌ واحد **يُكتب** فيه لونُ علامةٍ
 * تجاريّة: `<input type="color">` وحده لا يُكتب فيه، بل يفتح حوار النظام —
 * ولونُ العلامة رقمٌ يُنسخ من دليل الهويّة لا لونٌ يُلتقط بالعين.
 *
 * يُقبل بـ`#` وبدونها، بثلاث خاناتٍ أو ستّ، بحرفٍ كبيرٍ أو صغير — لأن المصمّم
 * ينسخه بأيٍّ من هذه الصور، ورفضُ صورةٍ صحيحةٍ لأنها كُتبت بحرفٍ كبير ليس
 * تحقّقًا بل عناد. */
export function normalizeHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`.toLowerCase();
  return null;
}

/** The actual paint resolution: filters out hidden layers and resolves every color
 * (literal or palette-token) against the current palette — the exact "what to paint,
 * in order" every render path consumes. Falls back through `currentAppearance` so an
 * element with no real `.appearance` yet still resolves to its legacy fill/stroke. */
export function resolveAppearance(el: DocElement, pal: Palette): ResolvedAppearance {
  const stack = currentAppearance(el);
  return {
    fills: stack.fills
      .filter((f) => f.visible)
      .map((f) => ({
        id: f.id,
        opacity: f.opacity,
        blend: f.blend,
        kind: f.kind,
        color: resolveLayerColor(f.color, f.colorToken, pal),
        gradient: f.kind === 'gradient' ? { angle: f.gradientAngle, from: f.gradientFrom, to: f.gradientTo } : undefined,
      })),
    strokes: stack.strokes
      .filter((s) => s.visible)
      .map((s) => ({ id: s.id, opacity: s.opacity, width: s.width, position: s.position, color: resolveLayerColor(s.color, s.colorToken, pal), widthProfile: s.widthProfile ?? null })),
    shadows: stack.shadows
      .filter((s) => s.visible)
      .map((s) => ({ id: s.id, opacity: s.opacity, kind: s.kind, color: s.color, offsetX: s.offsetX, offsetY: s.offsetY, blur: s.blur, spread: s.spread })),
  };
}

export function newFillLayer(overrides: Partial<AppearanceFillLayer> = {}): AppearanceFillLayer {
  return {
    id: newElementId('fill'),
    visible: true,
    opacity: 1,
    blend: 'normal',
    kind: 'solid',
    color: '#000000',
    colorToken: null,
    gradientAngle: 90,
    gradientFrom: '#000000',
    gradientTo: '#ffffff',
    ...overrides,
  };
}

export function newStrokeLayer(overrides: Partial<AppearanceStrokeLayer> = {}): AppearanceStrokeLayer {
  return { id: newElementId('stroke'), visible: true, opacity: 1, width: 4, position: 'center', color: '#000000', colorToken: null, ...overrides };
}

export function newShadowLayer(overrides: Partial<AppearanceShadowLayer> = {}): AppearanceShadowLayer {
  return { id: newElementId('shadow'), visible: true, opacity: 0.35, kind: 'outer', color: '#000000', offsetX: 0, offsetY: 4, blur: 12, spread: 0, ...overrides };
}

export function moveLayer<T extends { id: string }>(arr: T[], id: string, dir: 'up' | 'down'): T[] {
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return arr;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ---------------------------------------------------------------------------
// Canvas painting — shared by `renderArtboardPng` and `renderArtboardFrames`
// (both call `drawElements`, which calls these) so a PNG and every MP4/GIF
// frame paint fills/strokes/shadows through the exact same code.
// ---------------------------------------------------------------------------

/** Traces the element's silhouette into `ctx`'s *current* path (does not call
 * `beginPath` — composable into a larger path, e.g. the inner-shadow "ring" trick
 * below), offset by `inset` px: positive shrinks inward (for an 'inside' stroke/a
 * shadow's `spread`), negative grows outward (for 'outside'). */
export type SilhouetteTracer = (ctx: CanvasRenderingContext2D, inset: number) => void;

export function rectTracer(bw: number, bh: number, radiusPx: number): SilhouetteTracer {
  return (ctx, inset) => {
    const w = Math.max(0, bw - 2 * inset);
    const h = Math.max(0, bh - 2 * inset);
    const r = Math.max(0, Math.min(radiusPx - inset, Math.min(w, h) / 2));
    ctx.roundRect(inset, inset, w, h, r);
  };
}

export function ellipseTracer(bw: number, bh: number): SilhouetteTracer {
  return (ctx, inset) => {
    ctx.ellipse(bw / 2, bh / 2, Math.max(0, bw / 2 - inset), Math.max(0, bh / 2 - inset), 0, 0, Math.PI * 2);
  };
}

/** A hand-drawn pen path/glyph outline/boolean result has no cheap exact per-point
 * offset (true polygon offsetting) — approximated instead by uniformly scaling the
 * whole path from its own box center, which shrinks/grows it by roughly `inset` px at
 * its average extent. Documented, bounded limitation (docs/CONTROLS.md): 'inside'/
 * 'outside' stroke position and shadow `spread` on this kind of shape are approximate,
 * not a true offset curve — 'center' position (the pre-existing default) is exact. */
export function pathInsetScale(bw: number, bh: number, inset: number): number {
  if (!inset) return 1;
  const avgHalfExtent = (bw + bh) / 4;
  if (avgHalfExtent <= 0) return 1;
  return Math.max(0, 1 - inset / avgHalfExtent);
}

function tracePathCmdsNoReset(ctx: CanvasRenderingContext2D, cmds: PathCmd[], sx: number, sy: number) {
  for (const cmd of cmds) {
    switch (cmd.c) {
      case 'M':
        ctx.moveTo(cmd.x * sx, cmd.y * sy);
        break;
      case 'L':
        ctx.lineTo(cmd.x * sx, cmd.y * sy);
        break;
      case 'C':
        ctx.bezierCurveTo(cmd.x1 * sx, cmd.y1 * sy, cmd.x2 * sx, cmd.y2 * sy, cmd.x * sx, cmd.y * sy);
        break;
      case 'Z':
        ctx.closePath();
        break;
    }
  }
}

export function pathCmdsTracer(cmds: PathCmd[], bw: number, bh: number): SilhouetteTracer {
  return (ctx, inset) => {
    const scale = pathInsetScale(bw, bh, inset);
    if (scale === 1) {
      tracePathCmdsNoReset(ctx, cmds, bw, bh);
      return;
    }
    const cx = bw / 2;
    const cy = bh / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    tracePathCmdsNoReset(ctx, cmds, bw, bh);
    ctx.restore();
  };
}

function buildLinearGradient(ctx: CanvasRenderingContext2D, grad: { angle: number; from: string; to: string }, bw: number, bh: number): CanvasGradient {
  const rad = (grad.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const cx = bw / 2;
  const cy = bh / 2;
  const len = (Math.abs(dx) * bw + Math.abs(dy) * bh) / 2 || 1;
  const g = ctx.createLinearGradient(cx - dx * len, cy - dy * len, cx + dx * len, cy + dy * len);
  g.addColorStop(0, grad.from);
  g.addColorStop(1, grad.to);
  return g;
}

/** One fill layer's paintable canvas value — a plain color string for `kind:'solid'`,
 * a real `CanvasGradient` for `kind:'gradient'`. Used both by the generic silhouette
 * painter below and directly by text rendering (`drawElements`'s text branch), which
 * has no silhouette to trace and instead hands this straight to `ctx.fillStyle`/
 * `ctx.strokeStyle` before its own `fillText`/`strokeText` calls — the one place canvas
 * text painting shares code with shape/image appearance painting. */
export function resolveFillStyleCanvas(ctx: CanvasRenderingContext2D, f: ResolvedFillPaint, bw: number, bh: number): string | CanvasGradient {
  return f.kind === 'gradient' && f.gradient ? buildLinearGradient(ctx, f.gradient, bw, bh) : f.color;
}

/** `AppearanceBlend` is a CSS blend-mode name; every value except `'normal'` is also a
 * valid canvas `GlobalCompositeOperation` of the same name — only `'normal'` has a
 * different canvas spelling (`'source-over'`, the canvas default). */
function blendToCanvasComposite(blend: AppearanceBlend): GlobalCompositeOperation {
  return blend === 'normal' ? 'source-over' : blend;
}

export function paintFillsCanvas(ctx: CanvasRenderingContext2D, fills: ResolvedFillPaint[], tracer: SilhouetteTracer, bw: number, bh: number, fillRule: CanvasFillRule = 'nonzero') {
  const baseAlpha = ctx.globalAlpha;
  for (const f of fills) {
    ctx.save();
    ctx.globalAlpha = baseAlpha * f.opacity;
    ctx.globalCompositeOperation = blendToCanvasComposite(f.blend);
    ctx.beginPath();
    tracer(ctx, 0);
    ctx.fillStyle = resolveFillStyleCanvas(ctx, f, bw, bh);
    ctx.fill(fillRule);
    ctx.restore();
  }
}

export function paintStrokesCanvas(ctx: CanvasRenderingContext2D, strokes: ResolvedStrokePaint[], tracer: SilhouetteTracer) {
  const baseAlpha = ctx.globalAlpha;
  for (const s of strokes) {
    const inset = s.position === 'inside' ? s.width / 2 : s.position === 'outside' ? -s.width / 2 : 0;
    ctx.save();
    ctx.globalAlpha = baseAlpha * s.opacity;
    ctx.beginPath();
    tracer(ctx, inset);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.stroke();
    ctx.restore();
  }
}

export function paintOuterShadowsCanvas(ctx: CanvasRenderingContext2D, shadows: ResolvedShadowPaint[], tracer: SilhouetteTracer) {
  const baseAlpha = ctx.globalAlpha;
  for (const sh of shadows) {
    if (sh.kind !== 'outer') continue;
    ctx.save();
    ctx.globalAlpha = baseAlpha * sh.opacity;
    ctx.shadowColor = sh.color;
    ctx.shadowBlur = sh.blur;
    ctx.shadowOffsetX = sh.offsetX;
    ctx.shadowOffsetY = sh.offsetY;
    ctx.beginPath();
    tracer(ctx, -sh.spread);
    // The caster fill itself is covered by the real fill/stroke layers drawn right
    // after this (same local frame) — only the blurred halo bleeding past the
    // silhouette's edge stays visible, which is the whole point of drawing it first.
    ctx.fillStyle = sh.color;
    ctx.fill();
    ctx.restore();
  }
}

/** The standard canvas inner-shadow technique: clip to the silhouette, then fill a
 * "ring" path (a big rect minus the silhouette inset by `spread`, `evenodd`) with the
 * shadow's blur/offset — only the blurred inner edge survives the clip. Must be called
 * *after* fills/strokes for the same element (same local frame) so the inner shadow
 * paints on top, like every real design tool's layer stack. */
export function paintInnerShadowsCanvas(ctx: CanvasRenderingContext2D, shadows: ResolvedShadowPaint[], tracer: SilhouetteTracer, bw: number, bh: number) {
  const baseAlpha = ctx.globalAlpha;
  for (const sh of shadows) {
    if (sh.kind !== 'inner') continue;
    ctx.save();
    ctx.beginPath();
    tracer(ctx, 0);
    ctx.clip();
    ctx.globalAlpha = baseAlpha * sh.opacity;
    ctx.shadowColor = sh.color;
    ctx.shadowBlur = sh.blur;
    ctx.shadowOffsetX = sh.offsetX;
    ctx.shadowOffsetY = sh.offsetY;
    const margin = sh.blur * 2 + Math.abs(sh.offsetX) + Math.abs(sh.offsetY) + Math.abs(sh.spread) + 8;
    ctx.beginPath();
    ctx.rect(-margin, -margin, bw + margin * 2, bh + margin * 2);
    tracer(ctx, sh.spread);
    ctx.fillStyle = sh.color;
    ctx.fill('evenodd');
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// DOM preview (ElementView.tsx) — CSS props driven by the same resolved data.
// A single solid, fully-opaque, normal-blend fill (the shape of every element
// migrated from a legacy single color) renders via plain `background-color`
// (byte-identical computed style to before this roadmap item, which existing QA
// specs like palette-apply.spec.mjs read directly) instead of the multi-layer
// `background-image`/`background-blend-mode` path, which only engages once a
// document actually has more than one layer, a gradient, a non-1 opacity, or a
// non-normal blend.
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Bakes a layer's own opacity into its CSS color string (hex only — anything else is
 * returned as-is, best-effort) since CSS background-image layers have no separate
 * per-layer alpha channel of their own. */
export function withAlpha(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, opacity))})`;
}

export interface FillCss {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundBlendMode?: string;
}

export function fillsToCss(fills: ResolvedFillPaint[]): FillCss {
  if (fills.length === 0) return { backgroundColor: 'transparent' };
  if (fills.length === 1 && fills[0].kind === 'solid' && fills[0].opacity >= 1 && fills[0].blend === 'normal') {
    return { backgroundColor: fills[0].color };
  }
  const images = fills.map((f) =>
    f.kind === 'gradient' && f.gradient
      ? `linear-gradient(${f.gradient.angle}deg, ${withAlpha(f.gradient.from, f.opacity)}, ${withAlpha(f.gradient.to, f.opacity)})`
      : `linear-gradient(${withAlpha(f.color, f.opacity)}, ${withAlpha(f.color, f.opacity)})`,
  );
  return { backgroundImage: images.join(', '), backgroundBlendMode: fills.map((f) => f.blend).join(', ') };
}

/** Combines stroke layers (as solid 0-blur "rings", positioned via spread + the
 * `inset` keyword) and shadow layers into one CSS `box-shadow` list — shadows listed
 * first so they paint on top of strokes (same "inner shadow/strokes drawn last" order
 * the canvas path uses), each inner-shadow still using the real `inset` keyword and
 * each outer shadow/stroke relying on the CSS spec's own "box-shadow paints behind the
 * box's background" rule for correct stacking against the element's fill. */
/** Returns the literal `border` CSS a stroke stack is equivalent to when it's exactly
 * the single-center-opaque-stroke shape every pre-roadmap-#17 shape/image stroke was
 * (including the single-layer stack `migrateAppearance` builds for one) — byte-identical
 * computed `border`/`borderColor`/`borderWidth` to before this roadmap item, which
 * `image-editing.spec.mjs` reads directly via `el.style.border`. Returns `undefined` for
 * anything the plain CSS `border` property can't represent (more than one stroke layer,
 * a non-'center' position, or a non-1 opacity) — the caller falls back to
 * `appearanceBoxShadowCss` for those. */
export function legacyBorderCss(strokes: ResolvedStrokePaint[]): string | undefined {
  if (strokes.length === 0) return 'none';
  const s = strokes[0];
  if (strokes.length === 1 && s.position === 'center' && s.opacity >= 1) {
    return `${s.width}px solid ${s.color}`;
  }
  return undefined;
}

export function appearanceBoxShadowCss(strokes: ResolvedStrokePaint[], shadows: ResolvedShadowPaint[]): string | undefined {
  const parts: string[] = [];
  for (const sh of shadows) {
    parts.push(`${sh.kind === 'inner' ? 'inset ' : ''}${sh.offsetX}px ${sh.offsetY}px ${sh.blur}px ${sh.spread}px ${withAlpha(sh.color, sh.opacity)}`);
  }
  for (const s of strokes) {
    const col = withAlpha(s.color, s.opacity);
    if (s.position === 'outside') parts.push(`0 0 0 ${s.width}px ${col}`);
    else if (s.position === 'inside') parts.push(`inset 0 0 0 ${s.width}px ${col}`);
    else {
      parts.push(`0 0 0 ${s.width / 2}px ${col}`);
      parts.push(`inset 0 0 0 ${s.width / 2}px ${col}`);
    }
  }
  return parts.length ? parts.join(', ') : undefined;
}
