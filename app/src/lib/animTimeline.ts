import type { CSSProperties } from 'react';
import type { AnimProperty, ElementAnim, PropertyKeyframe } from '../state/elements';
import { ANIM_PROPERTY_DEFAULT } from '../state/elements';
import { applyEasing } from './easing';

/** Default length of a **newly added** element's clip, in seconds.
 *
 * هذا ما بقي من `TIMELINE_DURATION = 5`. والفرقُ ليس في الرقم بل في نوعه: كانت
 * الخمسةُ سقفًا للخطّ الزمنيّ كلِّه — لا يُمكن لمستندٍ أن يطول عنها بحال — وصارت
 * **قيمةً افتراضيةً** لطول مقطعٍ واحد، يُغيّرها المصمّم بسحب الحافّة، ويُشتَقّ طولُ
 * المستند من أطول مقطعٍ فيه (`documentDuration`). محرّر خطٍّ زمنيٍّ مفتوح في سطر واحد:
 * *«Mazij's 5 seconds is a correct default wearing the costume of a ceiling.»* */
export const DEFAULT_CLIP_DURATION = 5;

/** The document's fps when a saved document does not say — the middle of
 * `FPS_OPTIONS.mp4` (`src/data/constants.ts`), and an integer like every option
 * there. Named `_DOC_` because `constants.ts` already exports a `DEFAULT_FPS`, and
 * that one is a *per-export-format* record (`{mp4: 30, gif: 15}`) — a different
 * quantity that must not be confused with the document's own grid. */
export const DEFAULT_DOC_FPS = 30;

// ─────────────────────────────────────────────────────────────────────────────
// شبكةُ الإطارات / The frame grid
// ─────────────────────────────────────────────────────────────────────────────
//
// محرّك حركةٍ مفتوح's rule, verbatim: *"An epsilon is only necessary when the grid is
// missing."* Both epsilons this module used to carry (`eps = 0.02` in `keyframeAt`
// and `CLIP_EDGE_EPS = 1/60`) existed because a keyframe's time was a continuous
// fraction with nothing to land on. With a grid there is something to land on, so
// identity is an integer comparison and the epsilons are deleted rather than tuned.
//
// وكلُّ خيارات `FPS_OPTIONS` أعدادٌ صحيحة، فمزيج يحتاج **شبكة** لا قاعدةَ زمنٍ
// صحيحةً بمئتين وأربعٍ وخمسين مليار نبضة (`re-effectcraft-source.md:554-559`).

/** The two directions, kept apart on purpose — idea from محرّر خطٍّ زمنيٍّ مفتوح's
 * `crates/time/src/lib.rs:218-220`, which splits them for the same reason.
 *
 * **`frameAtTime` floors**: it answers *"which frame is on screen at this instant"*,
 * and the frame on screen at 1.99 frames is frame 1, not frame 2.
 * **`frameAtOrAfterTime` ceils**: it answers *"the first frame at or after this
 * instant"*, which is what a range's end needs.
 * **`timeOfFrame` is exact**: `n / fps`, the same formula `videoExport.ts` derives
 * every export frame time from, so the preview grid and the encoder's grid are the
 * same grid by construction rather than by coincidence.
 *
 * والسبب في أن `frameAtTime` تحمل تسامحًا ضئيلًا: `7/30 × 30` تساوي
 * `6.999999999999999` في حسابٍ عشريٍّ ثنائيّ، فتقريبٌ لأسفلَ بلا تسامحٍ يُعيد ٦ لا
 * ٧ — وهذا بعينه العطلُ الذي تَمنعه هذه القسمة: خطوةُ إطارٍ تتجمّد أو ترتدّ إلى
 * الخلف. والتسامحُ أصغر من أيّ فرقٍ ذي معنًى عند أيّ معدّلٍ في `FPS_OPTIONS`. */
const FRAME_TOLERANCE = 1e-6;

export function frameAtTime(seconds: number, fps: number): number {
  return Math.floor(seconds * fps + FRAME_TOLERANCE);
}

export function frameAtOrAfterTime(seconds: number, fps: number): number {
  return Math.ceil(seconds * fps - FRAME_TOLERANCE);
}

export function timeOfFrame(frame: number, fps: number): number {
  return frame / fps;
}

/** One frame at the document's rate, in seconds — the smallest unit any clip or
 * keyframe time can be. Replaces `MIN_CLIP_DURATION = 0.1`, which was a tenth of a
 * second at every frame rate, i.e. three frames at 30 fps and six at 60. */
export function frameDuration(fps: number): number {
  return 1 / fps;
}

/** Rounds a time onto the document's frame grid. **Applied at every keyframe write**
 * — that is the whole point of having a grid, and it is what lets `keyframeAt` be an
 * exact comparison instead of an epsilon.
 *
 * Rounds to the *nearest* frame rather than down, so a key placed by dragging does
 * not drift systematically early. محرّك حركةٍ مفتوح's measured consequence of leaving the
 * grid out (`re-effectcraft-source.md:549-552`): at a 24 fps export, a key placed by
 * arrow-key scrubbing lands between output frames and the first rendered frame shows
 * an interpolated value instead of the key's own. */
export function snapToFrame(seconds: number, fps: number): number {
  return timeOfFrame(Math.round(seconds * fps), fps);
}

// ─────────────────────────────────────────────────────────────────────────────
// زمنُ الحركة / Animation time
// ─────────────────────────────────────────────────────────────────────────────

/** Timeline time → animation time. One line, and its inverse is one line, and they
 * live here as a tested pair (محرّر خطٍّ زمنيٍّ مفتوح §4.6,
 * `crates/ui-egui/src/panels/effect_controls.rs:37-41`).
 *
 * **Unclamped on purpose.** `localClipTime`, which this replaces, had to clamp to
 * `[0,1]` because its output was a fraction — so every instant past the clip's end
 * answered "1", and that saturation is the whole mechanism behind the silent
 * entrance deletion (`qa/motion-journey.spec.mjs` defect 4). An animation time
 * before the clip or after it is a perfectly ordinary negative or large number here,
 * and `trackValueAt` holds the end keyframes rather than extrapolating. */
export function animTimeAt(anim: ElementAnim, timelineTime: number): number {
  return timelineTime - clipOffset(anim);
}

/** Animation time → timeline time. The inverse of `animTimeAt`; what the timeline
 * uses to place a keyframe diamond. */
export function timelineTimeOf(anim: ElementAnim, animTime: number): number {
  return animTime + clipOffset(anim);
}

/** `start − sourceIn` — the **one quantity** that maps between the two axes, and the
 * one a trim leaves invariant because it moves both fields by the same delta (§1A).
 *
 * ولِمَ تُحتَسب أوّلًا بدل `sourceIn + (t − start)`: الصيغتان متطابقتان جبرًا
 * ومختلفتان في حسابٍ عشريٍّ ثنائيّ. تقليمُ الرأس بـ٠٫٤ث يجعل الحدَّين `0.4` و
 * `0.4`، فطرحُهما **صفرٌ تامّ** ويبقى الزمنُ `t` كما هو بتّةً ببتّة؛ أمّا
 * `0.4 + (t − 0.4)` فجمعٌ وطرحٌ متعاقبان يُخرجان آخرَ بتّةٍ في بعض القيم. والمعيار
 * B2 يقول «**بالضبط** ما كانت تُعيده»، وهذه الصيغةُ تجعل الكلمةَ صحيحةً حرفًا لا
 * تقريبًا — ومعها تصير دورةُ `timelineTimeOf(anim, animTimeAt(anim, t)) === t`
 * مضمونةً لكلّ `t`، وهي خصلةٌ لا تُعطيها الصيغةُ الأخرى.
 *
 * ولعنصرٍ لم يُقلَّم قطُّ القيمةُ `start − 0 = start`، فالسلوكُ قبل المرحلة ٢
 * واحدٌ لا يتغيّر. */
export function clipOffset(anim: ElementAnim): number {
  return anim.start - (anim.sourceIn ?? 0);
}

/** The resolved value of every independent property track at a given instant — the
 * single source of truth both the DOM preview (`entranceStyleAt`, below) and the
 * canvas frame renderer (`exportArtboard.ts`, for video/GIF export) read from, so a
 * video frame's animation state can never drift from what the live timeline shows at
 * the same instant. `x`/`y` are fractions of the artboard's width (mirroring the
 * `cqw` unit `entranceStyleAt` emits directly, which resolves against the artboard
 * container's inline size — see Stage.tsx's `containerType: 'inline-size'` on the
 * artboard element, the nearest container for every element's `cqw`) — both are
 * *offsets* added on top of the element's own static `geo` position, and `rotation`
 * is likewise a delta added on top of `geo.rotation`, not a replacement for it. A
 * property with no keyframes at all (or a `tracks` that's empty, e.g. preset 'none',
 * or every keyframe deleted from a once-animated property) resolves to its identity
 * default — see `ANIM_PROPERTY_DEFAULT` — never a resurrected preset formula. */
export interface AnimVisual {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  /** معاملُ المحور الأفقيّ، **يُضرَب في `scale` ولا يَحُلّ محلَّه** — انظر
   * `effectiveScale` أدناه. ومحايدُه `1`، فعنصرٌ لا مسارَ له لا يَكتسب شيئًا. */
  scaleX: number;
  scaleY: number;
  rotation: number;
  /** **فرقُ ضبابيّةٍ يُجمَع** إلى `ElementBase.blur` الساكنة، كسرًا من عرض اللوح —
   * انظر `effectiveBlur` أدناه. ومحايدُه `0` لأنّ الجمعَ هو العمليّة، فعنصرٌ لا
   * مسارَ له يبقى على ضبابيّته الساكنة بلا زيادةٍ ولا نقص. والسالبُ مسموحٌ **في
   * المسار** كي يَقدر مفتاحٌ على إحدادِ عنصرٍ مُضبَّبٍ سلفًا؛ والمجموعُ هو ما
   * يُقصَر عند الصفر، لا المفتاحُ وحده. */
  blur: number;
}

/** **المقياسُ الفعليُّ على كلّ محور، وهذا هو الموضعُ الوحيد لهذه الصيغة.**
 *
 * `sx = scale × scaleX` و`sy = scale × scaleY`. فـ`scale` يبقى ما كان: معاملًا
 * منتظمًا على المحورَين معًا، يُضبَط من صفّه ومن نمط `pop` كما كان بالحرف؛
 * والمحوران يُضافان **فوقه** لا بدلًا منه. وهذا هو ما يَجعل «عرضٌ ينقص وارتفاعٌ
 * يزيد في اللحظة نفسها» قابلًا للتعبير أصلًا — ولم يكن كذلك قبل اليوم.
 *
 * **وعقدُ التوافق متطابقةٌ جبريّة لا دعوى سلوك**: محايدُ المحورَين `1`، والضربُ في
 * الواحد تامٌّ في IEEE 754، فمستندٌ لا يحمل المسارَين يُعطي `sx === sy === scale`
 * **بتّةً ببتّة** — لا «قريبًا منه». وعليها تَقدر `entranceStyleAt` أدناه على
 * إنباعث النصِّ القديمِ نفسِه حرفًا حرفًا، وتَقدر `drawElements`
 * (`exportArtboard.ts`) على إجراء `ctx.scale` المكالمةِ نفسِها بالوسيطَين
 * نفسِهما. والقياسُ في `qa/independent-wh-anim.spec.mjs` §٤.
 *
 * وتُصدَّر لأنّ مُستهلِكَيها اثنان — معاينةُ DOM ومسارُ القُماش — ولا يجوز أن
 * يَشتقّ أحدُهما الصيغةَ من جديد، لعين السبب الذي من أجله كانت `resolveAnimAt`
 * واحدةً: إطارُ فيديو عند لحظةٍ يجب أن يُطابق ما يُظهره السحبُ عندها. */
export function effectiveScale(v: AnimVisual): { sx: number; sy: number } {
  return { sx: v.scale * v.scaleX, sy: v.scale * v.scaleY };
}

/** **الضبابيّةُ الفعليّةُ كسرًا من عرض اللوح، وهذا هو الموضعُ الوحيد لهذه الصيغة.**
 *
 * `blur = max(0, الساكنة + فرقُ المسار)`. والجمعُ لا الضرب لأنّ محايدَ الضبابيّة
 * `0`: فمستندٌ لا يحمل المسارَ يُعطي الساكنةَ **بتّةً ببتّة** (`س + 0 = س` تامٌّ
 * في IEEE 754)، ومستندٌ لا يحمل الساكنةَ ولا المسارَ يُعطي `0` فلا يُنبعَث
 * `filter` إطلاقًا ولا يُضبَط `ctx.filter` — وعليه يقوم عقدُ «كلُّ مستندٍ قائمٍ
 * يُنتج ما كان يُنتجه حرفًا حرفًا».
 *
 * والقَصرُ عند الصفر على **المجموع** لا على المفتاح: مفتاحٌ بفرقٍ سالبٍ هو الطريقُ
 * الوحيدُ إلى «ابدأ مُضبَّبًا وانتهِ حادًّا»، وضبابيّةٌ سالبةٌ لا معنى لها في أيّ
 * رسّامة. وهي ليست كالمقياس: السالبُ هناك **انعكاسٌ** له بابُه المُعلَن، وهنا لا
 * معنًى ثانيًا يُفتَح له باب.
 *
 * وتُصدَّر لأنّ مُستهلِكيها ثلاثةٌ — معاينةُ DOM و القُماشُ و SVG — ولا يجوز أن
 * يَشتقّ أحدُهم الصيغةَ من جديد، لعين سبب `effectiveScale` و`resolveAnimAt`. */
export function effectiveBlur(staticBlur: number, v: AnimVisual): number {
  return Math.max(0, (staticBlur || 0) + v.blur);
}

/** نصفُ قطر الضبابيّة **بالبكسل على القُماش**، مع تعويضٍ مقيسٍ عن فرقٍ حقيقيٍّ بين
 * الرسّامتَين.
 *
 * **ولِمَ تعويضٌ أصلًا.** قيسَ الفرقُ في Chromium قبل كتابة هذا السطر:
 *
 * - **CSS**: `filter` يُطبَّق في الفضاء المحلّيّ للعنصر **ثم** يَمطّه `transform`.
 *   `blur(20px)` وحدَه أعطى عرضَ انتقالٍ ١٠-٩٠ يساوي ٥٠ بكسلًا؛ ومعه `scale(2)`
 *   أعطى ٩٨ — نسبةُ ١٫٩٦ ≈ ٢. فالمقياسُ يُكبّر الضبابيّة.
 * - **Canvas**: `ctx.filter` **لا تَعرف مصفوفةَ التحويل إطلاقًا**. الصندوقُ المرسومُ
 *   نفسُه تحت `ctx.scale(2, 2)` أعطى عرضَ انتشارٍ ١٨٢ بكسلًا، وبلا مقياسٍ ١٨٢
 *   أيضًا — نسبةُ `1.000` بالضبط.
 *
 * فبلا ضربٍ باليد يَختلف الرسّامان كلَّما حُرِّك المقياسُ على عنصرٍ مُضبَّب.
 * والمتوسّطُ الهندسيُّ `sqrt(sx·sy)` هو المختار لأنه **يُعيد `s` بعينه متى تساوى
 * المحوران** — وهي حالةُ كلّ مستندٍ لا يَستعمل `scaleX`/`scaleY`، فيَتطابق
 * الرسّامان فيها تطابقًا تامًّا لا تقريبيًّا.
 *
 * **وثمنُه مُعلَنٌ لا مُخفًى**: متى اختلف المحوران فـCSS يُنتج ضبابيّةً **لا
 * متساويةَ المحاور** (قيسَ: `scale(1,2)` أعطى حبرًا ١٧٤×٣٤٤ والانتقالُ الأفقيُّ ٥٠
 * كما هو)، و`ctx.filter` لا تَقبل إلّا نصفَ قطرٍ واحدًا متساويَ المحاور. فلا سبيلَ
 * إلى جمعهما بهذه الأداة، والفرقُ **مقيسٌ ومُعلَنٌ رقمًا** في
 * `qa/shape-blur.spec.mjs` §٥ لا مُغطًّى. */
export function canvasBlurRadiusPx(staticBlur: number, v: AnimVisual, artboardWidthPx: number): number {
  const frac = effectiveBlur(staticBlur, v);
  if (frac <= 0) return 0;
  const { sx, sy } = effectiveScale(v);
  const scaleMean = Math.sqrt(Math.max(0, sx) * Math.max(0, sy));
  return frac * artboardWidthPx * scaleMean;
}

function sortedTrack(track: PropertyKeyframe[]): PropertyKeyframe[] {
  return [...track].sort((a, b) => a.time - b.time);
}

/** Resolves one property's independent track at an **absolute animation time in
 * seconds**: locates which pair of keyframes it falls between and eases across that
 * segment using *that keyframe's own* easing/bezier — each property track, and each
 * segment within it, interpolates fully independently of every other.
 *
 * **Clamps at the end keyframes and never extrapolates** (محرّر خطٍّ زمنيٍّ مفتوح §4.4,
 * `crates/project/src/keyframe.rs:256-262`): before the first key the track holds the
 * first value, after the last key it holds the last. That is what makes an unclamped
 * animation time safe — the clamp moved from the *time* (where it destroyed
 * information) to the *value* (where holding is the correct answer). */
function trackValueAt(track: PropertyKeyframe[] | undefined, animTime: number, fallback: number): number {
  if (!track || !track.length) return fallback;
  const kfs = sortedTrack(track);
  if (kfs.length === 1) return kfs[0].value;
  if (animTime <= kfs[0].time) return kfs[0].value;
  if (animTime >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

  let prev = kfs[0];
  let next = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (animTime >= kfs[i].time && animTime <= kfs[i + 1].time) {
      prev = kfs[i];
      next = kfs[i + 1];
      break;
    }
  }
  const span = next.time - prev.time;
  const segProgress = span <= 0 ? 1 : (animTime - prev.time) / span;
  const eased = applyEasing(prev.easing, prev.bezier, segProgress);
  return prev.value + (next.value - prev.value) * eased;
}

/** Resolves every independent property track at an absolute timeline time. This is
 * the one place video/GIF export, the canvas preview, and the DOM preview all read
 * from — see `AnimVisual` above. */
export function resolveAnimAt(anim: ElementAnim, time: number): AnimVisual {
  const m = animTimeAt(anim, time);
  return {
    opacity: trackValueAt(anim.tracks.opacity, m, ANIM_PROPERTY_DEFAULT.opacity),
    x: trackValueAt(anim.tracks.x, m, ANIM_PROPERTY_DEFAULT.x),
    y: trackValueAt(anim.tracks.y, m, ANIM_PROPERTY_DEFAULT.y),
    scale: trackValueAt(anim.tracks.scale, m, ANIM_PROPERTY_DEFAULT.scale),
    // كلُّ محورٍ يُحَلّ من مساره وحده، فلا يَعرف أحدُهما الآخرَ ولا `scale`.
    // والتركيبُ يحدث عند الاستهلاك في `effectiveScale`، لا هنا — فتبقى العيّنةُ
    // المُلتقَطةُ من بناءٍ سابقٍ قابلةً للمقارنة حقلًا بحقل.
    scaleX: trackValueAt(anim.tracks.scaleX, m, ANIM_PROPERTY_DEFAULT.scaleX),
    scaleY: trackValueAt(anim.tracks.scaleY, m, ANIM_PROPERTY_DEFAULT.scaleY),
    rotation: trackValueAt(anim.tracks.rotation, m, ANIM_PROPERTY_DEFAULT.rotation),
    // فرقٌ خالصٌ من مساره وحده، لا يَعرف الضبابيّةَ الساكنةَ على العنصر — والتركيبُ
    // يحدث عند الاستهلاك في `effectiveBlur`، لا هنا. وبهذا تبقى هذه الدالّةُ تأخذ
    // `anim` وحدَه لا العنصرَ كلَّه، وهو القيدُ المُعلَن في `state/elements.ts:45`.
    blur: trackValueAt(anim.tracks.blur, m, ANIM_PROPERTY_DEFAULT.blur),
  };
}

/** Resolves a single property's value at an absolute timeline time — used by the
 * properties panel to show whether the current value at the playhead is keyframed. */
export function resolvePropertyAt(anim: ElementAnim, property: AnimProperty, time: number): number {
  return trackValueAt(anim.tracks[property], animTimeAt(anim, time), ANIM_PROPERTY_DEFAULT[property]);
}

// ─────────────────────────────────────────────────────────────────────────────
// قُمعُ الكتابة الواحد / The one write funnel
// ─────────────────────────────────────────────────────────────────────────────

/** Writes one keyframe onto one track and returns the new track, sorted by time.
 *
 * **كلُّ كتابةِ مفتاحٍ تمرّ من هنا** — زرُّ «مفتاح عند المؤشّر»
 * (`addTrackKeyframeAtPlayhead`) وسحبُ الماسة على المقطع (`Clip.tsx`) كلاهما. وقبل
 * ذلك كان للسحب مسارُه الخاصّ: يكتب الزمن مباشرةً بـ`clamp(…, 0, 1)` **بلا أيّ
 * معالجةٍ للتصادم**، فمفتاحان يَقعان على الزمن نفسه وأحدُهما يصير غيرَ قابلٍ للوصول
 * إلى الأبد — ماسةٌ على الشاشة تحت ماسةٍ أخرى.
 *
 * On an **exact** hit (same time, after both are on the grid) the value is replaced
 * while `id`, `easing` and `bezier` are copied off the old key — محرّك حركةٍ مفتوح's
 * twelve-field copy reduced to Mazij's three fields
 * (`crates/keyframe/src/lib.rs:596-623`, pinned there by a test named
 * `replacing_key_preserves_spatial_metadata`). Keeping the `id` matters beyond
 * tidiness: the timeline's selection, the popover and the drag all address a keyframe
 * by id, so a replace that minted a new one would silently drop the selection.
 *
 * Otherwise the key is inserted in time order. The incoming time is assumed to be on
 * the grid already — callers snap, because snapping is a document-fps decision and
 * this function does not know the fps. */
export function setKeyframe(track: PropertyKeyframe[] | undefined, key: PropertyKeyframe): PropertyKeyframe[] {
  const kfs = track ? sortedTrack(track) : [];
  // Binary search by exact time. Linear would do at these sizes; the search is here
  // because it is also the insertion point, so one walk answers both questions.
  let lo = 0;
  let hi = kfs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].time < key.time) lo = mid + 1;
    else hi = mid;
  }
  if (lo < kfs.length && kfs[lo].time === key.time) {
    const old = kfs[lo];
    const next = kfs.slice();
    next[lo] = { ...key, id: old.id, easing: old.easing, bezier: [...old.bezier] };
    return next;
  }
  return [...kfs.slice(0, lo), key, ...kfs.slice(lo)];
}

/** The real keyframe sitting **on the same frame** as the given timeline time, if
 * any — what the properties panel's per-property keyframe toggle uses both to show a
 * filled vs. outline state and to know which keyframe to remove on a second click.
 *
 * Exact integer equality of frame indices, which is why there is no epsilon any
 * more. The whole comment block this replaced documented a bug that cannot be
 * expressed in this representation: there is no saturating fraction to feed the
 * playhead through, so an instant past the clip's end is simply a frame no keyframe
 * is on, and the ◇ reads unfilled there. */
export function keyframeAt(anim: ElementAnim, property: AnimProperty, time: number, fps: number): PropertyKeyframe | undefined {
  const frame = frameAtTime(animTimeAt(anim, time), fps);
  return anim.tracks[property]?.find((k) => frameAtTime(k.time, fps) === frame);
}

export function isKeyframedAt(anim: ElementAnim, property: AnimProperty, time: number, fps: number): boolean {
  return !!keyframeAt(anim, property, time, fps);
}

// ─────────────────────────────────────────────────────────────────────────────
// المدّةُ المشتقّة / The derived duration
// ─────────────────────────────────────────────────────────────────────────────

/** **طولُ المستند**: اللحظةُ الأولى التي تكون فيها كلُّ المقاطع قد انتهت.
 *
 * مشتقٌّ لا مثبَّت، وهذا هو إغلاقُ الحدّ الأوّل من الحدود الموثَّقة الخمسة. وكانت
 * الدالّة موجودةً جنينًا باسم `settledTime` في `StudioContext`: تحسب هذا بعينه ثم
 * تَحجِزه — `return Math.min(TIMELINE_DURATION, t);`. فالتغييرُ هو حذفُ الحجز.
 *
 * وهذا هو الرقم الذي **يُعرَض ويُصدَّر**: شارةُ الخطّ الزمنيّ، وبطاقةُ اللوحة،
 * وعددُ إطارات MP4 (`round(duration × fps)`). مستندٌ مقاطعُه تنتهي عند ٠٫٦ث و٣٫٤ث
 * طولُه ٣٫٤ث، ويُصدَّر ١٠٢ إطارًا عند ٣٠ إطارًا — لا ١٥٠.
 *
 * Floored at one frame so a document whose only clip has zero length still has a
 * number that can be divided by. A document with **no clips at all** has no length
 * of its own, so it falls back to `DEFAULT_CLIP_DURATION` — see `timelineSpan` for
 * why that is a floor on a *view* and not the ceiling that was just deleted. */
export function documentDuration(anims: readonly { start: number; duration: number }[], fps: number): number {
  if (!anims.length) return DEFAULT_CLIP_DURATION;
  let end = 0;
  for (const a of anims) end = Math.max(end, a.start + a.duration);
  return Math.max(frameDuration(fps), end);
}

/** **المدى المعروض على المسطرة**، وهو كمّيةٌ أخرى غير طول المستند.
 *
 * والفرقُ بينهما هو الفرقُ بين سقفٍ وأرضيّة، ويجب ألّا يُخلَط:
 *
 * - **طولُ المستند** مشتقٌّ ولا حدَّ له من أعلى. اسحب حافّةَ مقطعٍ إلى الثانية
 *   الثامنة فيصير المستند ثماني ثوانٍ، ويُصدَّر ثماني ثوانٍ. هذا ما كان مستحيلًا.
 * - **مدى المسطرة** لا يَقِلّ عن `DEFAULT_CLIP_DURATION`، لأنّ مسطرةً بطول ٠٫٦ث
 *   ليس فيها موضعٌ تسحب إليه مقطعًا: المستندُ الذي كلُّ دخولاته تنتهي عند ٠٫٦ث
 *   تملأ مقاطعُه عرضَ اللوح كلَّه، فلا يبقى فراغٌ يُؤخَّر إليه سطرٌ ثانٍ. فهي
 *   أرضيّةٌ على **المنظر** لا حدٌّ على المستند، ولذلك تتمدّد بلا قيدٍ فوقها.
 *
 * وهذا هو ما بقي من الخمسةِ ثوانٍ: `DEFAULT_CLIP_DURATION` أرضيّةُ منظرٍ وقيمةٌ
 * افتراضية، لا سقفٌ لمستند. */
export function timelineSpan(docDuration: number): number {
  return Math.max(docDuration, DEFAULT_CLIP_DURATION);
}

// ─────────────────────────────────────────────────────────────────────────────
// سُلَّمُ العلامات / The tick ladder
// ─────────────────────────────────────────────────────────────────────────────

/** Adapted from محرّر خطٍّ زمنيٍّ مفتوح's `crates/ui-egui/src/panels/timeline.rs:1411-1425`
 * (MIT OR Apache-2.0; `Copyright (c) 2026 مشروعه الأمّ Team and the محرّر خطٍّ زمنيٍّ مفتوح
 * contributors.`). The **rule** is what transfers, not the pixel numbers: محرّر خطٍّ زمنيٍّ مفتوح's
 * own §9.1 says it was never built or run, so 110 and 12 are values in egui *points*
 * and are taken here as starting points re-measured in Mazij's DOM, not as constants.
 *
 * Candidate strides climb `1, 2, 5, 10, 20, 50, …`. The **label** stride is the first
 * candidate whose on-screen spacing is at least `minLabelPx`; the **tick** stride is
 * the largest divisor of the label stride whose spacing is at least `minTickPx`. So
 * every label lands on a tick **by construction** rather than by luck — which is the
 * whole reason to compute them as a pair instead of picking two numbers.
 *
 * وهذا يُسقِط `TICKS = [0, 1, 2, 3, 4]` الموضوعةَ عند `left: i * 20%`: خمسُ علاماتٍ
 * صحيحةٌ لمسطرةٍ طولها خمسُ ثوانٍ بالضبط، وخاطئةٌ لأيّ طولٍ آخر — وهي بعد اشتقاق
 * المدّة أيُّ طولٍ آخر. */
export interface TickLadder {
  labelStride: number;
  tickStride: number;
  labels: number[];
  ticks: number[];
}

export function tickLadder(spanSeconds: number, widthPx: number, minLabelPx = 110, minTickPx = 12): TickLadder {
  const candidates: number[] = [];
  for (let decade = 0.01; decade <= 100000; decade *= 10) candidates.push(decade, decade * 2, decade * 5);
  candidates.sort((a, b) => a - b);

  const pxPerSecond = spanSeconds > 0 ? widthPx / spanSeconds : 0;
  const spacing = (stride: number) => stride * pxPerSecond;

  const labelStride = candidates.find((c) => spacing(c) >= minLabelPx) ?? candidates[candidates.length - 1];
  // أكبرُ قاسمٍ لخطوة العنوان يفي بأدنى تباعدٍ للعلامة. والبحثُ تنازليٌّ فيُعيد
  // أكبرَها، وخطوةُ العنوان نفسها قاسمٌ لنفسها فالقائمةُ لا تخلو أبدًا.
  const divisors = candidates.filter((c) => c <= labelStride && Math.abs(labelStride / c - Math.round(labelStride / c)) < 1e-9);
  const tickStride = [...divisors].reverse().find((c) => spacing(c) >= minTickPx) ?? labelStride;

  const at = (stride: number) => {
    const out: number[] = [];
    if (stride <= 0) return out;
    for (let n = 0; n * stride <= spanSeconds + 1e-9; n++) out.push(n * stride);
    return out;
  };
  return { labelStride, tickStride, labels: at(labelStride), ticks: at(tickStride) };
}

/** مدّةُ مستندٍ كما تُقرأ في شارة: «٣٫٤ث». ومنزلةٌ واحدةٌ تكفي القراءة، والرقمُ
 * الكامل يبقى في `data-duration` لمن يقيس. */
export function formatDurationSec(seconds: number, lang: 'ar' | 'en'): string {
  const rounded = Math.round(seconds * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}${lang === 'ar' ? 'ث' : 's'}`;
}

/** `mm:ss.cc` — a real formatter, replacing `` `00:0${Math.floor(state.t)}.…` ``.
 *
 * That hardcoded `00:0` prefix was correct below ten seconds and nowhere else, which
 * was invisible while the timeline could not exceed five. A derived duration breaks
 * it on the first long project, so it goes with the ceiling it depended on. No
 * drop-frame, no timecode offset, no 1001-family rates: `FPS_OPTIONS` is all
 * integers. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mm = Math.floor(safe / 60);
  const ss = Math.floor(safe % 60);
  const cc = Math.round((safe - Math.floor(safe)) * 100) % 100;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cc).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────

/** `AnimVisual` turned into a CSS transform/opacity pair for the DOM preview —
 * `ElementView` composes this with the element's own static `geo` rotation and base
 * `opacity`. */
export function entranceStyleAt(anim: ElementAnim, time: number, staticBlur = 0): { opacity?: number; transform?: string; filter?: string } {
  const v = resolveAnimAt(anim, time);
  const transformParts: string[] = [];
  if (v.x !== 0 || v.y !== 0) transformParts.push(`translate(${(v.x * 100).toFixed(2)}cqw, ${(v.y * 100).toFixed(2)}cqw)`);
  // **مُعامِلٌ واحدٌ متى تساوى المحوران، ومُعامِلان متى اختلفا.** و`scale(S)` و
  // `scale(S, S)` صورةٌ واحدةٌ ونصّانِ مختلفان — فلو أُنبعِث الثاني دائمًا لصار
  // **كلُّ** مستندٍ قائمٍ يُنتج `style.transform` غيرَ الذي كان يُنتجه، وصارت
  // دعوى «لم يتغيّر شيء» غيرَ قابلةٍ للبرهان بالنصّ. والشرطُ هنا يَجعلها قابلةً
  // له، ويَجعل المستندَ الذي لا يستعمل القدرةَ الجديدة لا يَدفع ثمنَها في
  // المُخرَج. مقيسٌ على ملفٍّ من بناءِ ما قبل التغيير — `qa/independent-wh-anim.spec.mjs` §٤.
  const { sx, sy } = effectiveScale(v);
  if (sx !== 1 || sy !== 1) transformParts.push(sx === sy ? `scale(${sx.toFixed(3)})` : `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`);
  if (v.rotation !== 0) transformParts.push(`rotate(${v.rotation.toFixed(2)}deg)`);
  // **`cqw` لا بكسلًا، ولا يَعرف هذا الموضعُ مقاسَ اللوح — وهو مقيسٌ لا مُفترَض.**
  // اللوحُ `container-type: inline-size` (`Stage.tsx`)، و`translate(Xcqw, Ycqw)`
  // أعلاه يَقرأ ذلك سلفًا. وقيسَ أنّ Chromium يَحُلّ `blur(5cqw)` داخل حاضنٍ عرضُه
  // ٤٠٠ بكسلًا إلى `blur(20px)` **بالضبط**، ومسحُ البكسل للاثنين متطابقٌ حبرًا
  // وانتقالًا. فلا تَحتاج المعاينةُ أن تَعرف مقاسًا، ولا يُعاد حسابُ شيءٍ عند
  // التكبير أو عند «التحجيم الذكيّ».
  //
  // و**`undefined` متى كان المجموعُ صفرًا** لا `'blur(0cqw)'` ولا `'none'`: فكلُّ
  // مستندٍ قائمٍ يُنتج كائنَ النمطِ نفسَه الذي كان يُنتجه، فتبقى دعوى «لم يتغيّر
  // شيء» قابلةً للبرهان بالنصّ — وهو عقدُ `scale(S)` نفسُه أعلاه.
  const blurFrac = effectiveBlur(staticBlur, v);
  return {
    opacity: v.opacity,
    transform: transformParts.join(' ') || undefined,
    filter: blurFrac > 0 ? `blur(${(blurFrac * 100).toFixed(3)}cqw)` : undefined,
  };
}

/** Same resolution as `entranceStyleAt`, but as raw numbers for the canvas frame
 * renderer — see `AnimVisual` above for why this must stay the one shared formula
 * rather than a parallel reimplementation. */
export function entranceVisualAt(anim: ElementAnim, time: number): AnimVisual {
  return resolveAnimAt(anim, time);
}

export function entranceStyleToCss(style: { opacity?: number; transform?: string; filter?: string }): CSSProperties {
  return { opacity: style.opacity, transform: style.transform, filter: style.filter };
}
