import type { Palette } from '../data/constants';
import type { HAlign, VAlign, Weight } from './types';
import type { Bezier, EasingId } from '../lib/easing';
import { DEFAULT_BEZIER } from '../lib/easing';
import type { PathCmd } from '../lib/pathGeometry';
import type { StrokeWidthProfile } from '../lib/variableStroke';

export type ElementId = string;
export type ElementKind = 'text' | 'shape' | 'image' | 'lottie';
export type ShapeKind = 'rect' | 'ellipse' | 'path';
export type PaletteToken = 'bg' | 'fg' | 'ac';

/** x/y/w/h are fractions (0..1) of the current artboard size, so elements keep
 * their relative position/size if the artboard preset (and therefore its pixel
 * dimensions) changes — the same behavior the old percentage-based layout had. */
export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export type AnimPreset = 'none' | 'fade' | 'slide' | 'pop';

/** A keyframe on an element's entrance clip: `t` is a fraction (0..1) of the clip's
 * own duration (not an absolute timeline time, so moving/resizing the clip carries
 * its keyframes along for free), and `v` is the animated "progress" value at that
 * point, which the old `presetStyle` mapped onto opacity/transform. Superseded by
 * `tracks` (below) for actual rendering — kept only as the storage format `preset`
 * read/writes through for the simple-mode chooser; see `tracksFromPreset`. */
export interface AnimKeyframe {
  id: string;
  t: number;
  v: number;
}

export type AnimProperty = 'opacity' | 'x' | 'y' | 'scale' | 'rotation';

export const ANIM_PROPERTIES: AnimProperty[] = ['opacity', 'x', 'y', 'scale', 'rotation'];

/** Value each property renders as when it has no track at all (untouched by any
 * animation): full opacity, no positional offset, no extra scale, no extra
 * rotation — i.e. exactly what a static (non-animated) element already looks like. */
export const ANIM_PROPERTY_DEFAULT: Record<AnimProperty, number> = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0 };

/** One keyframe on one property's independent track.
 *
 * **`time` is an absolute duration in seconds**, measured in *animation time* — i.e.
 * from `ElementAnim.sourceIn`, not as a fraction of the clip's length. Idea from
 * محرّر خطٍّ زمنيٍّ مفتوح, `crates/edit/src/lib.rs:16`: *"Keyframes are stored in media time, so
 * trims and splits never need to move them."* (MIT OR Apache-2.0.)
 *
 * ولماذا تغيّر: كان الحقل كسرًا (٠..١) من مدّة المقطع، فكان كلُّ تغييرٍ في المدّة
 * يُعيد توقيت ما وُقِّت أصلًا — ومن ذلك الاختيار الواحد وُلدت ثلاثُ عِللٍ مسجَّلة:
 * حذفُ الدخول الصامت (العطل ٤ في `qa/motion-journey.spec.mjs`)، وتشبُّعُ الزمن
 * المحلّي عند ١ فكلُّ لحظةٍ بعد المقطع تُجيب «١»، و`stretchClipToTime` كلّها — اثنان
 * وعشرون سطرًا لا تفعل إلّا إعادةَ قياس كلّ كسرٍ كي لا يتزحزح ما هو في مكانه أصلًا.
 *
 * **والحقل مُسمّى `time` لا `t` عن قصد: الاسمُ هو المُميِّز.** الكسر `0.3` والثانية
 * `0.3` رقمان لا يفترقان، ولم يكن في المستندات المحفوظة رقمُ نسخةٍ يُفرِّق — فلو
 * بقي الاسم لصار كلُّ دخولٍ محفوظٍ عند ٠٫٣ من المقطع دخولًا عند ٠٫٣ ثانية، بلا أيّ
 * خطأٍ يظهر. فصار **وجودُ الحقل** هو المُميِّز: مفتاحٌ فيه `t` ولا `time` قديم،
 * ومفتاحٌ فيه `time` جديد، ولا حالةَ لبسٍ أبدًا — ولا حتى في مستندٍ حفظه بناءٌ في
 * منتصف الإصدار. انظر `migrateKeyframe` في `StudioContext.tsx`.
 *
 * `easing`/`bezier` describe the curve of the segment that *starts* at this keyframe
 * and runs to the next one on the same track (the last keyframe's easing is unused,
 * same as the old single-track model's last-segment convention) — this is what makes
 * easing per segment rather than one curve for the whole clip. */
export interface PropertyKeyframe {
  id: string;
  time: number;
  value: number;
  easing: EasingId;
  bezier: Bezier;
}

/** A keyframe as saved **before** keyframe time became absolute: `t` is a fraction of
 * the clip's duration. Nothing but the migration may read this. */
export interface LegacyFractionKeyframe {
  id: string;
  t: number;
  value: number;
  easing: EasingId;
  bezier: Bezier;
}

export type PropertyTracks = Partial<Record<AnimProperty, PropertyKeyframe[]>>;

/** A real per-element animation clip: when it plays (`start`/`duration`, seconds on
 * the shared timeline) and, independently for each animatable property, its own
 * keyframe track (`tracks`). `preset`/`keyframes`/`easing`/`bezier` are the legacy
 * single-progress-curve fields, kept only as the backing store for the simple-mode
 * preset chooser (PropsTab's head-only section) — real rendering and the pro-mode
 * timeline read and write `tracks` exclusively; see `tracksFromPreset` for how a
 * preset is mapped onto the equivalent tracks so old documents render unchanged. */
export interface ElementAnim {
  preset: AnimPreset;
  start: number;
  duration: number;
  /** أصلُ زمنِ الحركة بالثواني: اللحظةُ التي يقابلها `start` على الخطّ الزمنيّ.
   *
   * حقلان لا حقلٌ واحد، وهذا هو بيتُ القصيد. الفائدةُ ليست في كون الزمن مطلقًا
   * وحده، بل في أنّ `start` و`sourceIn` **يتحرّكان معًا عند تقليم الحافّة الأولى
   * ومنفردين عند النقل** — وهو ما يجعل الفعلين كلاهما بلا أثرٍ على المفاتيح
   * (محرّر خطٍّ زمنيٍّ مفتوح، `crates/project/src/lib.rs:651-659`):
   *
   * | الفعل | `start` | `sourceIn` | أثره على المفاتيح |
   * |---|---|---|---|
   * | نقل المقطع | يتغيّر | لا يتغيّر | تتحرّك **مع** المقطع ✓ |
   * | تقليم الحافّة الأولى | `+= d` | `+= d` | **لا تتغيّر** — يُقَصّ الرأس ولا يُعاد توقيت شيء ✓ |
   * | تقليم الحافّة الأخيرة | لا يتغيّر | لا يتغيّر | **لا تتغيّر** ✓ |
   *
   * وحقلٌ واحد لا يقدر على ذلك: مفاتيحٌ نسبةً إلى `start` وحده يُزحزحها تقليمُ
   * الرأس، ومفاتيحٌ بزمنِ المستند المطلق يُعيد النقلُ كتابتها كلَّها.
   *
   * ولمستندٍ لم يُقلَّم قطُّ `sourceIn` صفرٌ، فتختصر `animTimeAt` إلى
   * `t − start` — فلا يكلّف هذا الحقل شيئًا قبل أن توجد المرحلة ٢، ويعني أنّ
   * المرحلة ٢ لا تحتاج أيّ عملٍ تمثيليٍّ بعده.
   *
   * **ولا حقل `speed`.** لا سرعةَ مقطعٍ في مزيج للرسوميّات، و`trimIn`/`trimOut`
   * في `VideoElement` كمّيةٌ أخرى تمامًا — نافذةٌ داخل المصدر لا على الخطّ.
   *
   * واختياريٌّ في النوع وغيابُه **صفر** — وهو عقدُ «كلُّ حقلٍ جديد اختياريٌّ
   * يُكمَّل بقيمةٍ محايدة» المكتوب في `src/lib/persist.ts`، ونفسُه الذي يحمله
   * `groupId` و`appearance` و`name`. وقيمةُ الصفر هي المحايدة فعلًا: بها تختصر
   * `animTimeAt` إلى `t − start`. و`migrateAnim` تُجسّده صريحًا عند كلّ تحميل كما
   * تفعل `migrateAppearance`، فالمستندُ المحفوظ يحمله دائمًا؛ وبقاؤه اختياريًّا
   * في النوع هو ما يَمنع مُحلِّلًا أن يُعيد `NaN` لعنصرٍ بُني بلا الحقل. */
  sourceIn?: number;
  easing: EasingId;
  bezier: Bezier;
  keyframes: AnimKeyframe[];
  tracks: PropertyTracks;
}

/** Maps an entrance preset onto the independent per-property tracks that render
 * identically to the old fixed preset formulas that `animTimeline.ts` used before
 * per-property tracks existed. Every legacy keyframe's `v` becomes one keyframe on
 * the relevant track(s), carrying the clip's one-time global `easing`/`bezier`
 * forward onto every segment — so a document saved before per-property tracks
 * existed loads and plays back pixel-identical.
 *
 * `duration` is now a parameter because `AnimKeyframe.t` is still a fraction (it is
 * the legacy simple-mode storage and stays one) while `PropertyKeyframe.time` is
 * seconds — so the conversion `time = t × duration` happens exactly here, at the one
 * boundary between the two conventions. */
export function tracksFromPreset(preset: AnimPreset, keyframes: AnimKeyframe[], easing: EasingId, bezier: Bezier, duration: number): PropertyTracks {
  const at = (k: AnimKeyframe) => k.t * duration;
  switch (preset) {
    case 'fade':
      return { opacity: keyframes.map((k) => ({ id: k.id, time: at(k), value: clamp01(k.v), easing, bezier: [...bezier] })) };
    case 'slide':
      return {
        opacity: keyframes.map((k) => ({ id: k.id, time: at(k), value: clamp01(k.v), easing, bezier: [...bezier] })),
        y: keyframes.map((k) => ({ id: k.id, time: at(k), value: (1 - k.v) * 0.1, easing, bezier: [...bezier] })),
      };
    case 'pop':
      return {
        opacity: keyframes.map((k) => ({ id: k.id, time: at(k), value: clamp01(k.v), easing, bezier: [...bezier] })),
        scale: keyframes.map((k) => ({ id: k.id, time: at(k), value: Math.max(0, k.v), easing, bezier: [...bezier] })),
      };
    case 'none':
    default:
      return {};
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Applies one easing/bezier to every segment of every property track at once — what
 * the whole-clip easing menu/bezier editor do when no single keyframe is selected
 * (see Timeline.tsx/EasingMenu.tsx/BezierEditor.tsx): a bulk "set the curve for this
 * whole clip" action, distinct from `setTrackKeyframeEasing`/`setTrackKeyframeBezier`
 * in StudioContext, which target one specific keyframe's own segment instead. */
export function cascadeEasingToTracks(tracks: PropertyTracks, easing: EasingId, bezier: Bezier): PropertyTracks {
  const next: PropertyTracks = {};
  for (const prop of ANIM_PROPERTIES) {
    const track = tracks[prop];
    if (track) next[prop] = track.map((k) => ({ ...k, easing, bezier: [...bezier] }));
  }
  return next;
}

export function defaultAnim(preset: AnimPreset, start: number, duration: number, easing: EasingId = 'easeOut'): ElementAnim {
  const keyframes: AnimKeyframe[] = [
    { id: newElementId('kf'), t: 0, v: 0 },
    { id: newElementId('kf'), t: 1, v: 1 },
  ];
  const bezier = [...DEFAULT_BEZIER] as Bezier;
  return {
    preset,
    start,
    duration,
    // عنصرٌ جديد لم يُقلَّم: أصلُ زمنِ حركته هو بدايتها. انظر `ElementAnim.sourceIn`.
    sourceIn: 0,
    easing,
    bezier,
    keyframes,
    tracks: tracksFromPreset(preset, keyframes, easing, bezier, duration),
  };
}

export type StaggerUnit = 'char' | 'word' | 'line';
export type StaggerDirection = 'start' | 'end' | 'center' | 'random';
export type StaggerEffect = 'fade' | 'slide' | 'scale' | 'rotate';

/** Per-text-element stagger layer (roadmap #6): splits the element's own text content
 * into units (grapheme/word/authored-line) and reveals each with a sequential delay,
 * *on top of* whatever `anim.tracks` (the independent per-property keyframe tracks,
 * roadmap #2) already does to the whole text box as one rigid unit — the two layers
 * compose rather than compete: `anim.tracks` moves/fades/scales the box, `textAnim`
 * additionally reveals its contents progressively, anchored to the same `anim.start`
 * clock. See `src/lib/textStagger.ts` for the segmentation/timing math — the single
 * source of truth shared by the DOM preview and the canvas/video exporter, exactly
 * like `resolveAnimAt` is for `anim.tracks`. */
export interface TextStaggerAnim {
  enabled: boolean;
  unit: StaggerUnit;
  direction: StaggerDirection;
  /** Seconds between each unit's own reveal start, in stagger-rank order. */
  stagger: number;
  /** Seconds each unit's own reveal animation takes, independent of `stagger`. */
  unitDuration: number;
  effect: StaggerEffect;
  easing: EasingId;
  bezier: Bezier;
}

export function defaultTextStagger(): TextStaggerAnim {
  return { enabled: false, unit: 'char', direction: 'start', stagger: 0.04, unitDuration: 0.35, effect: 'fade', easing: 'easeOut', bezier: [...DEFAULT_BEZIER] as Bezier };
}

export type AppearanceBlend = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
export type StrokePosition = 'inside' | 'center' | 'outside';
export type AppearanceCategory = 'fills' | 'strokes' | 'shadows';

/** One fill layer in an element's appearance stack (roadmap #17). `kind:'solid'` paints
 * `colorToken ? resolvePaletteToken(pal,colorToken) : color`; `kind:'gradient'` paints a
 * 2-stop linear gradient at `gradientAngle` degrees between `gradientFrom`/`gradientTo`
 * (never palette-tracking — gradients are always explicit colors). `blend` is a CSS
 * `mix-blend-mode`/`background-blend-mode` name that is *also* a valid canvas
 * `globalCompositeOperation` value, so the same name works unchanged across every
 * render path. See `src/lib/appearance.ts` for how a stack resolves/paints. */
export interface AppearanceFillLayer {
  id: string;
  visible: boolean;
  opacity: number;
  blend: AppearanceBlend;
  kind: 'solid' | 'gradient';
  color: string;
  colorToken: PaletteToken | null;
  gradientAngle: number;
  gradientFrom: string;
  gradientTo: string;
}

/** One stroke (border) layer. `position` decides where the painted band sits relative
 * to the element's own silhouette edge: 'inside' shrinks the drawn path inward by
 * `width/2` before stroking at `width` (so the outer edge of the paint sits flush with
 * the silhouette), 'outside' does the opposite, 'center' strokes the silhouette as-is
 * (the default, matching every stroke this app painted before this roadmap item). Exact
 * inside/outside geometry is only computed for rect/ellipse silhouettes (including every
 * non-path element's bounding box) — a hand-drawn pen path or glyph outline approximates
 * inside/outside via a uniform center-scale instead of true per-point offsetting (see
 * `pathInsetScale` in `src/lib/appearance.ts`), a documented, bounded limitation. */
export interface AppearanceStrokeLayer {
  id: string;
  visible: boolean;
  opacity: number;
  width: number;
  position: StrokePosition;
  color: string;
  colorToken: PaletteToken | null;
  /** مَلمحُ سُمكٍ متغيّر: معاملاتٌ تُضرَب في `width` على امتداد طول قوس المسار،
   * فيدخل الخطّ بعشرين بكسلًا ويخرج شعرة. غيابُه (أو `null`) = حدٌّ منتظم
   * بالضبط كما كان قبل هذا البند — نفس عقد «ترحيل بلا فقد» الذي يحمله
   * `appearance` نفسه، ونفس اختيار محرّك متّجهات مفتوح حيث `profile: None` **ليس**
   * مَلمحًا منتظمًا بل مسارَ الحدِّ العادي (`docs/re-vectorcraft-source.md` §1.1).
   *
   * و`width` رقمٌ واحد لكلّ مسار في SVG وفي Canvas2D معًا، فلا سبيل إلى رسم
   * هذا حدًّا أصلًا: متى وُجد المَلمح صار الحدُّ **مضلَّعًا معبَّأً** تبنيه
   * `variableStrokeOutlineCmds` في `src/lib/variableStroke.ts`، وتناديه
   * الرسّامات الثلاث كلُّها فلا تختلف المعاينة عن التصدير.
   *
   * ولا يُقرأ إلا على `shape: 'path'`: مستطيلٌ أو بيضةٌ أو صورةٌ ليس لها خطٌّ
   * مركزيٌّ يُزاح، بل محيطٌ مغلق — وطلبُ تدرّجٍ على محيطٍ سؤالٌ آخر لم يُطلب. */
  widthProfile?: StrokeWidthProfile | null;
}

/** One shadow layer. `kind:'outer'` casts a blurred/offset/spread silhouette behind the
 * element (covered again by the fill/stroke layers painted after it, so only the part
 * bleeding past the edge shows); `kind:'inner'` paints the same shape clipped *inside*
 * the silhouette, on top of fills/strokes — the standard "big rect minus inset
 * silhouette, evenodd fill" canvas technique. Only rect/ellipse-silhouette element kinds
 * (every kind except a hand-drawn pen/outline/boolean-result shape) support `inner`;
 * text supports `outer` only (no per-glyph silhouette is computed for shadow purposes —
 * a documented limitation, see docs/CONTROLS.md). */
export interface AppearanceShadowLayer {
  id: string;
  visible: boolean;
  opacity: number;
  kind: 'outer' | 'inner';
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

/** Roadmap #17 — an element's full appearance stack: ordered (bottom-to-top) layers per
 * category. Optional on every element (`ElementBase.appearance`) so every existing
 * object literal across the codebase that builds a `DocElement` without this field still
 * compiles and renders exactly as before — `src/lib/appearance.ts`'s `resolveAppearance`
 * synthesizes an equivalent one-layer-per-category stack on the fly from the legacy
 * single-value fields (`fill`/`stroke`/`strokeWidth`/`color`) whenever this is absent,
 * which is also what `migrateAppearance` eagerly materializes into loaded documents at
 * `normalizeDoc` time (see `StudioContext.tsx`) — the "ترحيل بلا فقد" contract. */
export interface AppearanceStack {
  fills: AppearanceFillLayer[];
  strokes: AppearanceStrokeLayer[];
  shadows: AppearanceShadowLayer[];
}

interface ElementBase {
  id: ElementId;
  visible: boolean;
  locked: boolean;
  /** معرّف المجموعة التي ينتمي إليها هذا العنصر، أو `null`/غياب = حرّ.
   *
   * المستند قائمةٌ مسطّحة لا شجرة، وهذا **اختيار مقصود لا اختصار**: الشجرة الحقيقية
   * كانت ستمسّ الرسّامات الثلاث (`ElementView`، `drawElements`، `renderArtboardSvg`)
   * والتصدير و«التحجيم الذكي» والقوالب كلّها دفعةً واحدة. المجموعة هنا **علاقةُ
   * انتماء** بين عناصر تبقى كما هي في القائمة: التحديد يتوسّع إلى بقية الأعضاء
   * (`expandGroups` في `StudioContext`)، فيتحرّك اللوكاب ويُقفل ويُخفى كوحدة واحدة —
   * وهو بالضبط ما يطلبه المصمّم من `⌘G`. انظر `groupSelected` هناك: التجميع يجعل
   * الأعضاء **متجاورة في ترتيب الطبقات** أيضًا، كما يفعل أداة المتّجهات، وإلا لصار
   * «الوحدة الواحدة» كذبةً بصريةً أول مرة يتخلّل المجموعةَ عنصرٌ غريب.
   *
   * اختياريّ، فكل مستندٍ محفوظ قبل هذا البند يفتح بلا مجموعاتٍ وبلا أي ترحيل —
   * نفس عقد «ترحيل بلا فقد» الذي يحمله `appearance`. */
  groupId?: string | null;
  /** الاسم الذي كتبه المصمّم لهذه الطبقة. غيابه يعني «اشتقّ اسمًا مقروءًا من
   * المحتوى» — انظر `elementDisplayName` في `src/lib/layerNames.ts`. البند ٨ في
   * `docs/UX-AUDIT-2026-10-18.md`: القائمة كانت تعرض «شكل · mvdiutl2» لأن الاسم
   * كان يُشتقّ من المعرّف الخام لا من المحتوى. */
  name?: string;
  opacity: number;
  geo: Geometry;
  anim: ElementAnim;
  /** Id of a shape element used as a clipping mask on this element, if any — the mask
   * shape itself is hidden from independent painting (visible:false) while acting as a
   * mask. Any element kind can be clipped (image/shape/text); only a shape can be the
   * mask itself. See docs/CONTROLS.md "قص بالشكل". */
  maskId: ElementId | null;
  /** Roadmap #17 — ordered multi-layer fill/stroke/shadow stack. Optional/undefined on
   * every element built before this roadmap item (and on any literal across the
   * codebase that doesn't set it) — see `AppearanceStack`'s own doc comment above. */
  appearance?: AppearanceStack;
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  fontFamily: string;
  /** Reference px against a 1080-wide artboard, matching the on-canvas cqw sizing used before. */
  fontSize: number;
  /** تتبُّع الأحرف (letter-spacing) كنسبةٍ مئويّة من مقاس الخطّ — `-1` تعني
   * `-0.01em`، و`0`/`undefined` تعني بلا تتبُّع.
   *
   * نسبةٌ من مقاس الخطّ لا بكسلات: التتبُّع قرارٌ طباعيّ يتناسب مع الحجم (عنوان
   * ١١٨ بكسل وسطرٌ ٣٢ بكسل لا يتشاركان رقمًا بالبكسل يعني الشيء نفسه)، وهو كذلك
   * يبقى صحيحًا حين يُصدَّر المستند بمضاعِفٍ أو يُغيَّر مقاس اللوحة، لأن
   * `fontPx` نفسها مشتقّة من عرض اللوحة.
   *
   * اختياريّ كـ`appearance`/`justify`: كل مستندٍ حُفظ قبل هذا الحقل يُفتَح
   * بالصورة التي حُفظ بها بالضبط، لأن `undefined` و`0` يُعامَلان معاملةً واحدة.
   *
   * ولماذا وُجد أصلًا: حلقة المحاكاة. عنوان الهدف الأول لا يتّسع في صندوقه إلا
   * بتتبُّعٍ `-0.01em` — عرضه الطبيعي ٧٦١٫٠٧ بكسل وصندوقه ٧٦٠ — فكان العنوان
   * ينكسر سطرين في مزيج بينما هو سطرٌ واحد في الهدف، ولا شيء في الواجهة كلّها
   * يملك إصلاح فرق البكسل الواحد هذا. */
  tracking?: number;
  weight: Weight;
  color: string | null;
  halign: HAlign;
  valign: VAlign;
  /** The char/word/line reveal-stagger layer — see `TextStaggerAnim` above. */
  textAnim: TextStaggerAnim;
  /** Roadmap #12 — id of a `shape:'path'` element this text bends along, if any (same
   * "reference another element's id" convention as `maskId`). The referenced shape
   * keeps painting its own stroke/fill normally — unlike a mask shape, it isn't
   * hidden, since a visible guide curve is usually exactly what's wanted. Null (the
   * default, and what every pre-existing document migrates to) renders exactly as
   * before. See `src/lib/textOnPath.ts` for the shared per-glyph curve-placement
   * pipeline (real HarfBuzz shaping, same as "تحويل النص إلى مخطط متجهي" — never
   * per-character isolated forms) all three renderers call through. */
  pathId: ElementId | null;
  /** Roadmap #18 — Arabic kashida (tatweel) justification: when true, every wrapped
   * line except the last (SVG export's single-line text counts as its own "whole
   * line") is stretched to the box width by inserting real tatweel characters at
   * real joining-rule positions (`src/lib/kashidaJustify.ts`) instead of opening
   * gaps between words. Optional, like `appearance` above — undefined on every
   * document from before this roadmap item (and any literal that doesn't set it)
   * and treated identically to `false`, so an old document opens pixel-identical to
   * before. Only has an effect for `dir === 'rtl'` text. */
  justify?: boolean;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: ShapeKind;
  fill: string | null;
  fillToken: PaletteToken;
  stroke: string | null;
  strokeWidth: number;
  /** Corner radius as a fraction of min(w,h) for 'rect'. */
  radius: number;
  /** For shape === 'path': anchor points, as fractions of the element's own box.
   * Rendered as straight segments unless `smoothAmount` is set — see
   * `src/lib/pathGeometry.ts`/`pathSmoothing.ts` (roadmap #11). */
  points?: Array<{ x: number; y: number }>;
  closed?: boolean;
  /** Roadmap #11 — 0 (default, legacy straight segments) .. 1 (full Catmull-Rom
   * curvature) bezier smoothing applied across every non-corner anchor in `points`.
   * Undefined/0 renders bit-identical to a plain straight-segment path, so no existing
   * document changes shape on load. */
  smoothAmount?: number;
  /** Per-anchor override, parallel to `points` by index: `true` pins that anchor as a
   * hard corner (zero-length bezier handles on both sides) regardless of
   * `smoothAmount`. Missing/undefined index = smooth. */
  cornerPoints?: boolean[];
  /** Roadmap #11 (follow-up) — explicit bezier handles the designer pulled out themselves (pen
   * drag-out while placing an anchor, or a handle drag in node-edit mode), parallel to
   * `points` by index. `in`/`out` are **offset vectors from their own anchor**, in the
   * same element-box fractions as `points` — storing offsets (not absolute positions)
   * is what lets a plain anchor drag move its handles along for free, and lets a box
   * resize scale them with the shape.
   *
   * An explicit side overrides the Catmull-Rom tangent `smoothAmount` would derive for
   * that side, and renders as a real curve even at `smoothAmount === 0`. Undefined (or
   * an all-null array) is byte-for-byte the pre-#17 behaviour, so every older document
   * still opens identical. See `src/lib/pathSmoothing.ts`. */
  handles?: Array<{ in?: { x: number; y: number } | null; out?: { x: number; y: number } | null } | null>;
  /** Roadmap #10 — multi-region result of a boolean op (union/subtract/intersect/
   * exclude), one entry per disjoint region or hole. Always straight-edged (the
   * inputs were flattened before clipping — see `src/lib/pathBoolean.ts`) and always
   * closed. Takes priority over `points`/`smoothAmount` when present. */
  subpaths?: Array<{ points: Array<{ x: number; y: number }>; closed: true }>;
  /** Roadmap #12 — real glyph outlines from "convert text to outlines" (see
   * `src/lib/arabicShaping.ts` and `TextOutlineSection` in `PropsTab.tsx`): literal
   * M/L/C/Z commands (fractions of this element's own box) straight from the
   * HarfBuzz shaping pipeline, one glyph contour per M..Z subpath, concatenated —
   * never re-derived from `points`. Takes priority over every field above; not
   * further point-editable (see docs/CONTROLS.md), and not boolean-op eligible
   * (`isBooleanEligible` requires `points`). */
  outline?: PathCmd[];
  /** Optional caption baked onto the shape (used for the badge % and the logo wordmark) —
   * not an independently selectable sub-element in this pass; see docs/CONTROLS.md. */
  label?: string | null;
  labelColor?: string | null;
  labelColorToken?: PaletteToken;
  labelPosition?: 'center' | 'inline-end';
}

export interface ImageElement extends ElementBase {
  type: 'image';
  src: string | null;
  fit: 'cover' | 'contain' | 'fill';
  /** Pan/zoom of the image *content* within its frame (the frame itself is `geo`).
   * cropX/cropY are the fraction of the content that sits at the frame's center
   * (0.5/0.5 = centered); cropScale is extra zoom on top of the base cover/contain
   * fit (1 = no extra zoom). Reset returns all three to these defaults. */
  cropX: number;
  cropY: number;
  cropScale: number;
  flipH: boolean;
  flipV: boolean;
  /** Corner radius as a fraction of min(w,h), same convention as ShapeElement. */
  radius: number;
  stroke: string | null;
  strokeWidth: number;
  /** Intrinsic pixel size of `src`, captured at insert/replace time — needed to compute
   * cover/contain/fill + pan/zoom layout without re-decoding the image synchronously. */
  naturalW: number;
  naturalH: number;
  /** True only for the original product-photo slot before a real image is inserted. */
  placeholder?: boolean;
  /** Roadmap #9: the picture's `src` right before an on-device background-removal
   * run replaced it, so "استرجاع الخلفية" can restore it losslessly. Absent/null
   * means the current `src` is untouched by background removal. */
  bgOriginalSrc?: string | null;
}

export const DEFAULT_IMAGE_CROP = { cropX: 0.5, cropY: 0.5, cropScale: 1 };

/** Roadmap #13: a Lottie animation played back inside the artboard. Unlike every
 * other element kind, its on-screen content isn't static — it's driven directly by
 * the shared document timeline clock (`state.t`), not by `anim`/`anim.tracks` (those
 * still apply on top, exactly as for any element: they move/fade/scale the whole
 * clip as a rigid box; this field only decides *which native Lottie frame* is drawn
 * inside that box at a given instant). See `src/lib/lottiePlayback.ts` for the exact
 * time→frame mapping shared by the live Stage preview and the PNG/video exporter —
 * the one that makes scrubbing and exporting agree. */
export interface LottieElement extends ElementBase {
  type: 'lottie';
  /** Raw bodymovin/Lottie JSON text, persisted inline with the document (same
   * "store the real bytes, no external file reference" approach as `ImageElement.src`
   * data URLs) so the animation survives reload/copy without a missing-asset risk. */
  data: string;
  /** Intrinsic size (the JSON's own `w`/`h`), captured at import time — used to lock
   * the element's box to the animation's own aspect ratio when first placed, same
   * convention as `ImageElement.naturalW/H`. */
  naturalW: number;
  naturalH: number;
  /** When true (default), the animation repeats for as long as its containing clip
   * is visible on the document timeline; when false, it freezes on its last frame
   * past its own native duration. See `lottieFrameAt` in `lottiePlayback.ts`. */
  loop: boolean;
}

/** Roadmap #14: a real video clip played back inside the artboard. Like
 * `LottieElement`, its on-screen content is driven directly by the shared document
 * timeline clock (`state.t`), not by `anim`/`anim.tracks` — see `src/lib/videoPlayback.ts`
 * for the exact time→source-time mapping (`videoSourceTimeAt`), deliberately written
 * as the same "local-time-within-a-window, loop or clamp" shape as `lottieFrameAt` so
 * the two element kinds stay consistent rather than growing two different playback
 * conventions. `anim`/`anim.tracks` still apply on top, exactly as for any element:
 * they move/fade/scale the whole clip as a rigid box; this field only decides *which
 * source frame* is drawn inside that box at a given instant. */
export interface VideoElement extends ElementBase {
  type: 'video';
  /** Raw video bytes as a data URL, persisted inline with the document — same
   * "store the real bytes, no external file reference" approach as `ImageElement.src`/
   * `LottieElement.data`, so the clip survives reload/copy without a missing-asset
   * risk. Can be large for multi-second clips — see docs/CONTROLS.md's documented
   * autosave-size caveat (already noted there for images). */
  src: string | null;
  /** Intrinsic pixel size of `src`, probed at import time (FFmpeg sidecar in the
   * packaged app, the `<video>` element's own metadata in the browser dev-preview) —
   * same convention as `ImageElement.naturalW/H`. */
  naturalW: number;
  naturalH: number;
  /** Full intrinsic duration of the source file, seconds — probed at import time.
   * `trimIn`/`trimOut` are always clamped within `[0, durationSec]`. */
  durationSec: number;
  /** The played window within the source, seconds (`0 <= trimIn < trimOut <= durationSec`). */
  trimIn: number;
  trimOut: number;
  /** 0..1 — not yet wired to export audio (no export audio pipeline exists for any
   * element kind yet); see docs/CONTROLS.md for the honest "قريبًا" note. */
  volume: number;
  muted: boolean;
  /** When true, the trimmed window repeats for as long as the document timeline
   * runs; when false, it freezes on the trimmed window's last frame past its own
   * duration. See `videoSourceTimeAt` in `videoPlayback.ts`. A real, fully-wired
   * visual effect (unlike `volume`/`muted` above). */
  loop: boolean;
  /** A representative frame extracted at import time (first non-degenerate frame
   * within the trim window), used as the timeline clip-row thumbnail and shown via
   * the native `<video poster>` attribute before the live preview's first real seek
   * resolves — same "import-time snapshot" convention as a video editor's clip
   * thumbnail. Null only if the probe/extraction step itself failed. */
  poster: string | null;
}

export type DocElement = TextElement | ShapeElement | ImageElement | LottieElement | VideoElement;

export function resolvePaletteToken(pal: Palette, token: PaletteToken): string {
  return token === 'bg' ? pal.bg : token === 'fg' ? pal.fg : pal.ac;
}

export function resolveTextColor(el: TextElement, pal: Palette): string {
  return el.color ?? pal.fg;
}

export function resolveShapeFill(el: ShapeElement, pal: Palette): string {
  return el.fill ?? resolvePaletteToken(pal, el.fillToken);
}

export function resolveShapeLabelColor(el: ShapeElement, pal: Palette): string {
  return el.labelColor ?? resolvePaletteToken(pal, el.labelColorToken ?? 'fg');
}

/** البوستر التجريبي لم يبقَ هنا: نُقل إلى `src/lib/starterTemplates.ts`
 * (`createDemoPosterElements`) في ١٨ أكتوبر ٢٠٢٦، لأنه لم يكن «المستند الافتراضي»
 * بل **قالبًا** — ووجوده في الحالة الابتدائية كان يجعل التطبيق يفتح على عمل فنيٍّ
 * نهائيٍّ لم يصنعه المستخدم. المستند الافتتاحي الآن فارغ فعلًا (`elements: []` في
 * `initialStudioState`)، والبوستر يُفتح بنقرة من شاشة البداية. */

let counter = 0;
export function newElementId(prefix: string): ElementId {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

let groupCounter = 0;
/** عدّادٌ مستقلّ عن `newElementId` لنفس سبب `newArtboardId`: معرّف المجموعة يسكن
 * حقلًا آخر (`ElementBase.groupId`) ويجب ألّا يصادف معرّفَ عنصرٍ أبدًا، وإلا صار
 * «هل هذا المعرّف لعنصرٍ أم لمجموعة؟» سؤالًا حقيقيًّا في كل موضع يقارن بينهما. */
export function newGroupId(): string {
  groupCounter += 1;
  return `grp-${Date.now().toString(36)}-${groupCounter}`;
}

let artboardCounter = 0;
/** Roadmap #16 — separate counter from `newElementId` so artboard ids never
 * collide with element ids even if both happen to be minted in the same tick. */
export function newArtboardId(): string {
  artboardCounter += 1;
  return `ab-${Date.now().toString(36)}-${artboardCounter}`;
}
