// ─────────────────────────────────────────────────────────────────────────────
// جبرُ التحرير / The edit algebra
// ─────────────────────────────────────────────────────────────────────────────
//
// **بلا حالة، وبلا تحديد، وبلا تراجع، والمعرّفاتُ تُحقَن.** قسمةُ an open-source timeline editor §2.1
// حرفًا (`crates/edit/src/lib.rs:3-5`, `:56-66`): طبقةُ التحرير دوالٌّ على
// `DocElement[]` وحدها، فما يُسلّمه هذا الملفّ قابلٌ للقياس بلا متصفّحٍ وبلا
// `StudioContext` — والتحديدُ والتراجعُ وتوليدُ المعرّفات شأنُ المُنادي.
//
// الإسناد: الأفكارُ أدناه من an open-source timeline editor (`MIT OR Apache-2.0`;
// `Copyright (c) 2026 its upstream project Team and the an open-source timeline editor contributors.`)، مُسنَدةً
// عند موضعِ كلٍّ منها. ولا سطرَ كودٍ منقول: نموذجُ مزيج لا `TrackItem` فيه ولا
// مصدرَ وسائطَ مشتركًا، فالتقسيمُ عنده شيءٌ آخر — انظر `splitAt`.

import type { AnimProperty, DocElement, ElementAnim, PropertyKeyframe } from '../state/elements';
import { ANIM_PROPERTIES } from '../state/elements';
import { EASING_BEZIER } from './easing';
import type { ClipEdge } from './timelineHit';
import { animTimeAt, frameDuration, resolvePropertyAt, setKeyframe, snapToFrame } from './animTimeline';

export interface TrimContext {
  /** شبكةُ المستند. أدنى طولِ مقطعٍ إطارٌ واحدٌ بها — لا عُشرَ ثانيةٍ مثبَّتًا. */
  fps: number;
}

function clampTo(value: number, lo: number, hi: number): number {
  if (hi < lo) return hi;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * **الحجزُ منفصلٌ عن التطبيق، و`trim` تُعيد الفرقَ الذي طُبِّق فعلًا لا `void`**
 * (`crates/edit/src/lib.rs:654`, `:725`). وهذه القسمةُ بعينها هي ما يُتيح لمعاينةِ
 * السحب أن **تتوقّف عند الحدّ** بدل أن ترتدّ إليه عند الإفلات؛ ومحرّر خطٍّ زمنيٍّ مفتوح تُسمّيها
 * القرارَ الذي *«makes trimming feel solid»* (قياسٌ خارجيٌّ موثَّق`).
 *
 * الحدود:
 * - **حافّةُ الدخول**: لا تَسبق الصفر، ولا تَبلغ النهايةَ فتترك أقلَّ من إطار.
 * - **حافّةُ الخروج**: لا تَنزل تحت إطارٍ واحد، **ولا سقفَ لها** — طولُ المستند
 *   مشتقٌّ من مقاطعه (المرحلة ١)، فالمقطعُ هو الذي يُطيل المستند لا العكس.
 *
 * والناتجُ **على شبكة الإطارات**: الحافّةُ تَقع على إطارٍ كما يَقع المفتاح، فلا
 * يبقى في المستند زمنٌ بين إطارَين لا يُعبَّر عنه في أيّ مخرَج.
 */
export function clampTrim(anim: ElementAnim, edge: ClipEdge, delta: number, ctx: TrimContext): number {
  const frame = frameDuration(ctx.fps);
  if (edge === 'in') {
    const lo = -anim.start;
    const hi = anim.duration - frame;
    const bounded = clampTo(delta, lo, hi);
    const snapped = snapToFrame(anim.start + bounded, ctx.fps) - anim.start;
    return clampTo(snapped, lo, hi);
  }
  const lo = frame - anim.duration;
  const end = anim.start + anim.duration;
  const bounded = Math.max(delta, lo);
  const snapped = snapToFrame(end + bounded, ctx.fps) - end;
  return Math.max(snapped, lo);
}

/**
 * يُقلّم حافّةً واحدة ويُعيد `anim` الجديدة **والفرقَ المُطبَّق**.
 *
 * - **حافّةُ الدخول تُحرّك `anim.start` و`anim.sourceIn` بالفرق نفسه** (§1A): يُقَصّ
 *   الرأسُ ولا يُعاد توقيتُ مفتاحٍ واحد. فكرةٌ من an open-source timeline editor
 *   (`crates/edit/src/lib.rs:16`: *"Keyframes are stored in media time, so trims and
 *   splits never need to move them."*).
 * - **حافّةُ الخروج لا تُحرّك واحدًا منهما**: المقطعُ يكسب هواءً ميتًا في آخره،
 *   وهو السلوكُ الصحيح وهو مجّانيٌّ بالتمثيل وحده (§1.3).
 *
 * ولأنّ `animTimeAt` تَحسب `start − sourceIn` أوّلًا (انظر تعليقَها)، فالفرقُ
 * المشترك يُطرَح من نفسه حسابًا، فالزمنُ المحلولُ **لا يتغيّر ولا في آخر بتّة** —
 * وهذا ما يجعل المعيار B2 يقول «بالضبط» ويعنيه.
 */
/**
 * **حركةُ الخروج تتبع نهايةَ المقطع** (٢٩ أكتوبر ٢٠٢٦، بالنقر الحقيقيّ). كان مدُّ نهاية مقطعٍ
 * يُبقي مفاتيحَ خروجه مكانها، فيختفي العنصرُ في الوقت نفسه ويبقى الجزءُ الممدود فارغًا — والمصمّمُ
 * مدّه ليبقى أطول. فكما في محرّرات الفيديو: **ما بعد آخر ثباتٍ في المسار هو الخروج**، وينتقل مع
 * حافّة النهاية. والثباتُ مفتاحان متتاليان بالقيمة نفسها (ظهورٌ ← بقاءٌ ← اختفاء)؛ ومسارٌ بلا ثباتٍ
 * (تلاشٍ داخلٌ فقط، أو انزلاقٌ ممتدٌّ إلى النهاية) لا خروجَ فيه فلا يُمسّ. وحافّةُ البداية على عقدها
 * القائم: ما تحت الخطّ الزمنيّ لا يتغيّر (معيار B2).
 */
function anchorExitKeys(anim: ElementAnim, applied: number): ElementAnim {
  const tracks: ElementAnim['tracks'] = { ...anim.tracks };
  let changed = false;
  for (const prop of Object.keys(anim.tracks) as AnimProperty[]) {
    const track = anim.tracks[prop];
    if (!track || track.length < 3) continue;
    const sorted = [...track].sort((x, y) => x.time - y.time);
    let holdEnd = -1;
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (Math.abs(sorted[i].value - sorted[i + 1].value) < 1e-9) {
        holdEnd = i + 1;
        break;
      }
    }
    if (holdEnd < 0 || holdEnd === sorted.length - 1) continue;
    const floor = sorted[holdEnd].time;
    const exitIds = new Set(sorted.slice(holdEnd + 1).map((k) => k.id));
    tracks[prop] = track.map((k) => (exitIds.has(k.id) ? { ...k, time: Math.max(k.time + applied, floor) } : k));
    changed = true;
  }
  return changed ? { ...anim, tracks } : anim;
}

export function trim(anim: ElementAnim, edge: ClipEdge, delta: number, ctx: TrimContext): { anim: ElementAnim; applied: number } {
  const applied = clampTrim(anim, edge, delta, ctx);
  if (applied === 0) return { anim, applied: 0 };
  if (edge === 'in') {
    return {
      anim: { ...anim, start: anim.start + applied, sourceIn: (anim.sourceIn ?? 0) + applied, duration: anim.duration - applied },
      applied,
    };
  }
  return { anim: anchorExitKeys({ ...anim, duration: anim.duration + applied }, applied), applied };
}

/** نقلُ المقطع: `start` يتغيّر و`sourceIn` لا — فالمفاتيح تتحرّك **مع** المقطع.
 * الدلالةُ قائمةٌ أصلًا في `Clip.tsx` وهذه هي نفسُها منقولةً إلى الجبر كي يكون
 * للإيماءات الثلاث بيتٌ واحد. **بلا سقف**: طولُ المستند مشتقّ. */
export function moveClip(anim: ElementAnim, delta: number): { anim: ElementAnim; applied: number } {
  const newStart = Math.max(0, anim.start + delta);
  if (newStart === anim.start) return { anim, applied: 0 };
  return { anim: { ...anim, start: newStart }, applied: newStart - anim.start };
}

/** مفتاحُ هذا المسار السابقُ لزمنٍ معيّن — لوراثةِ انحنائه. */
function easingBefore(track: PropertyKeyframe[] | undefined, animTime: number): Pick<PropertyKeyframe, 'easing' | 'bezier'> | null {
  if (!track || !track.length) return null;
  const sorted = [...track].sort((a, b) => a.time - b.time);
  let chosen = sorted[0];
  for (const k of sorted) {
    if (k.time <= animTime) chosen = k;
    else break;
  }
  return { easing: chosen.easing, bezier: [...chosen.bezier] as PropertyKeyframe['bezier'] };
}

export interface SplitContext {
  fps: number;
  /** يُحقَن: الجبرُ لا يُولّد معرّفات (`crates/edit/src/lib.rs:56-66`). */
  newId: (prefix: string) => string;
}

export interface SplitResult {
  elements: DocElement[];
  /** النصفُ الأيسر — العنصرُ الأصلُ بمعرّفه. */
  leftId: string;
  /** النصفُ الأيمن — **عنصرٌ جديد**. انظر دلالاتِ التقسيم أدناه. */
  rightId: string;
}

/**
 * **تقسيمٌ عند لحظةٍ على الخطّ الزمنيّ.**
 *
 * ودلالتُه في نموذج مزيج أغلى منها في an open-source timeline editor، وهذا يجب أن يُعلَن لا أن
 * يُكتَشَف: تقسيمُ an open-source timeline editor رخيصٌ لأنه لا يفعل إلّا إعادةَ إسنادِ معرّفات —
 * النصفان يتشاركان المصدرَ والمفاتيحُ في زمن الوسيط
 * (`crates/edit/src/lib.rs:95-132`). ومزيجٌ لا `TrackItem` فيه ولا مصدرَ مشترك:
 * **المقطعُ هو العنصر** (`ElementAnim` يسكن `ElementBase`). فالتقسيمُ عنده
 * **مضاعفةُ العنصر** — ومعناه أنّ تقسيمَ عنصرِ نصٍّ يُنتج عنصرَي نصٍّ يحملان
 * السلسلةَ نفسها، وهو بابٌ جديد إلى حدٍّ موثَّقٍ قائم (§5.4). ولذلك يقول سطحُ
 * التقسيم ما يُنتجه (`split_consequence` في القاموس) قبل أن يُضغَط.
 *
 * ما يفعله بالمفاتيح: زمنُ المفتاح مطلقٌ على محورِ زمنِ الحركة، والنصفان يحملان
 * الفرقَ `start − sourceIn` نفسَه — فلا يُعاد كتابةُ زمنِ مفتاحٍ واحد. يَبقى على
 * اليسار ما زمنُه ≤ زمنِ القطع، وعلى اليمين ما زمنُه ≥ زمنِه، **ويُكتَب عند القطع
 * مفتاحُ حدٍّ على الجانبين** بالقيمة المحلولة هناك، وارثًا انحناءَ المفتاح الذي
 * يَسبقه — وهي قاعدةُ `set_at` (`crates/project/src/keyframe.rs:191-206`)، تُؤخَذ
 * هنا قبل موعدها لأنّ بدونها يَبدأ النصفُ الأيمن بكسرةٍ خطّيّةٍ داخل منحنًى.
 *
 * ومعه **عتبةُ إطارٍ واحدٍ على الشفافيّة** عند القطع، وهي زيادةٌ على نصّ الخطّة
 * فرضها القياس: مدّةُ المقطع في مزيج ليست نافذةَ ظهور، فالنصفان يُرسَمان معًا بلا
 * هذه العتبة. السببُ والقياسُ والثمنُ في الفقرة الطويلة داخل الحلقة أدناه.
 *
 * **وحدُّه المقيس**: مقطعٌ يُقَصّ **داخل** مقطعةٍ منحنيةٍ غير خطّيّة لا يبقى
 * مكافئًا بالقيمة — إعادةُ تثبيتِ بداية المقطعة عند القطع تُغيّر خريطةَ التقدّم
 * التي يُطبَّق عليها الانحناء. والإصلاحُ التامّ تقسيمُ منحنى بيزيه نفسِه، وهو
 * تمثيلٌ آخر لا يُفتَح هنا. فما يُضمَن: قطعٌ **بين** المقطعات (الحالةُ الغالبة —
 * دخولٌ ينتهي ثم هواءٌ ميت) مكافئٌ بالبكسل تمامًا، وهو ما يقيسه المعيار B6؛ وقطعٌ
 * داخل مقطعةٍ منحنية يُعلَن حدًّا لا يُكتَم.
 *
 * يُعيد `null` إن لم يكن القطعُ داخلَ المقطع بإطارٍ على الأقلّ من كلّ جانب: لا
 * نصفَ بطولِ صفر، ولا تقسيمَ عند حافّةٍ لا يُنتج شيئًا.
 */
export function splitAt(elements: DocElement[], elementId: string, t: number, ctx: SplitContext): SplitResult | null {
  const index = elements.findIndex((e) => e.id === elementId);
  if (index < 0) return null;
  const el = elements[index];
  const anim = el.anim;
  const frame = frameDuration(ctx.fps);
  const cut = snapToFrame(t, ctx.fps);
  const end = anim.start + anim.duration;
  // تسامحُ ١e-9 لتمثيلٍ عشريٍّ لا لفرقٍ حقيقيّ — الحدُّ إطارٌ كامل.
  if (cut - anim.start < frame - 1e-9) return null;
  if (end - cut < frame - 1e-9) return null;

  const offset = anim.start - (anim.sourceIn ?? 0);
  const animCut = animTimeAt(anim, cut);
  /** آخرُ إطارٍ يملكه النصفُ الأيسر، بزمن الحركة. */
  const lastLeftFrame = animCut - frame;

  const leftAnim: ElementAnim = { ...anim, duration: cut - anim.start, tracks: { ...anim.tracks } };
  const rightAnim: ElementAnim = { ...anim, start: cut, sourceIn: cut - offset, duration: end - cut, tracks: { ...anim.tracks } };

  // مفتاحُ العتبة **درجةٌ لا منحدر** (`'hold'`). كان `'linear'`، وهو صحيحٌ عند كلّ
  // إطارٍ على الشبكة وكاذبٌ بينهما: ضبابُ الحركة يأخذ عيّناتٍ داخل فترة الإطار
  // (`shutterSampleTimes`)، فكان آخرُ إطارٍ للنصف الأيسر يُرسَم بمتوسّط شفافيّةٍ
  // تهبط إلى الصفر في منتصفه — طيفٌ نصفُ شفّافٍ عند كلّ قطع. والدرجةُ لا قيمةَ
  // وسطى لها، فالإطارُ قبل القطع كاملٌ والذي عنده غائبٌ عند كلّ عيّنة.
  const step = (time: number, value: number): PropertyKeyframe => ({
    id: ctx.newId('kf'),
    time,
    value,
    easing: 'hold',
    bezier: [...EASING_BEZIER.linear] as PropertyKeyframe['bezier'],
  });

  for (const property of ANIM_PROPERTIES as AnimProperty[]) {
    const track = anim.tracks[property];
    // الشفافيّةُ تُعالَج دائمًا، ولو لم يكن لها مسارٌ أصلًا — وسببُ ذلك في
    // الفقرة الطويلة أدناه. **إلّا لمقطعٍ محدود** (`anim.bounded`): نافذةُ الظهور
    // موجودةٌ له فعلًا، فكلُّ نصفٍ يغيب خارج مقطعه بنفسه، وعتبةُ الشفافيّة زائدةٌ
    // تُلوِّث مسارَه وتُعطّل حركاتِ الدخول الجاهزة بلا سبب.
    const needsOpacityStep = property === 'opacity' && !anim.bounded;
    if ((!track || !track.length) && !needsOpacityStep) continue;
    const value = resolvePropertyAt(anim, property, cut);
    const inherited = easingBefore(track, animCut);
    const boundary = (): PropertyKeyframe => ({
      id: ctx.newId('kf'),
      time: animCut,
      value,
      easing: inherited?.easing ?? 'easeOut',
      bezier: (inherited?.bezier ?? [0.42, 0, 0.58, 1]) as PropertyKeyframe['bezier'],
    });
    const before = (track ?? []).filter((k) => k.time < animCut - 1e-9);
    const after = (track ?? []).filter((k) => k.time >= animCut - 1e-9).map((k) => ({ ...k, id: ctx.newId('kf'), bezier: [...k.bezier] as PropertyKeyframe['bezier'] }));

    if (!needsOpacityStep) {
      // يمرّ كلاهما بقُمع الكتابة الواحد (`setKeyframe`)، فإصابةٌ تامّةٌ عند زمن
      // القطع تُستبدَل في موضعها ويُحفَظ `id`/`easing`/`bezier` للمفتاح القائم —
      // ولا يُولَد مفتاحانِ على زمنٍ واحدٍ وأحدُهما لا يُوصَل إليه أبدًا.
      leftAnim.tracks[property] = setKeyframe(before, boundary());
      rightAnim.tracks[property] = setKeyframe(after, boundary());
      continue;
    }

    // ───────────────────────────────────────────────────────────────────────
    // **عتبةُ إطارٍ واحدٍ على الشفافيّة عند القطع — وهذه زيادةٌ على ما نصّت عليه
    // الخطّة، وسببُها مقيس.**
    //
    // نصُّ الخطّة: «كلُّ نصفٍ يَحفظ المفاتيحَ الواقعة في مداه، وتُكتَب القيمةُ
    // المحلولةُ عند القطع مفتاحَ حدٍّ على الجانبين». وذلك وحده **لا يُنتج صورةً
    // واحدة**، لأنّ مدّةَ المقطع في مزيج ليست نافذةَ ظهور: `trackValueAt` تَحجز
    // عند المفتاحَين الطرفيَّين ولا تَستقرئ (المرحلة ١، §4.4)، فعنصرٌ انتهى
    // مقطعُه يَبقى **مرسومًا** بقيمة آخرِ مفتاحٍ له إلى آخر المستند.
    //
    // فيَصير النصفان مرسومَين معًا في كلّ لحظة: نصٌّ فوق نصٍّ بالسلسلة نفسها
    // والمكان نفسه. والقياس: ١٥٠ إطارًا من ١٥٠ تغيّرت بعد تقسيمٍ عند ٢٫٠ث على
    // مقطعِ ٠–٥ث، والمعيار B6 يقول «إطارٌ واحدٌ يتغيّر = تقسيمٌ معطوب».
    //
    // فالعتبةُ هي تمثيلُ «هذا النصفُ ينتهي هنا» في نموذجٍ لا نافذةَ ظهورٍ فيه:
    // الأيسرُ يَحفظ قيمتَه عند آخرِ إطارٍ يملكه ثم يَسقط إلى صفرٍ عند القطع،
    // والأيمنُ صفرٌ عند ذلك الإطار ثم قيمتُه عند القطع. والهبوطُ بين إطارَين
    // متجاورَين، **ولا إطارَ مخرَجٍ يَقع بينهما** — فالصورةُ عند كلّ إطارٍ على
    // شبكة المستند مطابقةٌ للصورة قبل التقسيم بكسلًا بكسلًا، وهو ما يقيسه B6.
    //
    // والبديلُ الوحيد الأنظف — أن يَحجب مدى المقطع ما خارجه — تغييرٌ في معنى
    // `duration` يُخفي كلَّ عنصرٍ في كلّ مستندٍ قائم بعد ٠٫٦ث من بدايته. فهو ليس
    // بديلًا بل مستندٌ آخر.
    //
    // وثمنُه مُعلَن: مسارُ الشفافيّة بعد التقسيم يَحمل أكثر من مفتاحَين، فيصير
    // `hasCustomAnimation` صادقًا على النصفين — وحرسُ النمط الجاهز يَرفض تطبيق
    // حركةِ دخولٍ عليهما بعد ذلك، برسالةٍ مكتوبة. وهذا صحيحٌ في معناه: نصفٌ
    // مقسومٌ حركتُه مُعدَّلةٌ باليد فعلًا.
    const holdValue = resolvePropertyAt(anim, property, cut - frame);
    let leftKeys = (track ?? []).filter((k) => k.time <= lastLeftFrame + 1e-9);
    leftKeys = setKeyframe(leftKeys, step(lastLeftFrame, holdValue));
    leftKeys = setKeyframe(leftKeys, step(animCut, 0));
    leftAnim.tracks[property] = leftKeys;

    let rightKeys = setKeyframe(after, boundary());
    rightKeys = setKeyframe(rightKeys, step(lastLeftFrame, 0));
    rightAnim.tracks[property] = rightKeys;
  }

  const rightId = ctx.newId(el.type);
  const left: DocElement = { ...el, anim: leftAnim } as DocElement;
  const right: DocElement = { ...el, id: rightId, anim: rightAnim } as DocElement;
  // اليمينُ يَلي اليسارَ في ترتيب الطبقات: نصفانِ متجاوران زمنيًّا متجاوران في
  // القائمة، كما يُلصِق `groupSelected` أعضاءَ المجموعة.
  const next = [...elements];
  next.splice(index, 1, left, right);
  return { elements: next, leftId: el.id, rightId };
}

/** أيُمكن التقسيمُ عند هذه اللحظة؟ نفسُ شرطِ `splitAt` بلا بناءِ ناتج — يقرأه
 * السطحُ ليقول **قبل** الضغط إن كان الفعلُ ممكنًا، فلا زرَّ يُضغَط فلا يحدث شيء. */
export function canSplitAt(anim: ElementAnim, t: number, ctx: TrimContext): boolean {
  const frame = frameDuration(ctx.fps);
  const cut = snapToFrame(t, ctx.fps);
  return cut - anim.start >= frame - 1e-9 && anim.start + anim.duration - cut >= frame - 1e-9;
}
