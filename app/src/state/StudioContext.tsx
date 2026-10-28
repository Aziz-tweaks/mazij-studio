import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AR, EN, type Dictionary, type Lang } from '../i18n/strings';
import { CMDS, SIZES, PALETTES, CUSTOM_SIZE_IDX, DEFAULT_FPS, FPS_OPTIONS, TOOL_LIBRARY, sizeAt, nameOf, clamp, defaultTargetsFor, type CommandDef } from '../data/constants';
import {
  LINE_WIDTH_FRACTION,
  MAX_SHAPE_N,
  MIN_SHAPE_N,
  PLACEHOLDER_FILL,
  clickPlacementBox,
  libraryAppearance,
  shapeGeometryFor,
  type ShapeRecipe,
} from '../lib/shapeFactory';
import type { ArtboardDoc, ArtboardMeta, DocSnapshot, ExportResult, FontEntry, HAlign, PanelId, ShapeDrawKind, StudioState, VAlign, Weight } from './types';
import { initialStudioState } from './types';
// اتحادُ ثلاث رحلات مسّت هذا الملف: `newGroupId` من رحلة الحملة (التجميع)،
// و`AnimPreset` من رحلة الفيديو (ربط الحركة بالعنصر المحدَّد)، و`withBaseLayerColor`
// من رحلة البوست (تلوين الشكل عبر كومة المظهر لا عبر الحقل القديم). لا تعارض في
// النيّة — ملفٌّ واحد التقت عليه ثلاثة فروع.
import type { AnimPreset, AnimProperty, AppearanceFillLayer, AppearanceShadowLayer, AppearanceStrokeLayer, DocElement, ElementAnim, ElementId, Geometry, ImageElement, LegacyFractionKeyframe, PropertyKeyframe, PropertyTracks, TextElement, TextStaggerAnim } from './elements';
import { DEFAULT_IMAGE_CROP, DEFAULT_LINE_HEIGHT, animPropertiesFor, cascadeEasingToTracks, defaultAnim, defaultTextStagger, hasCustomAnimation, motionTracks, newArtboardId, newElementId, newGroupId, tracksFromPreset } from './elements';
import { currentAppearance, migrateAppearance, moveLayer, newFillLayer, newShadowLayer, newStrokeLayer, withBaseLayerColor, withBaseStroke, withBaseStrokeHidden, withBaseStrokeWidth } from '../lib/appearance';
import type { Bezier, EasingId } from '../lib/easing';
import { DEFAULT_BEZIER } from '../lib/easing';
import type { PathCmd } from '../lib/pathGeometry';
import type { TraceOptions } from '../lib/imageTrace';
import { DEFAULT_DOC_FPS, animTimeAt, documentDuration, effectiveScale, frameDuration, quantizeKfValue, resolveAnimAt, resolvePropertyAt, setKeyframe, snapToFrame, timelineSpan } from '../lib/animTimeline';
import { moveClip, splitAt, trim } from '../lib/timelineEdit';
import { revealUnitCount, revealValueAt, startedUnitCount } from '../lib/textStagger';
import { fetchAndRegisterFont } from '../lib/loadFont';
import { cssFamilyOf, fontFromBytes, isFontInstalled, loadUserFonts, pickFontFile, registerUserFont, saveUserFonts, type UserFont } from '../lib/fontsStore';
import type { PersistedArtboard, PersistedDoc } from '../lib/persist';
import { listProjects, loadDoc, loadProject, loadedProjectId, markCurrentProject, newProjectId, saveDoc } from '../lib/persist';
import type { SlotFill, Template, TemplateSlot } from '../lib/templates';
import { applyMotionStructure, createTemplate, extractMotionStructure, fillTemplate } from '../lib/templates';
import { loadTemplates, saveTemplates } from '../lib/templatesStore';
import { STARTER_TEMPLATES } from '../lib/starterTemplates';
import type { ReferenceVideoStructure } from '../lib/referenceVideo';
import { buildReferenceVideoTemplate } from '../lib/referenceVideo';
import { renderArtboardPng, renderArtboardSvg } from '../lib/exportArtboard';
import { DEFAULT_SHUTTER_ANGLE } from '../lib/motionBlur';
import { fxSpec, isFxKind, type FxKind } from '../lib/effects';
import { shapeTextOnCurve } from '../lib/textOnPath';
import { justifySvgTextElement } from '../lib/kashidaJustify';
import { LIVE_PHOTO_DEFAULT_DURATION } from '../lib/livePhotoExport';
import { computeBooleanOp, isBooleanEligible, type BooleanOp } from '../lib/pathBoolean';
import { insertAnchorOnSegment } from '../lib/pathSmoothing';
import { magicResizeElements, placeDesignInFrame } from '../lib/magicResize';
import { cloneElements, insertAbove, withDependencies } from '../lib/clipboard';
import { TEXT_PRESETS, type TextPreset } from '../lib/textPresets';
import { saveExportedFile } from '../lib/saveExport';
import { effectiveExportScale } from '../lib/exportEstimate';
import { pickImageFile, readImageFile, type LoadedImage } from '../lib/imageFile';
import { pickLottieFile, readLottieFile, type LoadedLottie } from '../lib/lottieFile';
import { pickVideoFile, readVideoFile, type LoadedVideo } from '../lib/videoFile';
import { pickAudioFile, readAudioFile, type LoadedAudio } from '../lib/audioFile';
import { hasDesktopSidecars } from '../lib/tauriEnv';
import { startMcpBridge, stopMcpBridge } from '../lib/mcpBridge';
import { startMcpServer, stopMcpServer } from '../lib/mcpServerControl';
import { interpretAndRun } from '../lib/commandInterpreter';
import { agentSystemPrompt, cancelAgent, detectAgents, loadAiPrefs, runAgent, saveAiPrefs, type AiEngine } from '../lib/agentClient';
import { saveUiPrefs } from '../lib/uiPrefs';
import { BACKGROUND_ID, backgroundLayer, decorLayer, type McpCtx } from '../lib/mcpTools';
import { describeAiError, providerById } from '../lib/aiProviders';
import { loadApiKey } from '../lib/aiKeyStore';
import { LLM_PROVIDERS, loadModel, runLlm } from '../lib/llmAgent';

/** Switches one clip to an entrance preset **and rebuilds its property tracks** from
 * it, which is the half that used to be missing: `tracks` is the only thing
 * `resolveAnimAt` (and therefore the canvas preview, the DOM preview and every
 * exported video frame) ever reads, so writing `preset` without it changes a label
 * and nothing else.
 *
 * `keyframes` is the legacy 0→1 progress pair `tracksFromPreset` maps through; a clip
 * that somehow lost it (fewer than the two endpoints a preset needs) is reseeded from
 * `defaultAnim` rather than silently producing a one-keyframe, frozen track.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **والحرسُ أدناه هو إصلاحُ عطلٍ لم يكن أحدٌ يَزعم أنه مُختبَر.**
 *
 * `tracksFromPreset` تُعيد بناءَ `tracks` **كلّها** من زوج `keyframes` القديم، فمسارُ
 * `x` أو `rotation` بُني باليد كان يُباد بلا تحذيرٍ ولا تراجعٍ معلَن: نقرةٌ واحدة
 * على «تلاشٍ» تُزيل عملَ ربع ساعة. وكانت `hasCustomAnimation` موجودةً فعلًا
 * ومُستهلِكها **تلوينُ أيقونةِ ساعةٍ وحده**.
 *
 * وورقةُ محرّك حركةٍ مفتوح §9 تقول صريحةً إنها لا تدري أهذا مُختبَرٌ أم معروفٌ مقبولٌ أم
 * غيرُ ملحوظ، ولا ترويسةَ مواصفةٍ تَزعمه — فيُعامَل **غيرَ ملحوظ** (§10.8).
 *
 * والحرسُ **رفضٌ معلَن لا صمت**: متى كانت المساراتُ مبنيّةً باليد تُعاد `anim` كما
 * هي، ويُعلن السطحُ السببَ **قبل** الضغط — أزرارُ النمط معطَّلةٌ وتلميحُها يقول
 * لماذا (`AnimPresetMenu`، والقاعدةُ نفسُها التي تَجعل المؤشّرةَ `not-allowed` على
 * حافّةِ عنصرٍ مقفول). وهذا هو أدنى ما تطلبه الخطّة؛ وأعلاه — «يُضيف النمطُ مفاتيحَ
 * عند المؤشّر» (محرّك حركةٍ مفتوح §7.4، `crates/engine/commands/anim_presets.rs:1-11`) —
 * يَحتاج صيغةَ نمطٍ `[seconds, value]` نسبةً إلى المؤشّر، وهي المرحلة ٤، ولا تُشحَن
 * نصفًا. */
function withPreset(anim: ElementAnim, preset: AnimPreset): ElementAnim {
  // **«الظهور» ليس حركةَ الصندوق.** توقيتُ الكلمات مع الصوت يبقى كما هو تحت أيّ نمطٍ
  // يُطبَّق على الصندوق كلِّه، ولا يجعل النصَّ «مبنيًّا باليد» فيُرفَض النمط: الحرسُ يسأل
  // عن مسارات الحركة وحدها، والنمطُ يُعيد بناءها وحدها.
  const reveal = anim.tracks.reveal;
  if (hasCustomAnimation(motionTracks(anim.tracks))) return anim;
  const keyframes = anim.keyframes.length >= 2 ? anim.keyframes : defaultAnim(preset, anim.start, anim.duration, anim.easing).keyframes;
  const tracks = tracksFromPreset(preset, keyframes, anim.easing, anim.bezier, anim.duration);
  return { ...anim, preset, keyframes, tracks: reveal ? { ...tracks, reveal } : tracks };
}

/** مفتاحٌ واحد من مستندٍ محفوظ، مرحَّلًا إن كان قديمًا.
 *
 * **والمُميِّزُ هو وجودُ الحقل لا قيمتُه، وهذا هو بيتُ القصيد في المرحلة كلّها.**
 * الكسر `0.3` والثانية `0.3` رقمان لا يفترقان — فلا ترحيلَ قائمًا على القيمة يمكن
 * أن يكون آمنًا، ولم يكن في `PersistedDoc` رقمُ نسخةٍ يُفرِّق. ولذلك أُعيد تسميةُ
 * الحقل `t` → `time`: مفتاحٌ يحمل `time` جديدٌ فيُترك كما هو، ومفتاحٌ يحمل `t`
 * ولا `time` قديمٌ فيُحوَّل — **ولا حالةَ لبسٍ أبدًا**، ولا في مستندٍ حفظه بناءٌ في
 * منتصف الإصدار، ولا في مستندٍ مرّ على بناءٍ أقدم ثم رجع.
 *
 * والتحويلُ `time = sourceIn + t × duration`: تامٌّ، ومرّةٌ واحدة، وعكسُه ممكنٌ فعلًا
 * لأنّ `duration` في السجلّ نفسه.
 *
 * ولا يقرأ هذا الكود النسخةَ ليقرّر: النسخةُ (`persist.ts`) تحمي من **الأحدث**،
 * وهذا يحمي من **الأقدم**، وهما حاجتان مختلفتان. انظر `DOC_MIGRATIONS` هناك. */
function migrateKeyframe(k: PropertyKeyframe | LegacyFractionKeyframe, sourceIn: number, duration: number): PropertyKeyframe {
  if (typeof (k as PropertyKeyframe).time === 'number') return k as PropertyKeyframe;
  const legacy = k as LegacyFractionKeyframe;
  return {
    id: legacy.id,
    time: sourceIn + legacy.t * duration,
    value: legacy.value,
    easing: legacy.easing,
    bezier: legacy.bezier,
  };
}

function migrateTracks(tracks: PropertyTracks, sourceIn: number, duration: number): PropertyTracks {
  const next: PropertyTracks = {};
  for (const [prop, track] of Object.entries(tracks) as [AnimProperty, PropertyKeyframe[] | undefined][]) {
    if (track) next[prop] = track.map((k) => migrateKeyframe(k, sourceIn, duration));
  }
  return next;
}

/** Documents saved before independent per-property tracks existed carry an `anim`
 * with only the legacy single `keyframes` track (or no `anim` at all). Synthesizes
 * `tracks` from the legacy preset/keyframes/easing so these load and render
 * pixel-identical to before — see `tracksFromPreset` for the exact per-preset
 * mapping.
 *
 * ويُرحِّل أيضًا زمنَ المفتاح من كسرٍ إلى ثوانٍ، ويُكمِل `sourceIn` بصفر — وهو
 * موضعُ الترحيل الصحيح لأنّ هذه الدالّة تمرّ **على كلّ عنصرٍ في كلّ تحميل** عبر
 * `normalizeDoc`، فلا بابَ خلفيًّا يتسلّل منه مستندٌ غير مرحَّل. */
function migrateAnim(anim: ElementAnim | undefined): ElementAnim {
  const a = anim ?? defaultAnim('none', 0, 0.6);
  // مستندٌ محفوظ قبل أن يوجد `sourceIn` لم يُقلَّم قطُّ — فأصلُ زمنه بدايتُه، أي صفر.
  const sourceIn = typeof a.sourceIn === 'number' ? a.sourceIn : 0;
  if (a.tracks && Object.keys(a.tracks).length) {
    return { ...a, sourceIn, tracks: migrateTracks(a.tracks, sourceIn, a.duration) };
  }
  return { ...a, sourceIn, tracks: tracksFromPreset(a.preset, a.keyframes, a.easing, a.bezier, a.duration) };
}

/** Documents saved before the char/word/line text-stagger layer (roadmap #6) existed
 * have no `textAnim` on their text elements at all — default it to disabled so an old
 * document renders pixel-identical to before (the stagger layer is purely additive on
 * top of `anim.tracks`, never a replacement for it). */
function migrateTextAnim(textAnim: TextStaggerAnim | undefined): TextStaggerAnim {
  return textAnim ?? defaultTextStagger();
}

/** Loaded docs may predate the per-element `anim` field (or the custom-size fields) —
 * normalize defensively so an old autosave never crashes the interpolation math. */
function normalizeDoc(doc: DocSnapshot): DocSnapshot {
  return {
    ...doc,
    customW: doc.customW || 1080,
    customH: doc.customH || 1080,
    // مستندٌ محفوظٌ قبل أن تصير الزخرفة حقلًا (١٨ أكتوبر ٢٠٢٦) لا يحمل الحقل،
    // والقاعدة القديمة كانت «دائرةٌ متى كان المستند غير فارغ». فنُعيد تلك القاعدة
    // نفسها عند الترحيل بدل أن نفرض `false`: الملف المحفوظ يُفتَح بالصورة التي
    // حُفِظ بها بالضبط — «ترحيل بلا فقد» — ومن بعدها يصير المفتاح هو المرجع
    // الوحيد، فلا تبقى قاعدتان تتنازعان الجواب.
    decorAccent: doc.decorAccent ?? doc.elements.length > 0,
    // ٣٠ إطارًا لكل مستندٍ محفوظٍ قبل أن يصير المعدّل حقلًا — وهو ما كان
    // `FRAME = 1/30` المثبَّت يفترضه عليه ضمنًا، فالمستند يُفتَح بالصورة التي
    // حُفِظ بها بالضبط.
    fps: doc.fps ?? DEFAULT_DOC_FPS,
    // والطبيعةُ تُشتَقّ من الوجهة إن غابت — لا تُخمَّن ولا تُسأل من جديد. الوجهةُ
    // هي التي تحملها أصلًا (`SizePreset.kind`)، فهذا السطر يستكمل ذاكرةَ جوابٍ
    // موجودٍ سلفًا في المستند، لا يختلق جوابًا ثانيًا.
    medium: doc.medium ?? sizeAt(doc.sizeIdx, doc.customW || 1080, doc.customH || 1080).kind,
    elements: doc.elements.map((e) => ({
      ...e,
      anim: migrateAnim(e.anim),
      // Roadmap #17 — eagerly materializes a real one-layer-per-category appearance
      // stack for any document saved before this roadmap item (or missing it for any
      // other reason), from this same element's legacy fill/stroke/color fields — see
      // `migrateAppearance`'s doc comment for the full "ترحيل بلا فقد" contract.
      appearance: migrateAppearance(e),
      ...(e.type === 'text' ? { textAnim: migrateTextAnim(e.textAnim), pathId: e.pathId ?? null } : {}),
      ...(e.type === 'lottie' ? { loop: e.loop ?? true } : {}),
      ...(e.type === 'video' ? { loop: e.loop ?? false, volume: e.volume ?? 1, muted: e.muted ?? false } : {}),
      ...(e.type === 'audio' ? { volume: e.volume ?? 1, muted: e.muted ?? false } : {}),
      ...(e.type === 'fx' ? { fx: isFxKind(e.fx) ? e.fx : 'bw', amount: clamp(Number.isFinite(e.amount) ? e.amount : 1, 0, 1), fadeIn: Math.max(0, e.fadeIn ?? 0), fadeOut: Math.max(0, e.fadeOut ?? 0) } : {}),
    })),
  };
}

/** يوسّع قائمة معرّفاتٍ محدَّدة لتشمل كل أعضاء أي مجموعةٍ لمسها التحديد.
 *
 * هذا **كل** ما تعنيه المجموعة في مستندٍ مسطّح: نقرةٌ على عضوٍ تحدّد إخوته، فيتحرّك
 * اللوكاب ويُقفَل ويُخفى ويُحاذى كوحدة. ووضعُها هنا — في `selectMany`/`selectElement`
 * لا في `Stage` — مقصود: كل مسارات التحديد (اللوحة، قائمة الطبقات، مفسّر الأوامر،
 * MCP) تمرّ بهما، فلا يوجد بابٌ خلفيّ يحدّد نصف مجموعة.
 *
 * الترتيب محفوظ والنتيجة بلا تكرار، والعنصر الحرّ يمرّ كما هو. */
function expandGroups(ids: ElementId[], elements: DocElement[]): ElementId[] {
  const groups = new Set<string>();
  for (const id of ids) {
    const el = elements.find((e) => e.id === id);
    if (el?.groupId) groups.add(el.groupId);
  }
  if (!groups.size) return ids;
  const out: ElementId[] = [];
  const seen = new Set<ElementId>();
  const push = (id: ElementId) => {
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  };
  for (const id of ids) {
    const el = elements.find((e) => e.id === id);
    if (el?.groupId) elements.filter((e) => e.groupId === el.groupId).forEach((e) => push(e.id));
    else push(id);
  }
  return out;
}

/** Per-property sane range for a track keyframe's stored delta/multiplier (see
 * `ElementAnim.tracks` in `elements.ts` for what each property's value means):
 * opacity is a 0..1 multiplier, x/y are offsets as a fraction of artboard width
 * (±2 lets an element swing fully off-canvas and back for a slide-in/out), scale and
 * its two per-axis companions are non-negative multipliers, rotation is an
 * unrestricted delta in degrees.
 *
 * و`scaleX`/`scaleY` يَلزمان حدَّ `scale` نفسَه لأنهما الكمّيةُ نفسُها على محورٍ
 * واحد: معاملٌ غيرُ سالبٍ بلا سقف. والسالبُ ليس «قلبًا للمقياس» بل **انعكاسًا**،
 * وللانعكاس بابُه المُعلَن (`flipH`/`flipV`)، فلا يُفتَح له بابٌ ثانٍ صامتٌ من
 * مِمسحةِ مفتاح. */
function clampAnimPropertyValue(property: AnimProperty, v: number): number {
  switch (property) {
    case 'opacity':
      return clamp(v, 0, 1);
    case 'x':
    case 'y':
      return clamp(v, -2, 2);
    case 'scale':
    case 'scaleX':
    case 'scaleY':
      return Math.max(0, v);
    // **والضبابيّةُ فرقٌ يُجمَع، فالسالبُ فيها مشروعٌ لا خطأ** — وهو الطريقُ
    // الوحيدُ إلى «ابدأ مُضبَّبًا وانتهِ حادًّا» على عنصرٍ ضبابيّتُه الساكنةُ
    // موجبة. والذي يُقصَر عند الصفر هو **المجموعُ** في `effectiveBlur` لا المفتاحُ
    // هنا؛ ولو قُصِر المفتاحُ لاستحال الإحدادُ بالحركة أصلًا. والمدى ±١ أي عرضُ
    // اللوح كلُّه: سخيٌّ ومحدود، كما ±٢ لـ`x`/`y`.
    case 'blur':
      return clamp(v, -1, 1);
    case 'rotation':
      return v;
    // كسرانِ من طول الحدّ — ما وراء الطرفين لا معنى له.
    case 'trimStart':
    case 'trimEnd':
      return clamp(v, 0, 1);
    // عددُ الوحدات التي بدأت: لا سالبَ له. وحدُّه الأعلى عددُ وحدات النصّ، وهو يتغيّر مع
    // كلّ تعديلٍ للنصّ — فلا يُقصَر هنا بل عند القراءة (قيمةٌ أكبر = الكلُّ ظاهر).
    case 'reveal':
      return Math.max(0, v);
  }
}

/** **قُمعُ قيمةِ المفتاح: موضعٌ واحدٌ تُقصَر فيه القيمةُ على الشبكة ثم على المدى.**
 *
 * ولِمَ دالّةٌ لا سطرانِ مُكرَّران: السطحانِ اللذان يَكتبان قيمةَ مفتاحٍ — المِمسحةُ
 * والحقلُ الرقميُّ في منبثقة الخطّ الزمنيّ — يَصِلان إلى الحالة من بابَين
 * (`liveUpdateTrackKeyframeValue` أثناء الإيماءة و`setTrackKeyframeValue` خارجَها)،
 * فلو حَمل كلُّ بابٍ حسابَه لَجاز أن يَفترقا. وهذا المستودعُ عُضَّ بذلك مرّتين:
 * افتراقُ كسرِ السطر بين اللوحة والتصدير، وقراءتا المركز في المعاير. فالقاعدةُ
 * المستفادةُ مكتوبةٌ هنا بنيويًّا: **سؤالٌ واحدٌ، جوابٌ واحد.**
 *
 * والترتيبُ مقصود: الشبكةُ أوّلًا ثم المدى. حدودُ `clampAnimPropertyValue` كلُّها
 * واقعةٌ على الشبكة (±٢، ±١، ٠)، فقَصْرُ قيمةٍ مُشبَّكةٍ عليها يُبقيها مُشبَّكة —
 * والعكسُ لا يَصحّ دائمًا. */
function writeKeyframeValue(els: DocElement[], id: ElementId, property: AnimProperty, kfId: string, value: number): DocElement[] {
  const next = clampAnimPropertyValue(property, quantizeKfValue(property, value));
  return els.map((e) => {
    if (e.id !== id || !e.anim.tracks[property]) return e;
    const track = e.anim.tracks[property]!.map((k) => (k.id === kfId ? { ...k, value: next } : k));
    return { ...e, anim: { ...e.anim, tracks: { ...e.anim.tracks, [property]: track } } };
  });
}

/** الأمرُ الذي لا يصحّ على المستند الحاضر لا يُعرض (`when`): «تتبّع الصورة» بلا صورةٍ
 * أمرٌ يُختار فلا يحدث شيء — صمتٌ يشبه العطل. */
function visibleCmds(query: string, s: Pick<StudioState, 'elements' | 'selectedIds'>) {
  const q = query.trim().toLowerCase();
  const usable = CMDS.filter((c) => !c.when || c.when(s));
  if (!q) return usable;
  return usable.filter((c) => c.ar.includes(q) || c.en.toLowerCase().includes(q));
}

/** تحديدُ عنصر قائم ينقل المصمم من **الإدراج** إلى **التحرير**، فيرتدّ اللوح من
 * المكتبة إلى «التصميم» ليجد خصائص ما حدّده أمامه.
 *
 * وهذا ليس تجميلًا: بدونه يبقى لوح المكتبة معروضًا بعد أن يلمس المصمم اللوحة. وقد
 * كشفه `qa/image-editing.spec.mjs` فعلًا — سحبةٌ قُصد بها رسم شكل هبطت على شكل قائم
 * في الموضع نفسه فحرّكته بدل أن ترسم، فلم يُنادَ `addShapeElement`، فلم يرتدّ
 * اللوح، فغاب قسم «قص بالشكل» عن لوحٍ لم يكن معروضًا أصلًا.
 *
 * والقيد على `'library'` وحده مقصود: «المكتبة» و«المساعد» يفتحهما المصمم صراحةً
 * لمهمّة مستمرّة (تحميل خطّ، محادثة)، فليس من حقّ نقرةٍ على اللوحة أن تُغلقها.
 * أمّا لوح المكتبة فغرضه الإدراج، وقد انتهى. وهو ما يقيسه محرّر فيديو شائع كذلك: مفتّش
 * مربوط بالتحديد (`re-capcut-flows.md` §3.7، §5.4). */
function leaveInsertLibrary(s: StudioState): { panel?: PanelId } {
  return s.panel === 'library' ? { panel: 'props' } : {};
}

/** مستندٌ رجع ساكنًا بالتراجع (تراجعٌ عن «حرّك» مثلًا) لا يبقى يُشغَّل، ولا يبقى عند
 * لحظةٍ قبل اكتمال الدخول — الساكن يُعرض ويُصدَّر عند لحظة الاستقرار دائمًا. */
function stillSettled(doc: DocSnapshot): Partial<StudioState> {
  if (doc.medium === 'timed') return {};
  return { playing: false, t: settledTime(doc.elements, doc.fps ?? DEFAULT_DOC_FPS) };
}

function docOf(s: StudioState): DocSnapshot {
  return { elements: s.elements, anim: s.anim, sizeIdx: s.sizeIdx, customW: s.customW, customH: s.customH, decorAccent: s.decorAccent, fps: s.fps, medium: s.medium };
}

/** **قاعدةُ التراجع، مكتوبةً في الكود سطرًا واحدًا** (فكرةٌ من محرّر خطٍّ زمنيٍّ مفتوح،
 * `crates/engine/src/keyboard.rs:33-34`):
 *
 * > التنقّلُ والتحديدُ والمؤشّرُ الزمنيُّ لا تُسجَّل؛ وكلُّ ما يُغيّر المستند خطوةٌ
 * > واحدةٌ مُسمّاة.
 *
 * وهذه الدالّةُ هي الموضعُ الوحيد الذي تُدفَع فيه خطوة، فالثلاثُ الحقائق —
 * اللقطةُ واسمُها وإبطالُ المستقبل — تُكتَب معًا أو لا تُكتَب. ومن مرّ من هنا
 * بلا اسمٍ تبقى خطوتُه مجهولةَ الاسم صريحًا (`''`)، فيعود تلميحُ الزرّ إلى
 * «تراجع» العامّة — ولا اسمٌ مُختلَق. */
function pushHistory(s: StudioState, label = ''): Pick<StudioState, 'historyPast' | 'historyLabels' | 'historyFuture' | 'historyFutureLabels' | 'dirty'> {
  return {
    historyPast: [...s.historyPast, docOf(s)],
    historyLabels: [...s.historyLabels, label],
    historyFuture: [],
    historyFutureLabels: [],
    dirty: true,
  };
}

/** **إعدادٌ تغيّر بعد التصدير = تصديرٌ لم يحدث بعد.**
 *
 * كُشف في اختبار المطابقة الثاني على البرنامج المثبّت: صُدِّر PNG، ثم اختير SVG
 * لكتابة الملف نفسه بصيغةٍ ثانية — فبقي الحوار على «✓ تم التصدير» و«فتح المجلد»
 * بلا زرّ تصدير، والطريقُ الوحيد إلى الملف الثاني إغلاقُ الحوار وفتحُه من جديد.
 * «تم» وصفٌ لإعداداتٍ لم تعد هي المعروضة؛ فأيُّ إعدادٍ يتغيّر يُرجع الحوار إلى
 * «جاهز» (`idle`) فيعود زرّ التصدير. وكذلك «غير متاح» و«خطأ»: رسالتاهما عن صيغةٍ
 * أو محاولةٍ سابقة، لا عمّا اختير الآن.
 *
 * والنتائج تبقى معروضة (`exportResults`): هي سجلُّ ما كُتب فعلًا، ومنها زرّ «أضف إلى
 * الصور» للصورة الحيّة — والتصدير التالي يستبدلها لحظة يبدأ. و«جارٍ» لا يُمَسّ. */
function exportSettingChanged(s: StudioState, p: Partial<StudioState>): Partial<StudioState> {
  return s.exportState === 'idle' || s.exportState === 'busy' ? p : { ...p, exportState: 'idle', exportError: null };
}

/** يُثبِّت مسودّةَ القلم عنصرَ مسارٍ في المستند بخطوةِ تراجعٍ واحدة — أو يمسحها
 * إن لم تكن مسارًا بعد (أقلّ من نقطتين).
 *
 * **لماذا صارت دالّةً مستقلّة.** كان هذا الجسمُ كلُّه داخل `penFinish` وحدها،
 * فكان الموضعُ الوحيدُ الذي يُثبِّت مسودّةً هو ذاك — ومغادرةُ الأداة تَمسح
 * (`penDraft: []`) بلا خطوةِ تراجعٍ تُعيد ما مُسِح. فمن وضع ثلاثَ نقاطٍ ثم ضغط
 * `V` فقد الثلاث، ولا `⌘Z` يُرجعها: أكلها البرنامجُ أكلًا صامتًا.
 *
 * **والقاعدةُ المُقتبَسة** من `vectorcraft/crates/tools/src/pen.rs:355-366`
 * (`deactivate`)، وتعليقُها الحاكمُ على `:360` بالحرف:
 * «Finish the preview as it stands; clearing state alone leaves its transaction
 * open.» — أي: **المغادرةُ تَختم العملَ ولا تُلقيه**، وعقدُ `switch_tool`
 * (`crates/engine/src/tooling.rs:84-97`) معقودٌ كلُّه على أمانة الأداة في
 * `deactivate`. والفكرةُ مأخوذةٌ والآليةُ مكتوبةٌ من جديد؛ لا سطرَ منسوخ.
 *
 * **ولا تُسمّي الأداةَ الجديدة.** `penFinish` تُرجع إلى «تحديد» بعد الإثبات،
 * أمّا مسارُ تسليحِ أداةٍ أخرى فالوجهةُ عنده هي الأداةُ التي ضُغطت — فلو ثبَّتت
 * هذه الدالّةُ `tool: 'select'` في جسمها لَسحبت القلمَ من يد من ضغط «نص».
 * وهذا هو نفسُ ما يفعله المصدر: `deactivate` **لا تعرف إلى أين يُنتقَل** —
 * توقيعُها بلا مُعامل `to` (`crates/tools/src/lib.rs:577`).
 *
 * **والعلّةُ التي كان المسحُ يتحاشاها لا تعود.** التعليقُ عند `setTool` أدناه
 * يقول إنّ المسودّةَ المهجورةَ «تندمج نقاطُها في أوّل مسارٍ جديد» — وهي علّةٌ
 * صحيحة، وعلاجُها عند المصدر `Commit` لا `clear`. والإثباتُ يُفرِغ `penDraft`
 * كما يُفرِغه المسح، فالاندماجُ ممتنعٌ بحكم البناء؛ والفرقُ أنّ ما خرج من
 * المسودّة صار عنصرًا في المستند بخطوةٍ تُعيده، لا عدمًا. */
function commitPenDraft(s: StudioState, forceClosed?: boolean): StudioState {
  const pts = s.penDraft;
  if (pts.length < 2) return { ...s, penDraft: [] };
  const closed = forceClosed ?? s.penClosePath;
  // الصندوق المحيط يُحسَب على نقاط الربط **ونهايات مقابضها** معًا: هيكل نقاط
  // التحكّم المحدّب يحوي المنحنى كله، فصندوق كهذا يحوي ما يراه المصمم فعلًا
  // لا المضلّع وحده. وبدون ذلك يصير صندوق منحنى على ثلاث نقاط على استقامة
  // واحدة بارتفاع بكسل واحد (`Math.max(..., 1)`)، فتخرج الكسور بأرقام بمئات
  // الأضعاف ويصبح تحجيم العنصر بالمقابض غير متوقّع بالمرّة.
  // التوسيع محايد هندسيًا تمامًا: ما دام كلٌّ من النقاط والمقابض يُقسَّم على
  // أبعاد الصندوق النهائية نفسها، فموضع كل شيء بالبكسل يبقى كما هو بالحرف.
  const hullX = pts.flatMap((p) => (p.h ? [p.x, p.x + p.h.x, p.x - p.h.x] : [p.x]));
  const hullY = pts.flatMap((p) => (p.h ? [p.y, p.y + p.h.y, p.y - p.h.y] : [p.y]));
  const minX = Math.min(...hullX);
  const minY = Math.min(...hullY);
  const w = Math.max(Math.max(...hullX) - minX, 1);
  const h = Math.max(Math.max(...hullY) - minY, 1);
  const size = sizeAt(s.sizeIdx, s.customW, s.customH);
  const normalized = pts.map((p) => ({ x: (p.x - minX) / w, y: (p.y - minY) / h }));
  const anyHandle = pts.some((p) => p.h);
  const handles = anyHandle
    ? pts.map((p) => (p.h ? { out: { x: p.h.x / w, y: p.h.y / h }, in: { x: -p.h.x / w, y: -p.h.y / h } } : null))
    : undefined;
  const id = newElementId('path');
  const el: DocElement = {
    id,
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 100,
    maskId: null,
    geo: { x: minX / size.w, y: minY / size.h, w: w / size.w, h: h / size.h, rotation: 0 },
    shape: 'path',
    fill: closed ? null : 'transparent',
    fillToken: 'ac',
    stroke: null,
    strokeWidth: 4,
    radius: 0,
    points: normalized,
    closed,
    ...(handles ? { handles } : {}),
    anim: defaultAnim('none', 0, 0.6),
  };
  return {
    ...s,
    elements: [...s.elements, el],
    penDraft: [],
    selectedIds: [id],
    sel: id,
    ...pushHistory(s),
  };
}

/** **المُوَدِّعُ الواحد: تسليحُ أداةٍ يَختم عملَ المُغادِرة ثم يُنزع التحديد.**
 *
 * هذا هو الموضعُ الوحيدُ الذي تُسلَّح فيه أداة، ويَعبُره الشريطُ والاختصارُ
 * بحرفٍ واحدٍ ولوحةُ الأوامر جميعًا — وهو مقصودٌ بناءً على أقوى سطرٍ في ورقة
 * الاستطلاع: **لا جدولَ انتقالاتٍ من كلّ أداةٍ إلى كلّ أداة، بل مُوَدِّعٌ واحدٌ
 * لا يسأل عن الوجهة** (`vectorcraft/crates/engine/src/tooling.rs:84-97`
 * و`crates/tools/src/lib.rs:577`). الجدولُ يَفسد عند الأداة التاسعة؛ والمُوَدِّعُ
 * لا يَفسد.
 *
 * وثلاثةُ أفعالٍ بالترتيب، والترتيبُ هو القاعدة:
 *
 * ١. **العملُ المُعلَّق يُثبَّت** — `commitPenDraft` أعلاه. قبل الهدم، لا بعده.
 * ٢. **أوضاعُ التحرير تُهدَم** — `nodeEditId`/`nodeEditSel`. والسببُ مكتوبٌ عند
 *    `setTool` أدناه: المقابضُ المرسومةُ على اللوحة لا معنى لها مع أداةٍ أخرى.
 * ٣. **والتحديدُ يُنزَع عن كلّ شيء** — وهذا قرارُ المالك صريحًا، وهو **خلافُ**
 *    ما يفعله المصدر: `switch_tool` هناك لا تَمسّ التحديد، ولا تستطيع، لأن
 *    التحديدَ يسكن في `DocState` والأدواتُ تَراه قراءةً فقط
 *    (`crates/tools/src/lib.rs:224`). فهذا سطرُنا لا سطرُهم، ويُعلَن كذلك.
 *
 * **والثلاثةُ مشروطةٌ بتغيُّرٍ فعليٍّ في الأداة** — `s.tool !== tool`. وقاعدةُ
 * «إعادةُ ضغطِ الأداة نفسِها لا تفعل شيئًا» مأخوذةٌ من `tooling.rs:86-88`، وهناك
 * **عودةٌ مبكّرةٌ صريحة** قبل التوديع: `if self.tool.id() == id { return Ok(()) }`.
 *
 * **وقد جُرِّب النزعُ غيرَ مشروط أوّلًا، ونُقض بالقياس — والقياسُ مُسمًّى.**
 * الحرفُ الظاهرُ لأمر المالك («تسليحُ أيّ أداةٍ») يحتمل أن تَنزع الضغطةُ على
 * الأداة **المسلَّحة أصلًا** التحديدَ كذلك. فبُنيَ كذلك، فسقط
 * `qa/appearance-stack.spec.mjs:180`: يرسم الاختبارُ شكلًا بالسحب ثم يضغط زرَّ
 * «تحديد» — وهو مسلَّحٌ أصلًا بحكم الارتداد — فيفقد الشكلَ المرسومَ لتوّه،
 * فيَخلو محرّرُ الطبقات فلا يجد `appearance-fill-…` صفًّا واحدًا. وذلك ليس عطلًا
 * في الاختبار بل **إعلانٌ عن سلوكٍ أسوأ ممّا يُصلحه**: يحدّد المصمّمُ شكلًا، ثم
 * يضغط زرَّ «تحديد» — وهي إيماءةٌ بلا معنًى يفعلها الناسُ كلَّ يوم — فيفقد
 * تحديدَه بلا سببٍ يراه. وهو الضررُ نفسُه الذي يحرسه `keepSelection` في
 * الارتداد، داخلًا من بابٍ آخر.
 *
 * **وقرارُ المالك قائمٌ بحرفه حيث له معنًى:** كلُّ **تبديلٍ** لأداةٍ يَنزع
 * التحديدَ عن كلّ شيء — وهو ما وصفه («أضغط زرّ القلم فينلغي التحديد»)، فالضغطُ
 * على أداةٍ غيرِ المسلَّحة تبديلٌ دائمًا. والضغطةُ على المسلَّحة ليست تسليحًا بل
 * لا شيء، ولا شيءَ لا يَنزع شيئًا.
 *
 * **و`keepSelection` بابٌ واحدٌ مُعلَن، لقدرةٍ كان النزعُ سيقتلها.** انظر
 * `Stage.tsx` عند الخمسة مواضع التي تُناديه. */
function armTool(s: StudioState, tool: StudioState['tool'], opts?: { keepSelection?: boolean }): StudioState {
  if (s.tool === tool) return s;
  return {
    ...commitPenDraft(s),
    tool,
    nodeEditId: null,
    nodeEditSel: null,
    ...(opts?.keepSelection ? {} : { selectedIds: [], sel: null }),
  };
}

/** تبديلُ مقاسٍ، ومعه إعادةُ اشتقاق الطبيعة.
 *
 * دالّةٌ واحدة يمرّ بها كلُّ مسارِ تبديلٍ (`setSizeIdx`، `cycleSize`،
 * `setCustomSize`، «التحجيم الذكي»)، فلا يبقى بابٌ يُبدِّل المقاس ويُخلِّف
 * `medium` يقول شيئًا آخر. وهذا هو الردُّ العمليّ على الاعتراض المكتوب في
 * `src/data/constants.ts` على وجود الحقل في المستند: الحقلُ لا يُنازع المقاس
 * لأنه لا يُكتَب إلا منه.
 *
 * **والمقاسُ المخصّص حالةٌ خاصّة، وهي حالةٌ وجدناها بالقياس.** `sizeAt` تُعيد
 * للمخصّص `kind: 'still'` بتعليقٍ مكتوبٍ يقول إنّ المستخدم «كتب رقمَين ولم
 * يُسمِّ وجهة»، وإنّ ذلك **ليس حصرًا** لأنّ «الخطّ الزمني متاح دائمًا».
 * والشطرُ الأخير صار كاذبًا في اللحظة التي صار فيها `medium` حاملَ حِمل: من كتب
 * ١٠٨٠×١٩٢٠ بيده على مقطعٍ قائم كان سيَفقد خطَّه الزمنيَّ بلا أيّ إعلان.
 *
 * فالمخصّصُ **يُبقي الجوابَ القائم** ولا يَفرض `still`: المستخدم بدَّل أبعادًا لا
 * وجهةً، فطبيعةُ المستند لا تتغيّر بذلك. ومن أرادها أن تتغيّر اختار وجهةً
 * مُسمّاةً، وهي تقلبها في اللحظة. (ومستندٌ **جديد** بمقاسٍ مخصّص لا جوابَ سابقَ
 * له، فهو `still` كما تقول `sizeAt` — انظر `startBlankCustom`.) */
function withDerivedMedium(s: StudioState, sizeIdx: number, customW: number, customH: number): Pick<DocSnapshot, 'sizeIdx' | 'customW' | 'customH' | 'medium'> & { t?: number } {
  const medium = sizeIdx === CUSTOM_SIZE_IDX ? s.medium : sizeAt(sizeIdx, customW, customH).kind;
  const next = { sizeIdx, customW, customH, medium };
  // **ومستندٌ صار ساكنًا يُسكَّن مؤشّرُه عند لحظة الاستقرار.**
  //
  // المسطرةُ والمؤشّرُ وشريطُ التشغيل تَغيب كلُّها عن الساكن، فالمؤشّرُ يَبقى
  // حيث تركه المصمّمُ على المسطرة وقد زالت المسطرة — ولا سطحَ في البرنامج
  // يُعيده. فمَن أوقفه عند لحظةٍ قبل الاستقرار ثم بدّل الوجهة يَجد عناصرَه
  // نصفَ داخلةٍ أو غائبةً، بلا مَخرج.
  //
  // ولحظةُ الساكن معروفةٌ ومكتوبةٌ سلفًا: `renderArtboardPng` تُصدِّره عند
  // `settledTimeOf(spec)`، وهي هذه بعينها. فيَتّفق ما يُرى وما يُكتَب.
  //
  // والشرطُ بـ`!==` كما هو في `splitAtPlayhead` أعلاه: التفرّعُ بـ`===` سطحُ
  // واجهةٍ محصورٌ في ثلاثة ملفّاتٍ يَحرسها `qa/phase1-representation.spec.mjs`
  // (A8)، وهذا حرسُ نموذجٍ لا سطحَ واجهة.
  if (medium !== 'timed') return { ...next, t: settledTime(s.elements, s.fps ?? DEFAULT_DOC_FPS) };
  return next;
}

function defaultArtboardName(n: number, lang: StudioState['lang']): string {
  return lang === 'ar' ? `لوحة ${n}` : `Artboard ${n}`;
}

/** Roadmap #16 — every artboard's id/name/palette + its full doc, in display
 * order: the active one's doc comes from the top-level state fields, every other
 * one from `artboardDocs` — the two places an artboard's content can live (see
 * `ArtboardDoc`). Undo history is deliberately left out, same as `saveDoc` always
 * did pre-multi-artboard. Used by both autosave and "export all artboards". */
function allArtboardEntries(s: StudioState): PersistedArtboard[] {
  return s.artboards.map((meta) => ({
    id: meta.id,
    name: meta.name,
    paletteIdx: meta.paletteIdx,
    doc: meta.id === s.activeArtboardId ? docOf(s) : (s.artboardDocs[meta.id]?.doc ?? docOf(s)),
  }));
}

interface LoadedDocFile {
  artboards: PersistedArtboard[];
  activeArtboardId: string;
}

/** Roadmap #16 — every document saved before multi-artboard support existed is a
 * bare `DocSnapshot` (what `docOf`/the old `saveDoc` always wrote); wraps it as the
 * sole artboard of the current multi-artboard shape so it loads losslessly, the
 * same "never lose an old save" contract `normalizeDoc`/`migrateAnim` already hold
 * for older per-element fields. Returns `null` only if `raw` matches neither shape
 * (persist.ts's `loadDoc` already filters out anything that matches neither). */
function migrateToDocFile(raw: unknown, lang: StudioState['lang']): LoadedDocFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const asFile = raw as Partial<PersistedDoc>;
  if (Array.isArray(asFile.artboards) && asFile.artboards.length) {
    const artboards = asFile.artboards.map((a, i) => ({
      id: typeof a?.id === 'string' && a.id ? a.id : newArtboardId(),
      name: typeof a?.name === 'string' && a.name ? a.name : defaultArtboardName(i + 1, lang),
      paletteIdx: typeof a?.paletteIdx === 'number' ? a.paletteIdx : 0,
      doc: a.doc,
    }));
    const activeArtboardId = typeof asFile.activeArtboardId === 'string' && artboards.some((a) => a.id === asFile.activeArtboardId) ? asFile.activeArtboardId : artboards[0].id;
    return { artboards, activeArtboardId };
  }
  const asLegacy = raw as DocSnapshot;
  if (!Array.isArray(asLegacy.elements)) return null;
  const id = newArtboardId();
  return { artboards: [{ id, name: defaultArtboardName(1, lang), paletteIdx: 0, doc: asLegacy }], activeArtboardId: id };
}

/** يُبدِّل المستند المفتوح بمستندِ بدايةٍ جديد ويفتح المحرّر — المسار المشترك بين
 * «ابدأ من فراغ» و«مقاس مخصص» و«قالب جاهز».
 *
 * الفرق بينه وبين `patchDoc`: هذه ليست *تعديلًا* على المستند بل **استبدالًا** له،
 * فهي تمسح سجلّ التراجع وتُرجع الوثيقة إلى لوحةٍ واحدة. وإلا لبقي في `historyPast`
 * مستندُ الجلسة السابقة، فيعود الضغط على «تراجع» مرّةً واحدة بمشروعٍ لا علاقة له
 * بما اختاره المستخدم قبل ثانية — وهو أسوأ من ألّا يكون هناك تراجع.
 *
 * ولا تُعلِّم `dirty`: المستند الجديد لم يُعدَّل بعد، وتعليمه يكتب فوق المشروع
 * المحفوظ لمجرّد أن المستخدم فتح مقاسًا ليرى شكله. أول تعديلٍ حقيقي هو ما يحفظ. */
/** أوّل لحظةٍ على الخط الزمني تكون فيها كل حركات الدخول قد انتهت — أي نهاية أطول
 * مقطع. مستندٌ بلا عناصر (أو بلا حركة) يُعيد صفرًا، وهو المطلوب لمشروعٍ جديد: المؤشّر
 * عند البداية حيث يتوقّع المصمّم أن يبدأ. */
function settledTime(elements: DocElement[], fps: number): number {
  if (!elements.length) return 0;
  return documentDuration(elements.map((el) => el.anim), fps);
}

/** **هل يُصيَّر هذا المقطعُ عدمًا عند هذه اللحظة؟** — أي هل لا يَبقى على الشاشة
 * منه شيءٌ يُرى: شفافيّةٌ صفر، أو تحجيمٌ صفر على أحد المحورين.
 *
 * يُقرأ من `resolveAnimAt`/`effectiveScale` أنفسِهما — الصيغةِ الواحدة التي
 * تَقرؤها المعاينةُ والمُصيِّر معًا — فلا يُعاد هنا حسابُ شيء، ولا يُذكَر نمطٌ
 * جاهزٌ باسمه. فيَسري الحكمُ على «ظهور تدريجي» و«انزلاق» و«تكبير» وعلى كلّ
 * نمطٍ يُضاف بعدُ، وعلى مسارٍ بناه المصمّمُ بيده كذلك.
 *
 * **والفرقُ بين العدم وبين النقصان هو مدارُ القاعدة كلِّها.** عنصرٌ شفافيّتُه
 * ٠٫٢٧ في منتصف دخوله **مرئيٌّ**، وعرضُه على المصمّم هو عينُ الغرض من المسطرة.
 * وعنصرٌ شفافيّتُه صفرٌ ليس ناقصًا بل **غائب**. */
function rendersNothingAt(anim: DocElement['anim'], time: number): boolean {
  const v = resolveAnimAt(anim, time);
  const { sx, sy } = effectiveScale(v);
  return v.opacity <= 0 || sx === 0 || sy === 0;
}

/** الملفُّ المحفوظ (بعد `migrateToDocFile`) → حالةُ المستند المفتوح. واحدةٌ لفتح البرنامج
 * ولفتح مشروعٍ من المكتبة، فلا يختلف ما يُستعاد بين الطريقين. */
function loadedFileToState(file: PersistedDoc, projectId: string): Partial<StudioState> {
    const normalized = file.artboards.map((a) => ({ ...a, doc: normalizeDoc(a.doc) }));
    // كان هنا شرطُ `if (!normalized.some((a) => a.doc.elements.length)) return;` —
    // أي أن مستندًا محفوظًا بلا عناصر كان يُطرَح بصمت. أُزيل في ١٨ أكتوبر ٢٠٢٦
    // لأن اللوحة الفارغة صارت مستندًا من الدرجة الأولى: من يختار «ابدأ من فراغ»
    // بمقاس ستوري ثم يُعيد التحميل كان يفقد مقاسه ويجد نفسه في شاشة البداية من
    // جديد. الفراغ ليس تلفًا؛ التلف وحده (`!file` أعلاه) هو ما يُطرَح.
    const active = normalized.find((a) => a.id === file.activeArtboardId) ?? normalized[0];
    const artboardDocs: Record<string, ArtboardDoc> = {};
    for (const a of normalized) {
      if (a.id === active.id) continue;
      artboardDocs[a.id] = { doc: a.doc, historyPast: [], historyFuture: [] };
    }
    return {
      elements: active.doc.elements,
      anim: active.doc.anim,
      sizeIdx: active.doc.sizeIdx,
      customW: active.doc.customW,
      customH: active.doc.customH,
      // تُسرَد كل حقول `DocSnapshot` هنا واحدًا واحدًا (لا `...active.doc`)، فأيّ
      // حقلٍ يُضاف إلى المستند لاحقًا ولا يُضاف إلى هذا السطر يُستعاد بقيمته
      // الافتراضيّة بصمت عند أوّل إعادة تحميل. وقد وقع ذلك بعينه في هذه الدفعة:
      // اختيارُ الزخرفة كان يُحفَظ على القرص فعلًا ثم يُطرَح عند القراءة.
      decorAccent: active.doc.decorAccent,
      // والحقلان الجديدان على القائمة نفسها. والتعليقُ أعلاه ليس تحذيرًا نظريًّا:
      // سَهوُهما هنا أخفى الخطَّ الزمنيَّ عن كلّ مستندٍ مُوقَّتٍ بعد أوّل إعادة
      // تحميل — إذ يَرجع `medium` إلى `'still'` من الحالة الابتدائية بصمت.
      // ظهر ذلك في `qa/timeline.spec.mjs` §٦ وحدها، وتكرّر، فأُصلِح هنا.
      fps: active.doc.fps,
      medium: active.doc.medium,
      // **وأهدافُ التصدير تُبذَر هنا كذلك، ولهذا سببٌ مختلفٌ عن كلّ ما فوقه.**
      // كلُّ سطرٍ أعلاه يَستعيد حقلًا مكتوبًا في `DocSnapshot`؛ و`targets`
      // **ليست** فيه ولا تُحفَظ، فهي حالةُ جلسةٍ تَرجع إلى قيمة
      // `initialStudioState` عند كلّ إعادة تحميل. فمستندُ «بوست عمودي» يُبذَر
      // صحيحًا في `startDoc`، ثم يُعاد تحميلُ الصفحة، فتَرجع الأهدافُ إلى مقاسِ
      // ما-قبل-الاختيار بصمتٍ — عطلٌ آخرُ بالأثر نفسِه من طريقٍ آخر. قِيس في
      // `qa/export-default-target.spec.mjs` §٣.
      targets: defaultTargetsFor(active.doc.sizeIdx),
      historyPast: [],
      historyFuture: [],
      historyLabels: [],
      historyFutureLabels: [],
      dirty: false,
      activeArtboardId: active.id,
      postPalette: active.paletteIdx,
      artboards: normalized.map((a): ArtboardMeta => ({ id: a.id, name: a.name, paletteIdx: a.paletteIdx })),
      artboardDocs,
      // المستند مُحمَّل في الحالة، لكن الشاشة تبقى `home`: شاشة البداية تعرض
      // بطاقة «متابعة» بارزة، ونقرةٌ واحدة عليها تفتح هذا المستند بعينه. فلا
      // المُنتقي مفروض على العائد، ولا العمل المحفوظ مخفيّ عنه.
      openDoc: 'open',
    projectId,
    };
}

function startDoc(s: StudioState, doc: DocSnapshot, opts?: { paletteIdx?: number; sel?: ElementId | null }): StudioState {
  const id = newArtboardId();
  const sel = opts?.sel ?? null;
  return {
    ...s,
    ...doc,
    screen: 'editor',
    // **ومقاسُ هذا المستند هو هدفُ تصديره.** مشروعٌ جديدٌ لم يَختر صاحبُه أهدافًا
    // بعد، فالافتراضُ يُبذَر من مقاسه هو — وكان يُورَّث من `s` أربعةً مكتوبةً
    // بالاسم لا يَربطها به شيء. التفصيلُ في `defaultTargetsFor`.
    targets: defaultTargetsFor(doc.sizeIdx),
    postPalette: opts?.paletteIdx ?? s.postPalette,
    artboards: [{ id, name: defaultArtboardName(1, s.lang), paletteIdx: opts?.paletteIdx ?? s.postPalette }],
    activeArtboardId: id,
    artboardDocs: {},
    historyPast: [],
    historyFuture: [],
    historyLabels: [],
    historyFutureLabels: [],
    sel,
    selectedIds: sel ? [sel] : [],
    editingTextId: null,
    cropEditingId: null,
    nodeEditId: null,
    nodeEditSel: null,
    penDraft: [],
    pendingEditSnapshot: null,
    playing: false,
    // المؤشّر يَقِف حيث تكون كل حركات الدخول قد انتهت، لا عند الصفر.
    //
    // المستند الفارغ لا حركةَ فيه فهذه صفر — وهو الصحيح لمشروعٍ جديد. أما قالبٌ
    // جاهز فعناصره عند اللحظة صفر تكون في **منتصف** دخولها (شفافية صفر وإزاحة
    // قائمة)، فيُفتَح القالب على إطارٍ شبه فارغ لا يشبه ما اختاره المستخدم من
    // المعرض. المطلوب أن يُفتَح القالب على *القالب*: أول لحظةٍ استقرّ فيها كل شيء.
    t: settledTime(doc.elements, doc.fps ?? DEFAULT_DOC_FPS),
    cmdOpen: false,
    // صار هناك مشروعٌ مفتوح: شاشة البداية تعرض «متابعة» من الآن، وتصفه من
    // الحالة الحيّة — فالرجوع للشاشة ثم النقر على المتابعة يعود إلى *هذا*.
    openDoc: 'open',
    // **ومشروعٌ جديدٌ ملفُّه جديد.** كان كلُّ مستندٍ يُكتَب في ملفٍّ واحد، فقالبٌ يُفتح
    // للتجربة يمسح المشروعَ الذي قبله. انظر «مكتبة المشاريع» في `persist.ts`.
    projectId: newProjectId(),
  };
}

const DOC_KEYS = ['anim', 'sizeIdx', 'customW', 'customH', 'decorAccent'] as const;

function splitDocPatch(patch: Record<string, unknown>) {
  const doc: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if ((DOC_KEYS as readonly string[]).includes(k)) doc[k] = v;
    else rest[k] = v;
  }
  return { doc, rest };
}

export function selectedElements(state: StudioState): DocElement[] {
  const ids = new Set(state.selectedIds);
  return state.elements.filter((e) => ids.has(e.id));
}

export function firstSelectedElement(state: StudioState): DocElement | null {
  return state.elements.find((e) => e.id === state.selectedIds[0]) ?? null;
}

export interface StudioActions {
  goHome: () => void;
  goEditor: () => void;
  /** يبدأ مستندًا **فارغًا** بمقاسٍ من `SIZES` ويفتح المحرّر — مسار «ابدأ من فراغ».
   * نقرةٌ واحدة من الإقلاع إلى لوحةٍ قابلة للرسم، كما في الأداة الشائعة وإكسبرس ومحرّر الفيديو الشائع
   * جميعًا (`re-canva-flows.md` §1.6: السقف ثلاث نقرات والشائع نقرة واحدة). */
  startBlank: (sizeIdx: number) => void;
  /** نفسه بمقاسٍ مخصّص يكتبه المستخدم — صفّ «مقاس مخصص» المثبَّت تحت البحث. */
  startBlankCustom: (w: number, h: number) => void;
  /** يفتح قالبًا مدمجًا من `STARTER_TEMPLATES` (ومنها البوستر التجريبي) بمحتواه ولوحته
   * ومقاسه وحركته، والعنصر المناسب محدَّدًا. */
  startFromStarter: (id: string) => void;
  /** يرجع إلى المشروع المفتوح: المستند في الحالة أصلًا (استُرجع من القرص عند
   * الإقلاع، أو بدأه المستخدم في هذه الجلسة)، فهذه نقلةُ شاشةٍ فقط — وهي الغرض
   * كله: ألّا يُجبَر العائد على المرور بالمُنتقي ليصل إلى عمله. */
  resumeOpenProject: () => void;
  /** يقرأ مكتبةَ المشاريع من القرص إلى `projects` — تناديه شاشةُ البداية عند ظهورها. */
  refreshProjects: () => Promise<void>;
  /** يفتح مشروعًا من المكتبة. يحفظ المفتوحَ أوّلًا إن كان فيه ما لم يُحفظ. */
  openProject: (id: string) => Promise<void>;
  toggleLang: () => void;
  /** `keepSelection` للمسارات التي تُعيد الأداةَ إلى «تحديد» **بعد إنشاء عنصر**،
   * فالعنصرُ الجديدُ محدَّدٌ لتوّه ونزعُه عنه يُفقِد قدرةً. انظر `armTool`. */
  setTool: (tool: StudioState['tool'], opts?: { keepSelection?: boolean }) => void;
  setShapeDrawKind: (k: ShapeDrawKind) => void;
  openCmd: () => void;
  closeCmd: () => void;
  setCmdQuery: (q: string) => void;
  moveCmdSel: (dir: 1 | -1) => void;
  runSelectedCmd: () => void;
  runCommand: (c: CommandDef) => void;
  setPanel: (panel: PanelId) => void;
  /** يفتح لوح «العناصر» على مكتبة أداةٍ **بلا تسليحها** — باب شريط الإضافة: من يتصفّح
   * الأشكال أو أنماط النصوص لم يطلب أن تصير نقرتُه التالية على اللوحة رسمًا. */
  openLibrary: (tool: StudioState['tool']) => void;
  /** نقرة ثانية على البند نفسه في شريط الإضافة تُغلق لوحه (الأداة الشائعة). */
  toggleRailPanel: (panel: Exclude<PanelId, 'props' | null>, opts?: { libraryTool?: StudioState['tool']; assetsTab?: StudioState['assetsTab'] }) => void;
  toggleInspector: () => void;
  toggleLayers: () => void;
  toggleShortcuts: () => void;
  closeShortcuts: () => void;
  /** يقلب الوضع الاحترافي (مسك أداة المتّجهات) ويحفظه تفضيلًا للجهاز — انظر `StudioState.pro`. */
  togglePro: () => void;
  /** ⌘D — نسخةٌ من المحدَّد فوقه مباشرةً بإزاحةٍ صغيرة، والنسخة هي المحدَّدة. */
  duplicateSelected: () => void;
  /** ⌘C / ⌘X / ⌘V — حافظةٌ داخليّة للعناصر (بقناعها ومسارها إن وُجدا). */
  copySelected: () => void;
  /** «نسخ الحركة»: مقطعُ أوّلِ عنصرٍ محدَّد كاملًا (مساراته، وطوله وقصّه، و«يظهر في مقطعه
   * فقط»، وتتابعُ نصّه) إلى حافظة الحركة. لا يغيّر المستند. */
  copyAnimation: () => void;
  /** «لصق الحركة»: على كلّ محدَّدٍ غيرِ مقفول — **من بداية مقطعه هو**: الحركةُ نفسُها
   * تبدأ حيث يبدأ، فتسميةٌ واحدةٌ تمسح من اليمين في مشهدٍ وأخرى في مشهدٍ بعده بنسخةٍ
   * واحدة. والخصائصُ التي لا معنى لها على الهدف تُترَك (قصُّ الخطّ لغير الشكل، و«الظهور»
   * لغير النصّ). خطوةُ تراجعٍ واحدة. */
  pasteAnimation: () => void;
  cutSelected: () => void;
  pasteClipboard: () => void;
  /** ⌘A — كلّ العناصر الظاهرة غير المقفلة. */
  selectAllElements: () => void;
  /** يضع نصًّا جاهزًا في وسط اللوحة محدَّدًا — بطاقات لوح «نصوص». */
  addTextPreset: (preset: TextPreset) => void;
  /** «حرّك» من الشريط السياقي: يطبّق نمط دخول على العنصر — وإن كان المستند ساكنًا
   * يصير مُوقَّتًا في الخطوة نفسها فيطلع الخطّ الزمنيّ ويشتغل («أي تصميم يصير مشهد»).
   * خطوة تراجع واحدة تُرجع الاثنين. */
  animateElement: (id: ElementId, preset: AnimPreset) => void;
  /** حركةُ دخولٍ واحدة للمحدَّد — أو للتصميم كلّه إن لم يُحدَّد شيء — بخطوة تراجعٍ واحدة،
   * والساكنُ يصير مشهدًا ويشتغل من البداية كما في «حرّك». بابُ أمر «حركة: ظهور تدريجي». */
  animateSelectionOrAll: (preset: 'fade' | 'slide' | 'pop') => void;
  setAssetsTab: (tab: StudioState['assetsTab']) => void;
  toggleTimeline: () => void;
  togglePlay: () => void;
  scrubTo: (t: number) => void;
  cycleSize: () => void;
  setSizeIdx: (idx: number) => void;
  setCustomSize: (w: number, h: number) => void;
  setMagicResizeOn: (on: boolean) => void;
  applyMagicResize: (sizeIdx: number, customW?: number, customH?: number) => void;
  setExportMagicResize: (on: boolean) => void;
  /** Roadmap #16 — multiple artboards per document. Each switches the active
   * doc/undo-history atomically; `switchArtboard` is a no-op for an unknown id or
   * the already-active one. `deleteArtboard` is a no-op on the last remaining
   * artboard (a document always has at least one). */
  openArtboards: () => void;
  closeArtboards: () => void;
  switchArtboard: (id: string) => void;
  addArtboard: () => void;
  duplicateArtboard: (id: string) => void;
  renameArtboard: (id: string, name: string) => void;
  deleteArtboard: (id: string) => void;
  /** Roadmap #16 — when on, `startExport` runs the selected-sizes batch once per
   * artboard instead of just the active one. */
  setExportAllArtboards: (on: boolean) => void;
  /** «كل لوحة بمقاسها» — انظر `StudioState.exportArtboardOwnSize`. */
  setExportArtboardOwnSize: (on: boolean) => void;
  setElementEasing: (id: ElementId, easing: EasingId) => void;
  /** «التوقيت» في لوح الخصائص: بدايةُ المقطع **نقلٌ** (مفاتيحُه تنتقل معه، دلالةُ سحب
   * جسمه) ونهايتُه **تقليمٌ للحافّة الأخيرة** (دلالةُ سحبها) — لكلّ معرّفٍ في القائمة،
   * على شبكة الإطارات، بخطوة تراجعٍ واحدةٍ مُسمّاة. وهي دلالةُ حقلَي In/Out في
   * After Effects بعينها. المقفولُ لا يُمَسّ. */
  setClipTiming: (ids: ElementId[], timing: { start?: number; end?: number }) => void;
  /** «يظهر في مقطعه فقط» — انظر `ElementAnim.bounded`. خطوةُ تراجعٍ واحدة لكلّ القائمة. */
  setClipBounded: (ids: ElementId[], bounded: boolean) => void;
  /** «الكلمة التالية هنا»: مفتاحُ «ظهور» عند المؤشّر قيمتُه ما ظهر حتى الآن زائدًا واحدًا،
   * بتخفيف «تثبيت» — فتظهر الوحدةُ التالية في إطار المؤشّر بالضبط. أوّلُ ضغطةٍ تزرع قبله
   * مفتاحَ صفرٍ عند بداية المقطع كي لا يظهر شيءٌ قبل أوانه. خطوةُ تراجعٍ واحدة. */
  revealNextAtPlayhead: (id: ElementId) => void;
  /** يحذف مسارَ «الظهور» كلَّه فيعود التوقيتُ التلقائيّ كما كان. */
  clearRevealTiming: (id: ElementId) => void;
  addTrackKeyframeAtPlayhead: (id: ElementId, property: AnimProperty) => void;
  deleteTrackKeyframe: (id: ElementId, property: AnimProperty, kfId: string) => void;
  /** يَكتب قيمةَ مفتاحٍ **بخطوةِ تراجعٍ واحدةٍ مُسمّاة** — لكتابةٍ مُفردةٍ ليست
   * جزءًا من إيماءةٍ مستمرّة. وداخلَ إيماءةٍ (سحبُ المِمسحة، أو طَرْقٌ متتابعٌ في
   * الحقل) تُستعمل `liveUpdateTrackKeyframeValue` محوطةً
   * بـ`beginElementEdit`/`commitElementEdit`، وإلّا صارت الإيماءةُ الواحدةُ
   * خطواتٍ — **مقيسٌ على `main`: سحبةٌ واحدةٌ للمِمسحة كلّفت خمسَ ضغطاتِ تراجع.** */
  setTrackKeyframeValue: (id: ElementId, property: AnimProperty, kfId: string, value: number) => void;
  /** كتابةٌ حيّةٌ بلا تاريخ — نصفُ `setTrackKeyframeValue`، وتَمرّ بقُمعِ القيمة
   * نفسِه (`writeKeyframeValue`) فلا تَقدر على قيمةٍ لا تَقدر عليها أختُها. */
  liveUpdateTrackKeyframeValue: (id: ElementId, property: AnimProperty, kfId: string, value: number) => void;
  setTrackKeyframeEasing: (id: ElementId, property: AnimProperty, kfId: string, easing: EasingId) => void;
  setTrackKeyframeBezier: (id: ElementId, property: AnimProperty, kfId: string, bezier: Bezier) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  setPan: (x: number, y: number) => void;
  panBy: (dx: number, dy: number) => void;
  selectElement: (id: ElementId | null, additive?: boolean) => void;
  selectMany: (ids: ElementId[]) => void;
  selectNone: () => void;
  setAnim: (anim: StudioState['anim']) => void;
  /** حركة الدخول لعنصرٍ **واحد** بعينه. كان الطريق الوحيد إلى الأنماط الجاهزة هو
   * `setAnim` العامّ، وهو يكتب حقل المستند `anim` ثم يَنسخ الاسم فقط إلى العنصر
   * `'head'` — فيتبدّل *اسم* النمط ولا تتبدّل `tracks`، والرسم لا يقرأ إلا `tracks`.
   * النتيجة كانت زرًّا يُضيء ولا يُحرّك شيئًا. هذه الدالة تُعيد بناء المسارات فعلًا
   * عبر `tracksFromPreset` (وهي الدالة نفسها التي يستخدمها ترحيل المستندات
   * القديمة)، فما يُرى على الزرّ هو ما يُرى على اللوحة وفي الإطار المُصدَّر. */
  setElementAnimPreset: (id: ElementId, preset: AnimPreset) => void;
  setElementText: (id: ElementId, text: string) => void;
  setElementFont: (id: ElementId, family: string) => void;
  setElementFontSize: (id: ElementId, px: number) => void;
  /** تتبُّع الأحرف بالنسبة المئويّة من مقاس الخطّ — انظر `TextElement.tracking`.
   * يُقصَر عند الالتزام لا عند كل ضغطة، تمامًا كمقاس الخطّ. */
  setElementTracking: (id: ElementId, percent: number) => void;
  /** تباعدُ الأسطر (`TextElement.lineHeight`)، مضاعِفًا للمقاس — والافتراضيُّ يحذف الحقل. */
  setTextLineHeight: (id: ElementId, lineHeight: number) => void;
  setElementWeight: (id: ElementId, weight: Weight) => void;
  setElementColor: (id: ElementId, hex: string) => void;
  setElementHAlign: (id: ElementId, a: HAlign) => void;
  setElementVAlign: (id: ElementId, a: VAlign) => void;
  setElementJustify: (id: ElementId, justify: boolean) => void;
  setTextStagger: (id: ElementId, patch: Partial<TextStaggerAnim>) => void;
  setElementOpacity: (id: ElementId, opacity: number) => void;
  /** ضبابيّةُ العنصر الساكنةُ، كسرًا من عرض اللوح (`ElementBase.blur`). خطوةُ
   * تراجعٍ واحدةٌ لكلّ نداء — فلا تُستعمل من سحبِ شريط، وهذا ما
   * `liveUpdateElementBlur` له. */
  setElementBlur: (id: ElementId, blur: number) => void;
  /** نفسُ الكتابة بلا دفعٍ في التاريخ، لمدّة سحبةٍ واحدةٍ على الشريط — نفسُ نمط
   * `liveUpdateShapeSmoothAmount`: سحبةٌ واحدةٌ = خطوةُ تراجعٍ واحدة. */
  liveUpdateElementBlur: (id: ElementId, blur: number) => void;
  setElementGeoPx: (id: ElementId, patch: { x?: number; y?: number; w?: number; h?: number; rotation?: number }) => void;
  /** نقطةُ ارتكاز الحركة (`ElementBase.pivot`)، كسرًا من صندوق العنصر — و`null` أو المركزُ
   * يحذفانها فيعود المستندُ كما كان بايتًا ببايت. خطوةُ تراجعٍ واحدة. */
  setElementPivot: (id: ElementId, pivot: { x: number; y: number } | null) => void;
  setShapeFill: (id: ElementId, hex: string) => void;
  setShapeStroke: (id: ElementId, hex: string | null) => void;
  setShapeStrokeWidth: (id: ElementId, w: number) => void;
  setShapeRadius: (id: ElementId, r: number) => void;
  /** Roadmap #11 — 0..1, see `ShapeElement.smoothAmount`. One `commitElements`, so
   * one undo step per call — only safe for a single discrete set (a typed value, an
   * MCP command). A dragged slider fires a change per tick and must go through
   * `beginElementEdit`/`liveUpdateShapeSmoothAmount`/`commitElementEdit` instead. */
  setShapeSmoothAmount: (id: ElementId, amount: number) => void;
  /** Roadmap #11 — same write as `setShapeSmoothAmount` with no history push, for the
   * duration of a slider drag (see `PathSmoothProps`). */
  liveUpdateShapeSmoothAmount: (id: ElementId, amount: number) => void;
  /** Roadmap #11 — flips one anchor's corner/smooth state (`ShapeElement.cornerPoints[index]`). */
  toggleShapeCornerPoint: (id: ElementId, index: number) => void;
  setImageFit: (id: ElementId, fit: 'cover' | 'contain' | 'fill') => void;
  replaceImage: (id: ElementId) => Promise<void>;
  startCropEdit: (id: ElementId) => void;
  endCropEdit: () => void;
  liveUpdateImageCrop: (id: ElementId, patch: { cropX?: number; cropY?: number; cropScale?: number }) => void;
  resetImageCrop: (id: ElementId) => void;
  setImageFlip: (id: ElementId, axis: 'h' | 'v') => void;
  setImageRadius: (id: ElementId, r: number) => void;
  setImageStroke: (id: ElementId, hex: string | null) => void;
  setImageStrokeWidth: (id: ElementId, w: number) => void;
  /** Roadmap #17 — appearance stack (fills/strokes/shadows), one ordered layer list
   * per category, on any element kind. Every mutation below is exactly one
   * `commitElements` call (one undo step), lazily materializing the stack from legacy
   * fields on first touch via `currentAppearance` if the element never had a real one. */
  addFillLayer: (id: ElementId) => void;
  removeFillLayer: (id: ElementId, layerId: string) => void;
  duplicateFillLayer: (id: ElementId, layerId: string) => void;
  moveFillLayer: (id: ElementId, layerId: string, dir: 'up' | 'down') => void;
  updateFillLayer: (id: ElementId, layerId: string, patch: Partial<AppearanceFillLayer>) => void;
  addStrokeLayer: (id: ElementId) => void;
  removeStrokeLayer: (id: ElementId, layerId: string) => void;
  duplicateStrokeLayer: (id: ElementId, layerId: string) => void;
  moveStrokeLayer: (id: ElementId, layerId: string, dir: 'up' | 'down') => void;
  updateStrokeLayer: (id: ElementId, layerId: string, patch: Partial<AppearanceStrokeLayer>) => void;
  addShadowLayer: (id: ElementId) => void;
  removeShadowLayer: (id: ElementId, layerId: string) => void;
  duplicateShadowLayer: (id: ElementId, layerId: string) => void;
  moveShadowLayer: (id: ElementId, layerId: string, dir: 'up' | 'down') => void;
  updateShadowLayer: (id: ElementId, layerId: string, patch: Partial<AppearanceShadowLayer>) => void;
  /** `targetId` is any element (image/shape/text); `maskShapeId` must be a shape. */
  applyClippingMask: (targetId: ElementId, maskShapeId: ElementId) => void;
  releaseClippingMask: (targetId: ElementId) => void;
  /** Roadmap #12 — attaches/detaches `targetId` (a text element) to/from
   * `pathShapeId` (a `shape:'path'` element), or clears it with `null`. Unlike the
   * clipping mask, the path shape itself is left exactly as-is (still independently
   * visible/paintable) — see `TextElement.pathId`. */
  setTextPathId: (targetId: ElementId, pathShapeId: ElementId | null) => void;
  setLockAspect: (v: boolean) => void;
  toggleVisible: (id: ElementId) => void;
  /** تجميع التحديد الحالي تحت `groupId` واحد (⌘G)، **ومجاورتُه في ترتيب الطبقات**
   * عند موضع أعلى عضوٍ فيه — كما يفعل أداة المتّجهات. مجموعةٌ متخلّلةٌ بعنصرٍ غريب تبدو
   * وحدةً في القائمة وليست وحدةً على اللوحة، وذلك أسوأ من ألّا تُجمَّع أصلًا.
   * نداءٌ واحد لـ`commitElements`، فخطوة تراجعٍ واحدة مهما بلغ عدد الأعضاء. */
  groupSelected: () => void;
  /** فكّ تجميع كل مجموعةٍ يمسّها التحديد (⇧⌘G). خطوة تراجعٍ واحدة. */
  ungroupSelected: () => void;
  /** قفل التحديد (⌘2). العنصر المقفل لا يُمسَك على اللوحة إطلاقًا
   * (`Stage.tsx`: `if (!el || el.locked) return;`) — وهذا هو الحلّ المهنيّ المعتاد
   * لمشكلة «الخلفية تُمسَك بدل أن يُرسَم فوقها». خطوة تراجعٍ واحدة. */
  lockSelected: () => void;
  /** قلب قفل طبقةٍ واحدة من سطرها في قائمة الطبقات. */
  toggleLocked: (id: ElementId) => void;
  /** فكّ قفل كل شيء (⌥⌘2) — جواب أداة المتّجهات نفسه: المقفل غير قابلٍ للتحديد، فلا
   * يجوز أن يكون فكُّ قفله مشروطًا بتحديده، وإلا صار القفل طريقًا بلا رجعة. */
  unlockAll: () => void;
  /** إخفاء التحديد (⌘3). خطوة تراجعٍ واحدة. */
  hideSelected: () => void;
  /** إظهار كل شيء (⌥⌘3) — لنفس سبب `unlockAll`: المخفيّ لا يُنقَر على اللوحة. */
  showAll: () => void;
  /** اسمٌ يكتبه المصمّم لطبقة؛ نصٌّ فارغ يرجع بها إلى الاسم المشتقّ من المحتوى. */
  renameElement: (id: ElementId, name: string) => void;
  bringForward: (ids: ElementId[]) => void;
  sendBackward: (ids: ElementId[]) => void;
  reorderElement: (id: ElementId, toIndex: number) => void;
  alignSelected: (edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distributeSelected: (axis: 'x' | 'y') => void;
  deleteSelected: () => void;
  beginElementEdit: (label?: string) => void;
  commitElementEdit: () => void;
  /** Escape أثناء السحب: يُعيد المستند إلى ما كان قبل الإيماءة ولا يُسجّل خطوة. */
  cancelElementEdit: () => void;
  liveUpdateElements: (updater: (els: DocElement[]) => DocElement[]) => void;
  commitElements: (updater: (els: DocElement[]) => DocElement[], label?: string) => void;
  /** **يُقسّم مقطعًا عند المؤشّر الزمنيّ، ويُبقي النصفَ الأيمن محدَّدًا** — قاعدةُ
   * محرّر فيديو شائع، ومحرّر خطٍّ زمنيٍّ مفتوح تُقرّ بها على تطبيقِها نفسِه
   * (`re-filmcraft-source.md:626`): الفعلُ التالي المعتاد على مقطعٍ قصيرٍ هو «أسقِط
   * الذيل»، فـ`⌘B` ثم `Delete` يجب أن يعملا بلا إعادةِ تحديد.
   *
   * خطوةُ تراجعٍ **واحدة** مُسمّاة. ولا يفعل شيئًا إن لم يكن المؤشّر داخل المقطع
   * بإطارٍ من كلّ جانب — وسطحُ التقسيم يقول ذلك قبل الضغط (`canSplitAt`). */
  splitAtPlayhead: (id?: ElementId) => void;
  nudgeSelected: (dx: number, dy: number) => void;
  startTextEdit: (id: ElementId) => void;
  commitTextEdit: (id: ElementId, text: string) => void;
  /** `kind` صار `ShapeDrawKind` (ثمانية أنواع) بدل `ShapeKind` المستنديّ الثلاثي؛
   * `'rect'`/`'ellipse'` تعنيان ما كانتا تعنيه، فكل نداء قائم (بما فيه أداة MCP
   * `add_shape`) يبقى صحيحًا بلا تغيير. */
  addShapeElement: (
    kind: ShapeDrawKind,
    geoPx: { x: number; y: number; w: number; h: number },
    opts?: {
      /** أضلاع المضلّع / رؤوس النجمة. */
      n?: number;
      /** أيّ قُطرَي الصندوق يسلكه الخطّ — من اتجاه السحب الفعلي. */
      lineVector?: { flipX: boolean; flipY: boolean };
      /** يستخدم رمادي الأداة الشائعة المحيَّد بدل لون الهوية (نقرة المكتبة وحدها). */
      placeholderFill?: boolean;
    },
  ) => void;
  placeShapeFromLibrary: (recipe: ShapeRecipe) => void;
  setShapeDrawN: (n: number) => void;
  openToolLibrary: (tool: StudioState['tool']) => void;
  addPathElement: (points: Array<{ x: number; y: number }>, closed: boolean, bboxPx: { x: number; y: number; w: number; h: number }) => void;
  penAddPoint: (x: number, y: number) => void;
  /** يضبط مقبض الخروج لآخر نقطة في المسودّة أثناء السحب (إزاحة بالبكسل من النقطة) —
   * هذا ما يحوّل «نقرة = زاوية» إلى «نقرة-واسحب = منحنى» في أداة القلم. */
  penSetDraftHandle: (handle: { x: number; y: number } | null) => void;
  /** `forceClosed` يتجاوز مفتاح «إغلاق المسار» — تستخدمه نقرة المصمم على أول نقطة
   * ربط، وهي إيماءة الإغلاق المتعارف عليها في كل محرّر متجهي. */
  penFinish: (forceClosed?: boolean) => void;
  penCancel: () => void;
  /** Roadmap #11 (تكملة) — وضع تحرير العقد: سحب نقاط الربط والمقابض على اللوحة. */
  startNodeEdit: (id: ElementId) => void;
  endNodeEdit: () => void;
  selectPathNode: (index: number, part: 'anchor' | 'in' | 'out') => void;
  /** إحداثيات كسرية من صندوق العنصر، بلا دفع للتاريخ — تُستدعى لكل حركة مؤشّر داخل
   * سحبة واحدة، مُحاطة بـ`beginElementEdit`/`commitElementEdit` (تراجعة واحدة). */
  liveUpdatePathPoint: (id: ElementId, index: number, pt: { x: number; y: number }) => void;
  /** `mirror` يحرّك المقبض المقابل في الاتجاه المعاكس بنفس الطول (مقابض متناظرة، وهو
   * السلوك الافتراضي)؛ `false` يكسر التناظر لمقبض مستقل (Alt أثناء السحب). */
  liveUpdatePathHandle: (id: ElementId, index: number, part: 'in' | 'out', vec: { x: number; y: number }, mirror: boolean) => void;
  /** يحذف نقطة ربط واحدة (خطوة تراجع واحدة). يحذف العنصر كله إن بقي أقل من نقطتين. */
  deletePathPoint: (id: ElementId, index: number) => void;
  /** يُدرج نقطة ربط على المقطع `segIndex` عند المعامل `t` بلا تغيير شكل المسار إطلاقًا
   * (de Casteljau — انظر `insertAnchorOnSegment`). خطوة تراجع واحدة. */
  insertPathPoint: (id: ElementId, segIndex: number, t: number) => void;
  /** Roadmap #10 — replaces `ids` (>= 2 boolean-eligible shapes) with a single new
   * path element holding the op's result, one undo step. No-op if the result has no
   * area (see `computeBooleanOp`). */
  applyBooleanOp: (op: BooleanOp, ids: ElementId[]) => void;
  /** Roadmap #12 — replaces a text element with a shape element holding its real
   * HarfBuzz-shaped glyph outlines (already-computed by the caller via
   * `convertTextElementToOutline`, since that pipeline is async/WASM-backed and this
   * action itself must stay a plain synchronous one-undo-step commit, same split as
   * `removeImageBackground`/`setImageBackgroundRemoved`). No-op if `id` isn't a text
   * element (e.g. the user changed selection while the async shaping was in flight). */
  convertTextToOutline: (id: ElementId, outline: PathCmd[], geo: Geometry, fill: string) => void;
  setPenClosePath: (v: boolean) => void;
  insertImageTool: (clickPointPx?: { x: number; y: number }) => Promise<void>;
  insertImageFromFile: (file: File, dropPointPx?: { x: number; y: number }) => Promise<void>;
  insertLottieTool: (clickPointPx?: { x: number; y: number }) => Promise<void>;
  insertLottieFromFile: (file: File, dropPointPx?: { x: number; y: number }) => Promise<void>;
  replaceLottie: (id: ElementId) => Promise<void>;
  setLottieLoop: (id: ElementId, loop: boolean) => void;
  insertVideoTool: (clickPointPx?: { x: number; y: number }) => Promise<void>;
  insertVideoFromFile: (file: File, dropPointPx?: { x: number; y: number }) => Promise<void>;
  replaceVideo: (id: ElementId) => Promise<void>;
  setVideoTrim: (id: ElementId, trimIn: number, trimOut: number) => void;
  setVideoVolume: (id: ElementId, volume: number) => void;
  setVideoMuted: (id: ElementId, muted: boolean) => void;
  /** «صوت» ← «أضف ملف صوت»: منتقي الملفّات، ثم طبقةُ صوتٍ **عند المؤشّر** — حيث يقف
   * المصمّم يبدأ الصوت، كما في محرّرات الفيديو. خطوةُ تراجعٍ واحدة. */
  insertAudioTool: () => Promise<void>;
  /** ملفُّ صوتٍ مُفلَتٌ على اللوحة أو مرفوعٌ من «ملفاتي». */
  insertAudioFromFile: (file: File) => Promise<void>;
  /** علوُّ صوتِ طبقة صوتٍ أو فيديو (٠..١) — خطوةُ تراجعٍ لكلّ التزام. */
  setAudioVolume: (id: ElementId, volume: number) => void;
  /** علوُّ الصوت أثناء سحب الشريط — حيٌّ بلا تاريخ، محاطٌ بـ`beginElementEdit`/`commitElementEdit`
   * فتصير السحبةُ كلُّها خطوةَ تراجعٍ واحدة. */
  liveSetAudioVolume: (id: ElementId, volume: number) => void;
  setAudioMuted: (id: ElementId, muted: boolean) => void;
  /** «تأثيرات» ← بطاقة: طبقةُ مؤثّرٍ **عند المؤشّر** فوق كلّ الطبقات، محدودةٌ بمقطعها،
   * محدَّدةٌ فورًا. والانتقالُ يُوسَّط على المؤشّر (قمّتُه عند القطع). خطوةُ تراجعٍ واحدة. */
  insertFx: (kind: FxKind) => void;
  /** خصائصُ طبقة المؤثّر (النوع، القوّة، التلاشي) — خطوةُ تراجعٍ لكلّ التزام. */
  setFxProps: (id: ElementId, patch: Partial<{ fx: FxKind; amount: number; fadeIn: number; fadeOut: number }>) => void;
  /** القوّةُ أثناء سحب الشريط — حيٌّ بلا تاريخ، بين `beginElementEdit`/`commitElementEdit`. */
  liveSetFxProps: (id: ElementId, patch: Partial<{ amount: number; fadeIn: number; fadeOut: number }>) => void;
  setVideoLoop: (id: ElementId, loop: boolean) => void;
  undo: () => void;
  redo: () => void;
  setFontUrl: (url: string) => void;
  addFont: () => void;
  /** «أضف خطًّا من جهازك»: ملفُّ ttf/otf/woff/woff2 يُسجَّل ويُحفَظ في مكتبة الخطوط فيبقى
   * بعد إعادة التشغيل، ويُطبَّق على النصّ المحدَّد إن وُجد. */
  addFontFromFile: () => Promise<void>;
  /** «خطٌّ مثبّت بالاسم»: يُقاس أنه موجودٌ فعلًا في الجهاز (`isFontInstalled`) قبل أن يُضاف. */
  addSystemFont: (name: string) => void;
  removeUserFont: (family: string) => void;
  setPostPalette: (idx: number) => void;
  /** لونُ خلفيةٍ حرّ: طبقةٌ حقيقيّة باسم «الخلفية» خلف كلّ شيء (انظر `BACKGROUND_ID`). */
  setBackgroundColor: (color: string) => void;
  /** يقلب زخرفة اللوحة — انظر `DocSnapshot.decorAccent`. حقلُ مستندٍ، فيمرّ
   * بـ`patchDoc`: خطوةُ تراجعٍ واحدة ويُحفَظ مع المستند. */
  setDecorAccent: (on: boolean) => void;
  /** Re-colours every text/shape element in the document to the current palette's
   * tokens in one undo step — including elements the user previously gave an explicit
   * manual color (an intentional override of the normal "manual colors stay put when
   * switching palettes" precedence; see docs/CONTROLS.md "تطبيق اللوحة على كل عنصر"). */
  applyPaletteToAll: () => void;
  setAiInput: (text: string) => void;
  sendAi: (text?: string) => void;
  setAiEngine: (engine: AiEngine) => void;
  setAiCustomCmd: (cmd: string) => void;
  cancelAi: () => void;
  detectAiAgents: () => void;
  openExport: () => void;
  closeExport: () => void;
  setExportFormat: (fmt: StudioState['exportFormat']) => void;
  toggleExportTarget: (id: string) => void;
  selectAllTargets: () => void;
  /** يَقصُر أهداف التصدير على مقاس اللوحة الحالية وحده — انظر التعليق عند التنفيذ. */
  selectProjectSizeTarget: () => void;
  setExportScale: (n: 1 | 2 | 3) => void;
  setExportQuality: (q: 'high' | 'med') => void;
  setExportTransparent: (on: boolean) => void;
  setExportFps: (fps: number) => void;
  setExportShutterSamples: (samples: number) => void;
  startExport: () => void;
  setHomePrompt: (text: string) => void;
  startFromPrompt: () => void;
  openTemplates: () => void;
  closeTemplates: () => void;
  saveTemplateFromCurrent: (name: string, slots: TemplateSlot[]) => void;
  deleteTemplate: (id: string) => void;
  /** Rebuilds the current document from a template's structure, with slotted
   * elements' content overwritten by `fills` — see `fillTemplate` in `templates.ts`. */
  applyTemplateFill: (templateId: string, fills: Record<string, SlotFill>) => void;
  /** يضع قالبًا جاهزًا (`STARTER_TEMPLATES`) في المشروع المفتوح **على مقاسه هو**:
   * المحتوى يُعاد تحجيمه بـ`magicResizeElements` من مقاس القالب إلى مقاس اللوحة، في
   * خطوة تراجعٍ واحدة. */
  applyStarterHere: (id: string) => void;
  /** Replays a template's saved montage structure (clip timing, keyframe tracks,
   * text-stagger sequencing) onto the *current* document's elements, matched by
   * kind/position — leaves their own content/geometry untouched. */
  applyTemplateMotion: (templateId: string) => void;
  openLocalModels: () => void;
  closeLocalModels: () => void;
  openRefVideo: () => void;
  closeRefVideo: () => void;
  /** Roadmap #20: blanks the current document to a fresh artboard (optionally at a
   * new size) as a single undo step — the "create/clear a document" verb the MCP
   * tool registry and any future command surface need, that no existing action
   * covered (every other doc-level action edits in place). */
  newDocument: (opts?: { sizeIdx?: number; customW?: number; customH?: number }) => void;
  openMcp: () => void;
  closeMcp: () => void;
  setMcpServerEnabled: (on: boolean) => void;
  openAiGenerate: () => void;
  closeAiGenerate: () => void;
  setAiGenProviderId: (id: string | null) => void;
  setAiGenPrompt: (text: string) => void;
  setAiGenSize: (size: string) => void;
  /** Roadmap #22: runs the selected provider's real `generate()` call (network
   * request included) and, on success, inserts the result as a real image/video
   * element on the active artboard via `insertLoadedImage`/`insertLoadedVideo` — the
   * same single-undo-step insertion a normal file import uses. Aborts any
   * in-flight call for this dialog first, same as `cancelAiGenerate`. */
  runAiGenerate: () => Promise<void>;
  cancelAiGenerate: () => void;
  /** Roadmap #21: adds a new template to the library built from a reference video's
   * detected shot structure — see `buildReferenceVideoTemplate` in `referenceVideo.ts`.
   * A pure library addition (same shape as `saveTemplateFromCurrent`): never touches
   * the current document/undo history. */
  importReferenceVideoTemplate: (name: string, structure: ReferenceVideoStructure) => void;
  /** Roadmap #9: commits the output of an on-device background-removal run as the
   * image's new `src`, keeping the pre-removal `src` on `bgOriginalSrc` (only the
   * *first* time — a second removal run doesn't overwrite the real original with an
   * already-processed one) so "استرجاع الخلفية" can restore it losslessly. One undo step. */
  setImageBackgroundRemoved: (id: ElementId, src: string) => void;
  restoreImageBackground: (id: ElementId) => void;
  openCmdInterpreter: () => void;
  closeCmdInterpreter: () => void;
  /** Roadmap #24-أ: commits the output of an on-device super-resolution run as the
   * image's new `src`, updating `naturalW`/`naturalH` to the upscaled pixel size
   * (needed by the cover/contain/fill layout math — see elements.ts) — one undo
   * step, same shape as `setImageBackgroundRemoved` above. The on-canvas frame
   * (`geo`) is left untouched; only the image's own resolution changed. */
  setImageUpscaled: (id: ElementId, src: string, naturalW: number, naturalH: number) => void;
  /** **تتبُّع الصورة إلى متجهات** (`src/lib/imageTrace.ts`) — على الجهاز، بلا شبكة.
   * يُتتبَّع ما يظهر من الصورة في إطارها، فتوضع فوقها مباشرةً مجموعةُ مساراتٍ بألوانها
   * (وخلفيّتُها مستطيلًا إن كانت معتمة)، وتُخفى الصورة ولا تُحذف، وتُحدَّد المجموعة —
   * خطوةَ تراجعٍ واحدة. `id` غائبًا: أعلى صورةٍ في المحدَّد، وإلّا أعلى صورةٍ ظاهرة.
   * لا يرمي أبدًا: الفشلُ نتيجةٌ بسببٍ ورسالةٍ بلغة الواجهة. */
  traceImage: (id?: ElementId, opts?: TraceOptions) => Promise<TraceOutcome>;
}

export type TraceOutcome =
  | { ok: true; imageId: ElementId; groupId: string; ids: ElementId[]; colors: string[]; anchors: number; ms: number }
  | { ok: false; reason: 'no-image' | 'busy' | 'decode' | 'empty' | 'failed'; message: string };

interface StudioContextValue {
  state: StudioState;
  actions: StudioActions;
  dict: Dictionary;
  dir: 'rtl' | 'ltr';
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StudioState>(initialStudioState);
  /** حافظة العناصر (⌘C/⌘X/⌘V). خارج الحالة عمدًا: ليست مستندًا ولا واجهة، ولا يُعاد
   * الرسم لأجلها. `pastes` يعدّ اللصقات منذ آخر نسخ فتتدرّج الإزاحة ولا تتكدّس. */
  const clipboardRef = useRef<{ elements: DocElement[]; pastes: number } | null>(null);
  /** الحالة الحاضرة لأفعالٍ تقرأ ولا تكتب (النسخ) — كي لا يُعاد بناء الأفعال كلّها لأجلها. */
  const stateRef = useRef(state);
  stateRef.current = state;
  const patch = useCallback((p: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => {
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  const commitElements = useCallback((updater: (els: DocElement[]) => DocElement[], label = '') => {
    setState((s) => ({
      ...s,
      elements: updater(s.elements),
      ...pushHistory(s, label),
    }));
  }, []);

  // Click-without-drag must not pollute undo/redo: beginElementEdit only *captures* a
  // snapshot of the doc as it was before the gesture; commitElementEdit pushes that
  // snapshot to history only if the gesture actually changed something. A bare click
  // (pointerdown immediately followed by pointerup, no pointermove in between) never
  // calls liveUpdateElements, so the doc is byte-for-byte identical and nothing is pushed.
  //
  // والاسمُ يُوضَع **هنا**، في أوّل الإيماءة: عند الإفلات لم يبقَ من يعرف أيّ
  // إيماءةٍ كانت — الحالةُ تقول «هذا مقطعٌ طولُه كذا» لا «قُلِّمت حافّتُه الأولى».
  const beginElementEdit = useCallback((label = '') => {
    setState((s) => (s.pendingEditSnapshot ? s : { ...s, pendingEditSnapshot: docOf(s), pendingEditLabel: label }));
  }, []);

  const commitElementEdit = useCallback(() => {
    setState((s) => {
      const before = s.pendingEditSnapshot;
      if (!before) return s;
      const changed = JSON.stringify(docOf(s)) !== JSON.stringify(before);
      if (!changed) return { ...s, pendingEditSnapshot: null, pendingEditLabel: null };
      return {
        ...s,
        pendingEditSnapshot: null,
        pendingEditLabel: null,
        historyPast: [...s.historyPast, before],
        historyLabels: [...s.historyLabels, s.pendingEditLabel ?? ''],
        historyFuture: [],
        historyFutureLabels: [],
        dirty: true,
      };
    });
  }, []);

  /** **يُلغي الإيماءةَ الجارية ويُعيد المستند إلى ما كان قبلها، ولا يُسجّل شيئًا.**
   *
   * هذا ما يَربطه زرُّ Escape أثناء السحب (`timeline.rs:2519-2546`, `:2681`): لا
   * نصفَ تقليمٍ يُثبَّت، ولا خطوةَ تراجعٍ تُدفَع فيُضطرّ المصمّم إلى تراجعٍ
   * ليُبطل إلغاءً. و`commitElementEdit` **لا تكفي** بديلًا: هي تقيس «أتغيّر
   * المستند؟» على الحالة الراهنة، والحالةُ الراهنة أثناء السحب **متغيّرةٌ فعلًا** —
   * فالإفلات بعدها كان سيدفع خطوةً صحيحةَ البنية خاطئةَ المعنى. */
  const cancelElementEdit = useCallback(() => {
    setState((s) => {
      const before = s.pendingEditSnapshot;
      if (!before) return s;
      return { ...s, ...before, pendingEditSnapshot: null, pendingEditLabel: null };
    });
  }, []);

  const liveUpdateElements = useCallback((updater: (els: DocElement[]) => DocElement[]) => {
    setState((s) => ({ ...s, elements: updater(s.elements) }));
  }, []);

  /** انظر `splitAtPlayhead` في عقد الأفعال أعلى الملفّ لِمَ النصفُ الأيمن هو
   * المحدَّد. ويُعرَّف هنا — لا داخل `actions` — لأنّ أثرَ لوحة المفاتيح
   * (`⌘B`) ينادِيه، وثباتُه مطلوبٌ لقائمة اعتماده. */
  const splitAtPlayhead = useCallback((id?: ElementId) => {
    setState((s) => {
      // مستندٌ ساكنٌ لا خطَّ زمنيَّ له، فلا تقسيمَ فيه — السطحُ **غائبٌ** لا
      // معطَّل (المرحلة ١، §4.2)، والاختصارُ يَتبع سطحَه.
      if (s.medium !== 'timed') return s;
      const targetId = id ?? s.sel;
      if (!targetId) return s;
      const result = splitAt(s.elements, targetId, s.t, { fps: s.fps, newId: newElementId });
      if (!result) return s;
      // النصفُ الأيمن محدَّدًا — ومع مجموعته إن كان في واحدة، كما يفعل كلُّ
      // تحديدٍ آخر في البرنامج (`expandGroups`).
      const members = expandGroups([result.rightId], result.elements);
      return {
        ...s,
        elements: result.elements,
        selectedIds: members,
        sel: members[0] ?? result.rightId,
        ...pushHistory(s, s.lang === 'ar' ? 'تقسيم المقطع' : 'Split clip'),
      };
    });
  }, []);

  const patchDoc = useCallback((p: Partial<Pick<StudioState, 'anim' | 'sizeIdx' | 'customW' | 'customH' | 'decorAccent'>> | ((s: StudioState) => Partial<Pick<StudioState, 'anim' | 'sizeIdx' | 'customW' | 'customH' | 'decorAccent'>>)) => {
    setState((s) => {
      const resolved = typeof p === 'function' ? p(s) : p;
      // The old global `anim` survives only as the document-level field templates and
      // the AI assistant still write. Mirror it onto the `'head'` clip when that
      // element exists — and mirror it **with its tracks rebuilt**, not just the
      // preset *name*: rendering reads `anim.tracks` and nothing else, so copying the
      // name alone (what this line used to do) left the picture unchanged while the
      // chooser lit up as if it had landed. Measured before the fix: `'head'`'s
      // computed transform at t=0.1s stayed `matrix(1,0,0,1,0,108)` — the 'slide'
      // value — after picking 'pop'.
      const elements = resolved.anim ? s.elements.map((e) => (e.id === 'head' ? { ...e, anim: withPreset(e.anim, resolved.anim!) } : e)) : s.elements;
      return { ...s, ...resolved, elements, ...pushHistory(s) };
    });
  }, []);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore the last autosaved document once on mount — without this, a real reload
  // would always discard every edit despite saveDoc() genuinely writing to disk.
  useEffect(() => {
    let cancelled = false;
    loadDoc().then((raw) => {
      if (cancelled) return;
      const file = migrateToDocFile(raw, 'ar');
      // لا ملفَّ محفوظًا (أو ملفٌّ لا يطابق أي شكلٍ معروف) = مستخدمٌ جديد: شاشة
      // البداية بلا بطاقة متابعة. تُسجَّل الحالة صراحةً لأن الشاشة تنتظرها.
      if (!file) {
        setState((s) => ({ ...s, openDoc: 'none' }));
        return;
      }
      const patchFromFile = loadedFileToState(file, loadedProjectId() ?? newProjectId());
      setState((s) => ({ ...s, ...patchFromFile }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the saved template library once on mount — a missing/corrupt file (every
  // app version before this feature, or a first run) resolves to an empty library,
  // same "never crash on an old/missing save" contract as `loadDoc` above.
  useEffect(() => {
    let cancelled = false;
    loadTemplates().then((list) => {
      if (!cancelled) setState((s) => ({ ...s, templates: list }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistTemplates = useCallback((list: Template[]) => {
    saveTemplates(list).catch(() => undefined);
  }, []);

  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  // Autosave: debounce 700ms after any doc mutation, then really persist to disk
  // (Tauri fs) or localStorage (browser), and reflect the true outcome in saveState.
  useEffect(() => {
    if (!state.dirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    patch({ saveState: 'saving' });
    saveTimerRef.current = setTimeout(() => {
      saveDoc({ artboards: allArtboardEntries(state), activeArtboardId: state.activeArtboardId }, state.projectId)
        .then(() => patch({ dirty: false, saveState: 'saved', savedAt: Date.now() }))
        .catch(() => patch({ saveState: 'error' }));
    }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.dirty, state.elements, state.anim, state.sizeIdx, state.customW, state.customH, state.decorAccent, state.artboards, state.artboardDocs, state.activeArtboardId]);

  // The playback timer is owned by an effect, never created inside a state updater:
  // StrictMode invokes updaters twice, so doing it there leaked a second interval that
  // nothing held a handle to — playback started but could never be stopped.
  // The clock advances by the **real elapsed wall time** between ticks, read from
  // `performance.now()`, instead of adding a fixed 0.033 per `setInterval(33)` tick.
  // Two measured reasons. (1) `setInterval(33)` never fires every 33ms — under the
  // re-render this very update causes it lands late, so the old loop ran the project
  // clock *slow*: 3.031s of project time per 3.069s and 3.081s of wall time across two
  // runs, i.e. −1.2% and −1.6%. A motion designer judging whether a 5s cut reads
  // correctly was being shown a 5.08s cut. (2) 0.033 ≠ 1/30, so even a perfect timer
  // accumulated 150 × 0.00033s ≈ 1.5 frames of error over one 5s pass. Elapsed-time
  // integration makes the preview match both the wall clock and the exported file,
  // whose frame times come from `i / fps` exactly.
  useEffect(() => {
    if (!state.playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      // يلتفّ عند نهاية **المدى المعروض** لا عند سقفٍ مثبَّت. ولِمَ المدى لا طولُ
      // المستند: المؤشّر يستطيع أن يقف في أيّ موضعٍ على المسطرة، فلو التفّ التشغيلُ
      // عند طولِ مستندٍ أقصرَ من المسطرة لكان ضغطُ «تشغيل» والمؤشّرُ في ذلك الفراغ
      // يَقفز إلى الصفر فورًا — مؤشّرٌ يَقِف حيث يرفض التشغيلُ أن يصل. والفراغُ
      // نفسُه **مُعلَنٌ لا مكتوم**: `Timeline` يُظلِّل ما بعد طولِ المستند ويقول في
      // تلميحه إنه خارج الملفّ المُصدَّر.
      //
      // والمدّةُ تُحتَسب من `cur` نفسها، فلا تجمد على ما كانت عليه لحظةَ بدء
      // التشغيل لو عُدِّل مقطعٌ أثناءه.
      patch((cur) => {
        const end = timelineSpan(documentDuration(cur.elements.map((el) => el.anim), cur.fps));
        return { t: cur.t + dt >= end ? 0 : cur.t + dt };
      });
    }, 16);
    tickRef.current = id;
    return () => {
      clearInterval(id);
      if (tickRef.current === id) tickRef.current = null;
    };
  }, [state.playing, patch]);

  /** Play/pause. Play **resumes from the playhead** and only rewinds to zero when the
   * playhead is already at (or past) the end — the behaviour every editor has, and the
   * thing that makes checking just the last second of a clip possible. It used to
   * force `t: 0` unconditionally, so parking at 3.000s and pressing play jumped
   * straight back to 0.132s (measured): on a 5s piece the only way to look at the
   * ending was to sit through the whole thing. */
  const togglePlay = useCallback(() => {
    setState((s) => {
      if (s.playing) return { ...s, playing: false };
      const atEnd = s.t >= timelineSpan(documentDuration(s.elements.map((el) => el.anim), s.fps)) - frameDuration(s.fps);
      return { ...s, playing: true, t: atEnd ? 0 : s.t };
    });
  }, []);

  /** **بابٌ واحد لكلّ أوامر اللوحة — نقرًا أو بـEnter.** كان للنقر مسارٌ لا يمرّ بالمُوَدِّع
   * (`armTool`) وللـEnter مسارٌ يمرّ به، فـ«إضافة نص» بالنقر تُبقي التحديد ومسودّةَ القلم
   * وبالـEnter لا. والأمرُ الذي لا تكفيه رُقعةُ حالة (`act`) يمرّ بإجراءات البرنامج نفسها
   * بعد إغلاق اللوحة — فـ«تغيير المقاس» يشتقّ طبيعة المستند كما يفعل منتقي المقاس. */
  const runCmd = useCallback((c: (typeof CMDS)[number]) => {
    setState((s) => {
      const result = c.run(s);
      const { doc, rest } = splitDocPatch(result);
      const hasDoc = Object.keys(doc).length > 0;
      // **لوحةُ الأوامر بابٌ ثالثٌ يُسلِّح أداة.** «إضافة نص» تُرجِع
      // `{ tool: 'text', panel: 'props' }` (`data/constants.ts`)، فتصل
      // الأداةُ إلى الحالة **بدمجِ رُقعةٍ** لا بنداء `setTool` — فكانت تَعبُر
      // المُوَدِّعَ من تحته: تُسلَّح الأداةُ ويبقى التحديدُ، وتبقى مسودّةُ
      // القلم. والقاعدةُ واحدةٌ لفعلٍ واحد: ما سلَّح أداةً يَعبُر `armTool`،
      // من أيّ بابٍ جاء — وإلّا صار للبرنامج سلوكان لأمرٍ واحد.
      const armed = typeof rest.tool === 'string' && rest.tool !== s.tool ? armTool(s, rest.tool as StudioState['tool']) : s;
      return {
        ...armed,
        ...rest,
        ...doc,
        cmdOpen: false,
        cmdQuery: '',
        cmdSel: 0,
        // اللقطةُ من `armed` لا من `s`: لو كان المُوَدِّعُ قد أثبت مسودّةَ
        // قلمٍ فقد دفع خطوتَه بنفسه، فلقطةٌ محسوبةٌ على الحالة الأصليّة
        // كانت ستَكتب فوق تلك الخطوة وتُفقِد المسارَ المُثبَّت من السجلّ.
        // و«قبلَ التغيير» الصحيحةُ لأمرِ المستند هي الحالةُ بعد الإثبات.
        ...(hasDoc ? pushHistory(armed) : {}),
      };
    });
    c.act?.(mcpActionsRef.current);
  }, []);

  // بند #24-ب حرفيًا هنا أيضًا، لا نسخةً مزيّفة منه خاصّة بهذا اللوح: نفس
  // `interpretAndRun` الذي يستدعيه `CommandInterpreterDialog.tsx` حقيقةً، على
  // نفس ctx المرجعيّ المُحدَّث كلَّ تصيير (`mcpStateRef`/`mcpLiveActionsRef` أدناه
  // — موجودان أصلًا لجسر MCP لحاجةٍ مطابقة: "الحالة/الأفعال الحاليّة وقت وصول
  // الأمر، لا لقطةٌ من لحظة الإنشاء"). لا تأخيرَ مصطنعًا (`setTimeout`) ولا ردًّا
  // مُخمَّنًا بمطابقة كلمات: `aiTyping` ينعكس الآن على انتظارٍ حقيقيٍّ لوعدٍ حقيقي،
  // والردُّ هو نصُّ `interpretAndRun` نفسه — بما فيه مسار "لم أفهم" الصادق.
  const llmAbortRef = useRef<AbortController | null>(null);
  const sendAi = useCallback(
    (text?: string) => {
      const txt = (text ?? '').trim();
      if (!txt) return;
      const st = mcpStateRef.current;
      if (st.aiTyping) return;
      patch((s) => ({ aiMsgs: [...s.aiMsgs, { role: 'u' as const, text: txt }], aiInput: '', aiTyping: true }));
      const reply = (t: string) => patch((s) => ({ aiMsgs: [...s.aiMsgs, { role: 'a' as const, text: t }], aiTyping: false }));
      const ar = st.lang === 'ar';

      if (st.aiEngine === 'local') {
        const ctx: McpCtx = { getState: () => mcpStateRef.current, actions: mcpLiveActionsRef.current };
        interpretAndRun(txt, ctx).then((outcome) => reply(ar ? outcome.messageAr : outcome.messageEn));
        return;
      }

      // ChatGPT أو Claude بمفتاح المستخدم: من الجهاز إلى المزوّد مباشرةً، والأدواتُ
      // تُنفَّذ هنا على المستند الحيّ (`llmAgent.ts`).
      if (st.aiEngine === 'openai' || st.aiEngine === 'anthropic') {
        const provider = st.aiEngine;
        const abort = new AbortController();
        llmAbortRef.current = abort;
        void (async () => {
          try {
            const key = await loadApiKey(LLM_PROVIDERS[provider].keyId);
            if (!key) {
              reply(ar ? `أضف مفتاح ${LLM_PROVIDERS[provider].label} أول من إعدادات مِزو.` : `Add your ${LLM_PROVIDERS[provider].label} key in Mizo settings first.`);
              return;
            }
            const ctx: McpCtx = { getState: () => mcpStateRef.current, actions: mcpLiveActionsRef.current };
            const text = await runLlm({
              provider,
              apiKey: key,
              model: loadModel(provider),
              system: agentSystemPrompt(st.lang, st.selectedIds),
              history: st.aiMsgs,
              prompt: txt,
              ctx,
              lang: st.lang,
              signal: abort.signal,
            });
            reply(text || (ar ? 'تم.' : 'Done.'));
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') reply(ar ? 'وقّفت.' : 'Stopped.');
            else if (err instanceof TypeError) reply(ar ? 'ما فيه اتصال بالنت — تأكّد من الشبكة.' : 'No connection — check your network.');
            else reply(err instanceof Error ? err.message : String(err));
          } finally {
            if (llmAbortRef.current === abort) llmAbortRef.current = null;
          }
        })();
        return;
      }

      // وكيلٌ خارجيّ: يحتاج خادمَ MCP المحلّيّ وجسرَ النافذة. إن لم يكن المستخدم قد
      // شغّله بنفسه شغّلناه لهذا الطلب وحده، ثم أطفأناه — كي لا يبقى منفذٌ مفتوح لم يطلبه.
      const engine = st.aiEngine as 'claude' | 'codex' | 'custom';
      void (async () => {
        let startedHere = false;
        try {
          const now = mcpStateRef.current;
          if (!now.mcpServerEnabled || !now.mcpToken) {
            const info = await startMcpServer();
            startedHere = true;
            patch({ mcpServerEnabled: true, mcpToken: info.token, mcpError: null });
          }
          const r = await runAgent(engine, txt, agentSystemPrompt(st.lang, mcpStateRef.current.selectedIds), mcpStateRef.current.aiCustomCmd);
          reply(r.text || (r.ok ? (ar ? 'تم.' : 'Done.') : ar ? 'لم يُكمل الوكيلُ الطلب.' : 'The agent did not finish.'));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          reply(ar ? `تعذّر التنفيذ: ${msg}` : `Couldn't run it: ${msg}`);
        } finally {
          if (startedHere) {
            patch({ mcpServerEnabled: false, mcpToken: null });
            void stopMcpServer().catch(() => {});
          }
        }
      })();
    },
    [patch],
  );

  const setAiEngine = useCallback((engine: AiEngine) => {
    saveAiPrefs({ engine });
    patch({ aiEngine: engine });
  }, [patch]);

  const setAiCustomCmd = useCallback((cmd: string) => {
    saveAiPrefs({ customCmd: cmd });
    patch({ aiCustomCmd: cmd });
  }, [patch]);

  const cancelAi = useCallback(() => {
    llmAbortRef.current?.abort();
    void cancelAgent();
  }, []);

  const detectAiAgents = useCallback(() => {
    void detectAgents()
      .then((agents) => {
        patch(() => {
          // أوّلُ تشغيل: لم يختر المستخدم محرّكًا بعد، وClaude مثبّت — فهو الافتراضيّ.
          const chosen = loadAiPrefs().engine;
          const claude = agents.find((a) => a.id === 'claude' && a.path);
          return { aiAgents: agents, ...(chosen === undefined && claude ? { aiEngine: 'claude' as const } : {}) };
        });
      })
      .catch(() => patch({ aiAgents: [] }));
  }, [patch]);

  // مكتبةُ خطوط المستعمل: تُقرأ مرّةً عند البدء وتُسجَّل كلُّها، كما تُقرأ القوالب. وخطٌّ
  // تعذّر تسجيلُه يبقى في القائمة بخطئه لا يختفي — ولا يُحذَف من الملف.
  useEffect(() => {
    let cancelled = false;
    loadUserFonts().then(async (list) => {
      const entries: FontEntry[] = [];
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        let status: FontEntry['status'] = 'ready';
        let error: string | undefined;
        try {
          await registerUserFont(f);
        } catch (err) {
          status = 'error';
          error = err instanceof Error ? err.message : String(err);
        }
        entries.push({ id: -(i + 1), name: f.name, family: f.family, status, error, custom: true, user: true, system: !f.dataUrl });
      }
      if (!cancelled && entries.length) setState((s) => ({ ...s, fonts: [...entries, ...s.fonts.filter((x) => !entries.some((e) => e.family === x.family))] }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** يضيف خطًّا إلى المكتبة المحفوظة (يُقرأ الملفُّ من جديد كي لا تُطمَس إضافةٌ من نافذةٍ
   * أخرى) ثم إلى القائمة، ويطبّقه على النصّ المحدَّد. */
  const adoptUserFont = useCallback(async (font: UserFont) => {
    const saved = await loadUserFonts();
    await saveUserFonts([...saved.filter((f) => f.family !== font.family), font]).catch(() => undefined);
    setState((s) => {
      const entry: FontEntry = { id: Date.now(), name: font.name, family: font.family, status: 'ready', custom: true, user: true, system: !font.dataUrl };
      const sel = s.elements.find((e) => e.id === s.selectedIds[0]);
      const apply = s.selectedIds.length === 1 && sel?.type === 'text' && !sel.locked;
      return {
        ...s,
        fonts: [entry, ...s.fonts.filter((f) => f.family !== font.family)],
        fontError: null,
        ...(apply
          ? { elements: s.elements.map((e) => (e.id === sel!.id && e.type === 'text' ? { ...e, fontFamily: font.family } : e)), ...pushHistory(s, (s.lang === 'ar' ? AR : EN).undo_font) }
          : {}),
      };
    });
  }, []);

  const addFontFromFile = useCallback(async () => {
    try {
      const picked = await pickFontFile();
      if (!picked) return;
      const taken = new Set(stateRef.current.fonts.map((f) => f.family));
      await adoptUserFont(await fontFromBytes(picked.bytes, picked.name, taken));
    } catch (err) {
      patch({ fontError: err instanceof Error ? err.message : String(err) });
    }
  }, [adoptUserFont, patch]);

  const addSystemFont = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n) return;
      const L = stateRef.current.lang === 'ar' ? AR : EN;
      if (!isFontInstalled(n)) {
        patch({ fontError: L.font_not_installed(n) });
        return;
      }
      void adoptUserFont({ name: n, family: cssFamilyOf(n) });
    },
    [adoptUserFont, patch],
  );

  const removeUserFont = useCallback((family: string) => {
    void loadUserFonts().then((saved) => saveUserFonts(saved.filter((f) => f.family !== family)).catch(() => undefined));
    setState((s) => ({ ...s, fonts: s.fonts.filter((f) => !(f.user && f.family === family)) }));
  }, []);

  const addFont = useCallback(() => {
    const url = state.fontUrl.trim();
    if (!url) return;
    let name = 'Custom';
    try {
      name = decodeURIComponent((url.split('/').pop() || '').split('?')[0].replace(/\.(ttf|otf|woff2?)$/i, '')) || 'Custom';
    } catch {
      // leave fallback name
    }
    const id = Date.now();
    const family = `${name.replace(/[^a-zA-Z0-9]+/g, '') || 'Custom'}-${id}`;
    patch((s) => ({ fonts: [{ id, name, family, status: 'loading' as const, custom: true }, ...s.fonts], fontUrl: '' }));
    fetchAndRegisterFont(url, family)
      .then(async (loaded) => {
        patch((s) => ({ fonts: s.fonts.map((f) => (f.id === id ? { ...f, status: 'ready' as const, user: true } : f)) }));
        // ويُحفَظ ببايتاته في مكتبة الخطوط: كان يضيع عند أوّل إعادة تشغيل.
        const ext = (url.split('?')[0].split('.').pop() ?? 'ttf').toLowerCase();
        let binary = '';
        for (let i = 0; i < loaded.bytes.length; i += 0x8000) binary += String.fromCharCode(...loaded.bytes.subarray(i, i + 0x8000));
        const saved = await loadUserFonts();
        await saveUserFonts([...saved.filter((f) => f.family !== family), { name, family, dataUrl: `data:font/${ext};base64,${btoa(binary)}` }]).catch(() => undefined);
      })
      .catch((err: Error) => {
        patch((s) => ({ fonts: s.fonts.map((f) => (f.id === id ? { ...f, status: 'error' as const, error: err.message } : f)) }));
      });
  }, [patch, state.fontUrl]);

  /** انظر `traceImage` في `StudioActions`. الحسابُ في عاملٍ خلفيّ (`imageTraceDoc.ts`)،
   * والوحدةُ نفسها تُحمَّل عند أوّل استعمال لا مع البرنامج. والعناصر تُبنى **خارج**
   * مُحدِّث الحالة: مُحدِّثٌ يُنادى مرّتين (وضع React الصارم) كان سيصنع معرّفاتٍ
   * مختلفةً في كلّ مرّة، فتُخبر النتيجةُ عن عناصرَ غيرِ التي في المستند. */
  const traceImage = useCallback(async (id?: ElementId, opts?: TraceOptions): Promise<TraceOutcome> => {
    const s = stateRef.current;
    const L = s.lang === 'ar' ? AR : EN;
    const traceable = (e: DocElement | undefined): e is ImageElement => !!e && e.type === 'image' && !!e.src;
    let target: ImageElement | undefined;
    if (id) {
      const e = s.elements.find((x) => x.id === id);
      target = traceable(e) ? e : undefined;
    } else {
      // أعلى صورةٍ في المحدَّد، وإلّا أعلى صورةٍ ظاهرة في المستند: الأمرُ من لوحة البحث أو
      // من مِزو لا يصمت لأن المحدَّد نصّ.
      const selected = s.selectedIds.map((sid) => s.elements.find((x) => x.id === sid)).filter(traceable);
      const pool = selected.length ? selected : s.elements.filter((e): e is ImageElement => traceable(e) && e.visible !== false);
      target = pool.sort((a, b) => s.elements.indexOf(b) - s.elements.indexOf(a))[0];
    }
    if (!target) return { ok: false, reason: 'no-image', message: L.trace_no_image };
    if (s.traceBusyId) return { ok: false, reason: 'busy', message: L.trace_busy };
    const imageId = target.id;
    patch({ traceBusyId: imageId, traceError: null });
    try {
      const { traceImageElement, tracedElements } = await import('../lib/imageTraceDoc');
      const run = await traceImageElement(target, sizeAt(s.sizeIdx, s.customW, s.customH), opts);
      const now = stateRef.current;
      const img = now.elements.find((e) => e.id === imageId);
      if (!img || img.type !== 'image') throw new Error('gone');
      const groupId = newGroupId();
      const made = tracedElements(run.result, run.placement, { groupId, opacity: img.opacity, anim: img.anim, backgroundName: L.trace_bg_name, frameRadius: img.radius });
      if (!made.length) throw new Error('empty');
      setState((st) => {
        const at = st.elements.findIndex((e) => e.id === imageId);
        if (at < 0) return { ...st, traceBusyId: null };
        const cur = st.elements[at];
        const elements = [...st.elements.slice(0, at), { ...cur, visible: false }, ...made, ...st.elements.slice(at + 1)];
        return {
          ...st,
          elements,
          selectedIds: made.map((e) => e.id),
          sel: made[0].id,
          cropEditingId: st.cropEditingId === imageId ? null : st.cropEditingId,
          traceBusyId: null,
          traceError: null,
          ...pushHistory(st, L.trace_btn),
        };
      });
      return { ok: true, imageId, groupId, ids: made.map((e) => e.id), colors: run.result.palette, anchors: run.result.stats.anchors, ms: run.result.stats.ms };
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const reason = code === 'decode' ? 'decode' : code === 'empty' ? 'empty' : 'failed';
      const message = reason === 'decode' ? L.trace_err_decode : reason === 'empty' ? L.trace_err_empty : L.trace_err_failed;
      patch({ traceBusyId: null, traceError: { id: imageId, message } });
      return { ok: false, reason, message };
    }
  }, [patch]);

  const startExport = useCallback(() => {
    const ids = Object.entries(state.targets)
      .filter(([, on]) => on)
      .map(([id]) => id);
    // في وضع «كل لوحة بمقاسها» لا تُقرأ قائمة المقاسات أصلًا، فاشتراطُ اختيار مقاسٍ
    // فيه كان سيمنع التصدير الوحيد الذي لا يحتاج مقاسًا مختارًا.
    const ownSize = state.exportAllArtboards && state.exportArtboardOwnSize && state.artboards.length > 1;
    if (!ids.length && !ownSize) return;

    const isVideo = state.exportFormat === 'mp4' || state.exportFormat === 'gif';
    const isLivePhoto = state.exportFormat === 'livephoto';
    // The sidecar that encodes mp4/gif/livephoto only exists inside the built
    // Tauri app — in the plain browser preview there is no process to shell out
    // to, so this stays an honest "unavailable" rather than a fake success.
    if ((isVideo || isLivePhoto) && !hasDesktopSidecars) {
      patch({ exportState: 'unavailable', exportError: null });
      return;
    }

    patch({ exportState: 'busy', exportProgress: 0, exportError: null, exportedPaths: [], exportResults: [] });

    // Roadmap #16: "export all artboards" reuses this exact per-size batch loop,
    // just wrapped in an outer loop over artboards — each artboard contributes its
    // own doc/palette instead of reading `state` directly, so the default
    // (single-artboard) path below is byte-for-byte the same computation as before
    // this roadmap item existed (a one-item array built from the live active state).
    const multiArtboard = state.exportAllArtboards && state.artboards.length > 1;
    const exportArtboards: PersistedArtboard[] = multiArtboard
      ? allArtboardEntries(state)
      : [{ id: state.activeArtboardId, name: state.artboards.find((a) => a.id === state.activeArtboardId)?.name ?? '', paletteIdx: state.postPalette, doc: docOf(state) }];

    (async () => {
      const paths: string[] = [];
      const results: ExportResult[] = [];
      // في وضع «كل لوحة بمقاسها» الحلقة الداخلية تدور مرّةً واحدة لكل لوحة، وقيمتها
      // علامةٌ (`OWN`) لا معرّفَ مقاس — فتبقى الحلقتان كما هما ولا ينشأ مسار تصديرٍ
      // ثانٍ يجب أن يبقى مطابقًا للأول.
      const OWN = '__own__';
      const innerIds = ownSize ? [OWN] : ids;
      const totalSteps = innerIds.length * exportArtboards.length;
      let step = 0;
      for (const ab of exportArtboards) {
        for (const id of innerIds) {
          // 'custom' isn't in the SIZES presets — it reads the artboard's own
          // user-typed custom width/height (same values ArtboardSizeMenu writes).
          const size =
            id === OWN || id === 'custom'
              ? sizeAt(id === OWN ? ab.doc.sizeIdx : CUSTOM_SIZE_IDX, ab.doc.customW, ab.doc.customH)
              : SIZES.find((z) => z.id === id);
          if (!size) {
            step++;
            continue;
          }
          const resultId = id === OWN ? ab.id : multiArtboard ? `${ab.id}__${id}` : id;
          // باسم اللوحة وحده: المقاس هو مقاسها، فإلحاق اسم مقاسٍ مختار كان سيوحي
          // بأن هناك خيارًا ثانيًا لم يكن.
          const label = id === OWN ? ab.name : multiArtboard ? `${ab.name} · ${nameOf(size, state.lang)}` : nameOf(size, state.lang);
          try {
            const palette = PALETTES[ab.paletteIdx];
            // Roadmap #8: the same heuristic engine the live "apply size" action uses
            // (`magicResizeElements`), reused per batch target — each target's layout
            // is computed independently from the document's *current* size, never
            // chained target-to-target, so the result doesn't depend on target order.
            const sourceSize = sizeAt(ab.doc.sizeIdx, ab.doc.customW, ab.doc.customH);
            const elements = state.exportMagicResize && (size.w !== sourceSize.w || size.h !== sourceSize.h) ? magicResizeElements(ab.doc.elements, sourceSize, size) : ab.doc.elements;
            const common = {
              size,
              palette,
              elements,
              transparent: state.exportTransparent,
              lang: state.lang,
              // من **مستند اللوحة** لا من حالة التصدير: الزخرفة صفةُ مستندٍ، وكل
              // لوحةٍ في مشروعٍ متعدّد اللوحات تملك جوابها الخاص.
              decorAccent: ab.doc.decorAccent,
            };

            // **طولُ هذه اللوحة بعينها**، مشتقًّا من مقاطعها. كلُّ لوحةٍ في مشروعٍ
            // متعدّد اللوحات تملك طولها، فقراءةُ طولِ النشطة للكلّ كانت ستُصدِّر
            // لوحةً بطولِ أخرى.
            const abDuration = documentDuration(ab.doc.elements.map((el) => el.anim), ab.doc.fps ?? DEFAULT_DOC_FPS);
            let path: string;
            let pairedMovPath: string | undefined;
            if (isLivePhoto) {
              const { exportLivePhoto } = await import('../lib/livePhotoExport');
              const result = await exportLivePhoto(
                { ...common, scale: state.exportScale },
                state.t,
                LIVE_PHOTO_DEFAULT_DURATION,
                state.exportQuality,
                `mazij-livephoto-${resultId}-${Date.now()}`,
                (fraction) => patch({ exportProgress: ((step + fraction) / totalSteps) * 100 }),
                abDuration,
              );
              // Reveal-folder/result-list plumbing below only carries one path per
              // target — the still JPEG's containing folder also holds the paired
              // MOV (same basename, different extension), so pointing "open folder"
              // at the still reveals both files together.
              path = result.stillPath;
              // Carried separately so the result row can offer "add to Photos",
              // which needs both halves: the pair only becomes a Live Photo once a
              // photo library pairs them (see `addLivePhotoToPhotos`).
              pairedMovPath = result.movPath;
            } else if (isVideo) {
              const fmt = state.exportFormat as 'mp4' | 'gif';
              const { exportVideoTarget } = await import('../lib/videoExport');
              path = await exportVideoTarget(
                // الفيديو بدقّة اللوحة نفسها — انظر `effectiveExportScale`.
                { ...common, scale: effectiveExportScale(fmt, state.exportScale), transparent: fmt === 'gif' && state.exportTransparent },
                {
                  format: fmt,
                  fps: state.exportFps,
                  quality: state.exportQuality,
                  transparent: fmt === 'gif' && state.exportTransparent,
                  durationSeconds: abDuration,
                  shutter: { samplesPerFrame: state.exportShutterSamples, angle: DEFAULT_SHUTTER_ANGLE },
                },
                `mazij-${resultId}-${Date.now()}.${fmt}`,
                (fraction) => patch({ exportProgress: ((step + fraction) / totalSteps) * 100 }),
              );
            } else {
              let finalBlob: Blob;
              let ext: string;
              if (state.exportFormat === 'svg') {
                // `renderArtboardSvg` stays synchronous — the real HarfBuzz curve
                // shaping (`shapeTextOnCurve`, roadmap #12) is async/WASM, so it's
                // resolved here first and handed in via `curvedTextCmds`.
                const dir = state.lang === 'ar' ? 'rtl' : 'ltr';
                const curvedTextCmds: Record<string, Awaited<ReturnType<typeof shapeTextOnCurve>>> = {};
                for (const curvedEl of elements) {
                  if (curvedEl.type !== 'text' || !curvedEl.pathId) continue;
                  const pathShapeEl = elements.find((m): m is DocElement & { type: 'shape' } => m.id === curvedEl.pathId && m.type === 'shape');
                  if (!pathShapeEl) continue;
                  try {
                    curvedTextCmds[curvedEl.id] = await shapeTextOnCurve(curvedEl, pathShapeEl, size, dir);
                  } catch {
                    // Unsupported (non-built-in) font — that element falls back to its
                    // plain flat <text> rendering inside renderArtboardSvg.
                  }
                }
                // Roadmap #18 — same "resolve the async HarfBuzz work here, hand the
                // result in" pattern as `curvedTextCmds` just above.
                const justifiedTexts: Record<string, string> = {};
                for (const jEl of elements) {
                  if (jEl.type !== 'text' || !jEl.justify || jEl.pathId) continue;
                  const fontPx = (jEl.fontSize / 1080) * size.w;
                  const bw = jEl.geo.w * size.w;
                  try {
                    justifiedTexts[jEl.id] = await justifySvgTextElement(jEl, fontPx, bw, dir);
                  } catch {
                    // Non-built-in font — falls back to its plain el.text, same limit.
                  }
                }
                finalBlob = renderArtboardSvg({ ...common, curvedTextCmds, justifiedTexts });
                ext = 'svg';
              } else {
                const pngBlob = await renderArtboardPng({ ...common, scale: state.exportScale });
                if (state.exportFormat === 'jpg') {
                  finalBlob = await new Promise<Blob>((resolve, reject) => {
                    const img = new Image();
                    const objUrl = URL.createObjectURL(pngBlob);
                    img.onload = () => {
                      const c = document.createElement('canvas');
                      c.width = img.width;
                      c.height = img.height;
                      const cx = c.getContext('2d');
                      if (!cx) return reject(new Error('canvas 2D context'));
                      cx.fillStyle = '#ffffff';
                      cx.fillRect(0, 0, c.width, c.height);
                      cx.drawImage(img, 0, 0);
                      c.toBlob((b) => (b ? resolve(b) : reject(new Error('jpg encode failed'))), 'image/jpeg', state.exportQuality === 'high' ? 0.92 : 0.7);
                      URL.revokeObjectURL(objUrl);
                    };
                    img.onerror = () => reject(new Error('image decode failed'));
                    img.src = objUrl;
                  });
                  ext = 'jpg';
                } else {
                  finalBlob = pngBlob;
                  ext = 'png';
                }
              }
              const fileName = `mazij-${resultId}-${Date.now()}.${ext}`;
              path = await saveExportedFile(fileName, finalBlob);
            }
            paths.push(path);
            // SVG متجهيّ فلا أبعاد بكسل له؛ كل ما سواه يُكتب بمضاعِف `exportScale`.
            const outPx = state.exportFormat === 'svg' ? {} : { outW: size.w * state.exportScale, outH: size.h * state.exportScale };
            results.push({ id: resultId, label, w: size.w, h: size.h, ...outPx, ok: true, path, ...(pairedMovPath ? { pairedMovPath } : {}), ...(multiArtboard ? { artboardId: ab.id, artboardName: ab.name } : {}) });
          } catch (err) {
            // One failing size must not abort the rest of the batch — each target is
            // independent, so the result list can show a real per-file mix of successes
            // and failures instead of losing everything to the first error.
            results.push({ id: resultId, label, w: size.w, h: size.h, ok: false, error: err instanceof Error ? err.message : String(err), ...(multiArtboard ? { artboardId: ab.id, artboardName: ab.name } : {}) });
          }
          step++;
          patch({ exportProgress: (step / totalSteps) * 100, exportResults: [...results] });
        }
      }
      const anyOk = results.some((r) => r.ok);
      patch({ exportState: anyOk ? 'done' : 'error', exportProgress: 100, exportedPaths: paths, exportResults: results, exportError: anyOk ? null : (results[0]?.error ?? null) });
    })();
  }, [
    patch,
    state.targets,
    state.exportFormat,
    state.postPalette,
    state.elements,
    state.exportTransparent,
    state.exportScale,
    state.exportQuality,
    state.exportFps,
    state.exportShutterSamples,
    state.lang,
    state.sizeIdx,
    state.customW,
    state.customH,
    state.exportMagicResize,
    state.t,
    state.exportAllArtboards,
    state.exportArtboardOwnSize,
    state.artboards,
    state.artboardDocs,
    state.activeArtboardId,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        patch((s) => ({ cmdOpen: !s.cmdOpen, cmdQuery: '', cmdSel: 0 }));
      } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyB' && !e.shiftKey && !e.altKey) {
        // **⌘B — تقسيمٌ عند المؤشّر، والنصفُ الأيمن محدَّد.**
        //
        // المطابقةُ على `e.code` لا `e.key`، للسبب المقيس في `Stage.tsx`: تحت لوحة
        // مفاتيح عربيّة يصير `e.key` حرفًا عربيًّا ويبقى `e.code` على `KeyB` —
        // فالربطُ بـ`e.key` كان سيشحن اختصارًا يعمل بالإنجليزيّة وحدها، وهذا
        // برنامجٌ عربيٌّ أوّلًا.
        //
        // وحقلُ نصٍّ تحت المؤشّر يَملك مفتاحَه: `⌘B` في محرّرِ نصٍّ تعني «عريض».
        // الشرطُ نفسُه الذي يَستعمله `Stage.tsx:1262`.
        const t = e.target;
        const editable = t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (editable) return;
        e.preventDefault();
        splitAtPlayhead();
      } else if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === 'KeyZ') {
        // **`e.code` لا `e.key`** — القاعدة نفسها المكتوبة على كلّ اختصارٍ آخر في البرنامج،
        // وكان ⌘Z وحده خارجها: تحت لوحة مفاتيح عربيّة يصير `e.key` حرفًا عربيًّا («ئ» في
        // Arabic PC)، فلا تراجعَ ولا إعادةَ بالكيبورد لمن يكتب عربيًّا — وهو جمهور البرنامج.
        //
        // **والنصّ قيد التحرير يملك ⌘Z نفسه:** تراجعُ المتصفّح الأصليّ يمحو ما كُتب للتوّ.
        // كان يُنفَّذ تراجعُ المستند بدلًا منه — فمن وضع نصًّا بأداة النصّ وكتب ثم ضغط ⌘Z
        // ليصلح حرفًا، تراجع عن **إنشاء** النصّ نفسه فاختفى الصندوق وهو يكتب فيه.
        if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
        e.preventDefault();
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
      } else if (e.key === 'Escape') {
        // **Esc يسكّر أيّ حوارٍ مفتوح** — لا التصدير ولوحة الأوامر وحدهما. كانت القوالب
        // واللوحات ومِزو-التوليد والنماذج المحلّيّة وMCP وغيرها لا تُغلَق إلا بزرّ ✕
        // (جولة الاستخدام: Esc على «لوحات التصميم» لا يفعل شيئًا). وحقلٌ داخل الحوار عالج
        // Escape بنفسه (`preventDefault` — إلغاءُ إعادة تسمية مثلًا) يبقى الحوارُ معه مفتوحًا.
        const dialogs = e.defaultPrevented
          ? {}
          : { templatesOpen: false, artboardsOpen: false, localModelsOpen: false, refVideoOpen: false, cmdInterpreterOpen: false, mcpOpen: false, aiGenOpen: false };
        if (!e.defaultPrevented && mcpStateRef.current.aiGenOpen) aiGenAbortRef.current?.abort();
        patch({ cmdOpen: false, exportOpen: false, exportState: 'idle', cropEditingId: null, ...dialogs });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [patch, splitAtPlayhead]);

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.historyPast.length) return s;
      const prev = s.historyPast[s.historyPast.length - 1];
      // الاسمُ يسافر مع الخطوة في الاتجاهين: ما تراجعتَ عنه هو ما تُعيده الإعادة،
      // فاسمُه واحد ولا يُعاد تخمينُه.
      const label = s.historyLabels[s.historyPast.length - 1] ?? '';
      return {
        ...s,
        ...prev,
        ...stillSettled(prev),
        historyPast: s.historyPast.slice(0, -1),
        historyLabels: s.historyLabels.slice(0, -1),
        historyFuture: [docOf(s), ...s.historyFuture],
        historyFutureLabels: [label, ...s.historyFutureLabels],
        dirty: true,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.historyFuture.length) return s;
      const [next, ...rest] = s.historyFuture;
      const [label = '', ...restLabels] = s.historyFutureLabels;
      return {
        ...s,
        ...next,
        ...stillSettled(next),
        historyPast: [...s.historyPast, docOf(s)],
        historyLabels: [...s.historyLabels, label],
        historyFuture: rest,
        historyFutureLabels: restLabels,
        dirty: true,
      };
    });
  }, []);

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  }, [undo, redo]);

  const patchTextEl = useCallback(
    (id: ElementId, p: Partial<TextElement>) => {
      commitElements((els) => els.map((e) => (e.id === id && e.type === 'text' ? { ...e, ...p } : e)));
    },
    [commitElements],
  );

  /** `fillPlaceholder` يفصل سؤالين كانا ملتصقين في وسيطٍ واحد: **أين أشار
   * المصمّم** (`dropPointPx`) و**هل يملأ هذا الاستيرادُ خانةَ الصورة الفارغة في
   * المستند بدل أن يضيف عنصرًا**. كانا واحدًا لأن الإفلات وحده كان يحمل نقطة،
   * فصار «بلا نقطة» مرادفًا لـ«املأ الخانة». ولمّا صارت نقرة أداة «صورة» تحمل
   * نقطتها هي الأخرى (انظر `Stage.tsx`) انفكّ الترادف: النقرة تحمل موضعًا
   * **وتملأ الخانة** إن وُجدت، والإفلات يضيف عنصرًا جديدًا عند نقطته كما كان. */
  const insertLoadedImage = useCallback(
    (loaded: LoadedImage, dropPointPx?: { x: number; y: number }, fillPlaceholder = !dropPointPx) => {
      setState((s) => {
        const size = sizeAt(s.sizeIdx, s.customW, s.customH);
        const aspect = loaded.naturalH / loaded.naturalW;
        const placeholder = s.elements.find((e) => e.type === 'image' && (e as { placeholder?: boolean }).placeholder);
        let elements: DocElement[];
        let newId: ElementId;
        if (placeholder && fillPlaceholder) {
          newId = placeholder.id;
          elements = s.elements.map((e) =>
            e.id === placeholder.id && e.type === 'image'
              ? { ...e, src: loaded.dataUrl, placeholder: false, naturalW: loaded.naturalW, naturalH: loaded.naturalH, geo: { ...e.geo, h: (e.geo.w * size.w * aspect) / size.h } }
              : e,
          );
        } else {
          newId = newElementId('image');
          const wFrac = 0.34;
          const hFrac = (wFrac * size.w * aspect) / size.h;
          const xFrac = dropPointPx ? clamp(dropPointPx.x / size.w - wFrac / 2, 0, 1 - wFrac) : (1 - wFrac) / 2;
          const yFrac = dropPointPx ? clamp(dropPointPx.y / size.h - hFrac / 2, 0, 1 - hFrac) : (1 - hFrac) / 2;
          const el: DocElement = {
            id: newId,
            type: 'image',
            visible: true,
            locked: false,
            opacity: 100,
            geo: { x: xFrac, y: yFrac, w: wFrac, h: hFrac, rotation: 0 },
            src: loaded.dataUrl,
            fit: 'cover',
            ...DEFAULT_IMAGE_CROP,
            flipH: false,
            flipV: false,
            radius: 0.06,
            stroke: null,
            strokeWidth: 0,
            maskId: null,
            naturalW: loaded.naturalW,
            naturalH: loaded.naturalH,
            anim: defaultAnim('none', 0, 0.6),
          };
          elements = [...s.elements, el];
        }
        return {
          ...s,
          elements,
          selectedIds: [newId],
          sel: newId,
          ...pushHistory(s),
        };
      });
    },
    [],
  );

  /** `clickPointPx` هو موضع نقرة المصمّم على اللوحة. كان يُهمَل، فتهبط كلُّ صورةٍ
   * في وسط اللوحة مهما نُقر — وبوستٌ فيه ثلاث صور يصير ثلاثَ صورٍ مكدّسةٍ في
   * المنتصف. انظر `qa/image-placement.spec.mjs`. */
  const insertImageTool = useCallback(async (clickPointPx?: { x: number; y: number }) => {
    const loaded = await pickImageFile().catch(() => null);
    if (loaded) insertLoadedImage(loaded, clickPointPx, true);
  }, [insertLoadedImage]);

  // Replaces the picture inside an *existing* image element while keeping its frame
  // (geo) and appearance (radius/stroke/opacity/mask) exactly as-is — only the content
  // (src) and its pan/zoom-in-frame reset to centered, since the new picture's framing
  // needs is unrelated to the old one's.
  const replaceImage = useCallback(
    async (id: ElementId) => {
      const loaded = await pickImageFile().catch(() => null);
      if (!loaded) return;
      setState((s) => {
        const target = s.elements.find((e) => e.id === id);
        if (!target || target.type !== 'image') return s;
        const elements = s.elements.map((e) =>
          e.id === id && e.type === 'image' ? { ...e, src: loaded.dataUrl, placeholder: false, naturalW: loaded.naturalW, naturalH: loaded.naturalH, ...DEFAULT_IMAGE_CROP } : e,
        );
        return { ...s, elements, ...pushHistory(s) };
      });
    },
    [],
  );

  const insertImageFromFile = useCallback(
    async (file: File, dropPointPx?: { x: number; y: number }) => {
      const loaded = await readImageFile(file).catch(() => null);
      if (loaded) insertLoadedImage(loaded, dropPointPx);
    },
    [insertLoadedImage],
  );

  // Roadmap #13: same insertion shape as `insertLoadedImage` (lock the box to the
  // content's own aspect ratio, place at a drop point or centered) but always adds a
  // *new* element — there's no "placeholder lottie slot" in the default document to
  // fill the way the product-photo placeholder works for images.
  const insertLoadedLottie = useCallback((loaded: LoadedLottie, dropPointPx?: { x: number; y: number }) => {
    setState((s) => {
      const size = sizeAt(s.sizeIdx, s.customW, s.customH);
      const aspect = loaded.naturalH / loaded.naturalW;
      const newId = newElementId('lottie');
      const wFrac = 0.34;
      const hFrac = (wFrac * size.w * aspect) / size.h;
      const xFrac = dropPointPx ? clamp(dropPointPx.x / size.w - wFrac / 2, 0, 1 - wFrac) : (1 - wFrac) / 2;
      const yFrac = dropPointPx ? clamp(dropPointPx.y / size.h - hFrac / 2, 0, 1 - hFrac) : (1 - hFrac) / 2;
      const el: DocElement = {
        id: newId,
        type: 'lottie',
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        geo: { x: xFrac, y: yFrac, w: wFrac, h: hFrac, rotation: 0 },
        data: loaded.json,
        naturalW: loaded.naturalW,
        naturalH: loaded.naturalH,
        loop: true,
        anim: defaultAnim('none', 0, 0.6),
      };
      return {
        ...s,
        elements: [...s.elements, el],
        selectedIds: [newId],
        sel: newId,
        ...pushHistory(s),
      };
    });
  }, []);

  // نفس قاعدة `insertImageTool`: النقرة تحمل موضعها. ولوتي لا خانةَ فارغة له في
  // المستند، فلا شيء هنا يُفصَل عن الموضع.
  const insertLottieTool = useCallback(async (clickPointPx?: { x: number; y: number }) => {
    const loaded = await pickLottieFile().catch(() => null);
    if (loaded) insertLoadedLottie(loaded, clickPointPx);
  }, [insertLoadedLottie]);

  const insertLottieFromFile = useCallback(
    async (file: File, dropPointPx?: { x: number; y: number }) => {
      const loaded = await readLottieFile(file).catch(() => null);
      if (loaded) insertLoadedLottie(loaded, dropPointPx);
    },
    [insertLoadedLottie],
  );

  // Swaps the animation data of an *existing* lottie element while keeping its frame
  // (geo/opacity/mask) exactly as-is — same "replace content, keep placement" contract
  // as `replaceImage`. The element's own aspect-locked size isn't auto-adjusted to the
  // new file's aspect ratio (unlike first insertion) since the user already framed it
  // deliberately; it just plays the new animation inside the box it already has.
  const replaceLottie = useCallback(async (id: ElementId) => {
    const loaded = await pickLottieFile().catch(() => null);
    if (!loaded) return;
    setState((s) => {
      const target = s.elements.find((e) => e.id === id);
      if (!target || target.type !== 'lottie') return s;
      const elements = s.elements.map((e) => (e.id === id && e.type === 'lottie' ? { ...e, data: loaded.json, naturalW: loaded.naturalW, naturalH: loaded.naturalH } : e));
      return { ...s, elements, ...pushHistory(s) };
    });
  }, []);

  // Roadmap #14: same insertion shape as `insertLoadedLottie` (lock the box to the
  // content's own aspect ratio, place at a drop point or centered, no placeholder
  // slot to fill) — trim starts covering the whole probed source, unmuted, not
  // looping (a fresh clip plays through once by default; looping is an explicit
  // opt-in via the properties panel).
  const insertLoadedVideo = useCallback((loaded: LoadedVideo, dropPointPx?: { x: number; y: number }) => {
    setState((s) => {
      const size = sizeAt(s.sizeIdx, s.customW, s.customH);
      const aspect = loaded.naturalH / loaded.naturalW;
      const newId = newElementId('video');
      const wFrac = 0.34;
      const hFrac = (wFrac * size.w * aspect) / size.h;
      const xFrac = dropPointPx ? clamp(dropPointPx.x / size.w - wFrac / 2, 0, 1 - wFrac) : (1 - wFrac) / 2;
      const yFrac = dropPointPx ? clamp(dropPointPx.y / size.h - hFrac / 2, 0, 1 - hFrac) : (1 - hFrac) / 2;
      const el: DocElement = {
        id: newId,
        type: 'video',
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        geo: { x: xFrac, y: yFrac, w: wFrac, h: hFrac, rotation: 0 },
        src: loaded.dataUrl,
        naturalW: loaded.naturalW,
        naturalH: loaded.naturalH,
        durationSec: loaded.durationSec,
        trimIn: 0,
        trimOut: loaded.durationSec,
        volume: 1,
        muted: false,
        loop: false,
        poster: loaded.poster,
        anim: defaultAnim('none', 0, 0.6),
      };
      return {
        ...s,
        elements: [...s.elements, el],
        selectedIds: [newId],
        sel: newId,
        ...pushHistory(s),
      };
    });
  }, []);

  // الصوت: طبقةٌ لا تُرى، تبدأ عند المؤشّر وطولُها طولُ ملفّها — مقرَّبًا **إلى أعلى** على
  // شبكة الإطارات كي لا يُقصّ من آخره شيء (ما بعد آخر الملف صمتٌ لا ضرر فيه). وتُوضَع **تحت**
  // كلّ الطبقات (بعد الخلفيّة إن وُجدت): صفوفُ الصوت في أسفل الخطّ الزمنيّ كما في كلّ محرّر.
  const insertLoadedAudio = useCallback((loaded: LoadedAudio) => {
    setState((s) => {
      const id = newElementId('audio');
      const start = Math.max(0, snapToFrame(s.t, s.fps));
      const duration = Math.max(1 / s.fps, Math.ceil(loaded.durationSec * s.fps - 1e-6) / s.fps);
      const el: DocElement = {
        id,
        type: 'audio',
        name: loaded.name,
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        geo: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
        src: loaded.dataUrl,
        durationSec: loaded.durationSec,
        volume: 1,
        muted: false,
        anim: { ...defaultAnim('none', start, duration), tracks: {} },
      };
      const at = s.elements[0]?.id === BACKGROUND_ID ? 1 : 0;
      return {
        ...s,
        elements: [...s.elements.slice(0, at), el, ...s.elements.slice(at)],
        selectedIds: [id],
        sel: id,
        audioError: null,
        ...pushHistory(s, (s.lang === 'ar' ? AR : EN).undo_audio_add),
      };
    });
  }, []);

  const insertFx = useCallback((kind: FxKind) => {
    setState((s) => {
      const spec = fxSpec(kind);
      const id = newElementId('fx');
      const frame = 1 / s.fps;
      const duration = Math.max(frame, Math.round(spec.defaultDuration * s.fps) / s.fps);
      // الانتقالُ يُوسَّط على المؤشّر: يقف المصمّمُ عند القطع ويضغط، فتقع القمّةُ عليه.
      // **وإلى الإطار السابق لا الأقرب.** المؤشّرُ المنقور على المسطرة لا يقع على إطار؛
      // والتقريبُ للأقرب كان يضع البدايةَ بعد المؤشّر بجزءٍ من إطار، فيضغط المصمّمُ البطاقةَ
      // ولا يرى شيئًا على اللوحة (رُصد بالتجربة اليدويّة في البرنامج: المؤشّر ٠٫٢٥ والبداية ٠٫٢٧).
      const rawStart = spec.cat === 'transition' ? s.t - duration / 2 : s.t;
      const start = Math.max(0, Math.floor(rawStart * s.fps + 1e-6) / s.fps);
      const el: DocElement = {
        id,
        type: 'fx',
        visible: true,
        locked: false,
        opacity: 100,
        maskId: null,
        geo: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
        fx: kind,
        amount: 1,
        fadeIn: 0,
        fadeOut: 0,
        anim: { ...defaultAnim('none', start, duration), tracks: {}, bounded: true },
      };
      return {
        ...s,
        elements: [...s.elements, el],
        selectedIds: [id],
        sel: id,
        ...pushHistory(s, (s.lang === 'ar' ? AR : EN).undo_fx_add),
      };
    });
  }, []);

  const insertAudioTool = useCallback(async () => {
    try {
      const loaded = await pickAudioFile();
      if (loaded) insertLoadedAudio(loaded);
    } catch (err) {
      patch({ audioError: err instanceof Error ? err.message : String(err) });
    }
  }, [insertLoadedAudio, patch]);

  const insertAudioFromFile = useCallback(
    async (file: File) => {
      try {
        insertLoadedAudio(await readAudioFile(file));
      } catch (err) {
        patch({ audioError: err instanceof Error ? err.message : String(err) });
      }
    },
    [insertLoadedAudio, patch],
  );

  const insertVideoTool = useCallback(async (clickPointPx?: { x: number; y: number }) => {
    const loaded = await pickVideoFile().catch(() => null);
    if (loaded) insertLoadedVideo(loaded, clickPointPx);
  }, [insertLoadedVideo]);

  const insertVideoFromFile = useCallback(
    async (file: File, dropPointPx?: { x: number; y: number }) => {
      const loaded = await readVideoFile(file).catch(() => null);
      if (loaded) insertLoadedVideo(loaded, dropPointPx);
    },
    [insertLoadedVideo],
  );

  // Roadmap #22: one in-flight generation at a time for the dialog — a fresh
  // AbortController per `runAiGenerate` call, aborted by `cancelAiGenerate` or
  // implicitly replaced if the user starts another generation before this one
  // settles (its eventual result/error is then simply ignored by the `current ===
  // controller` guard below instead of racing to overwrite newer state).
  const aiGenAbortRef = useRef<AbortController | null>(null);

  // Roadmap #20 security fix: the switch is now *causal*, not decorative. It used
  // to set a flag while `lib.rs::run()` had already bound 127.0.0.1:7420 at launch
  // regardless — so the dialog could say "off" about a live, unauthenticated local
  // control surface, which was reproduced with curl. Enabling creates the socket
  // (`mcp_start`) and receives the bearer token minted for that listening period;
  // disabling destroys it (`mcp_stop`), after which `lsof -iTCP:7420` is empty. A
  // failure to bind is surfaced rather than swallowed, because a switch that reads
  // "on" while nothing listens is the same class of lie in the other direction.
  const setMcpServerEnabled = useCallback((on: boolean) => {
    if (!on) {
      // Clear our own state first: the bridge effect's cleanup then runs with the
      // token still in hand and can send its courtesy `/bridge/detach`.
      patch({ mcpServerEnabled: false, mcpToken: null, mcpError: null });
      void stopMcpServer().catch(() => {});
      return;
    }
    patch({ mcpError: null });
    void (async () => {
      try {
        const info = await startMcpServer();
        patch({ mcpServerEnabled: true, mcpToken: info.token, mcpError: null });
      } catch (err) {
        patch({
          mcpServerEnabled: false,
          mcpToken: null,
          mcpError: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, []);

  const openAiGenerate = useCallback(() => patch({ aiGenOpen: true }), []);
  const closeAiGenerate = useCallback(() => {
    aiGenAbortRef.current?.abort();
    patch({ aiGenOpen: false });
  }, []);
  const setAiGenProviderId = useCallback((id: string | null) => patch({ aiGenProviderId: id, aiGenError: null }), []);
  const setAiGenPrompt = useCallback((text: string) => patch({ aiGenPrompt: text }), []);
  const setAiGenSize = useCallback((size: string) => patch({ aiGenSize: size }), []);

  const cancelAiGenerate = useCallback(() => {
    aiGenAbortRef.current?.abort();
    patch({ aiGenStatus: 'idle', aiGenProgress: 0 });
  }, []);

  const runAiGenerate = useCallback(async () => {
    const providerId = state.aiGenProviderId;
    const provider = providerId ? providerById(providerId) : undefined;
    const prompt = state.aiGenPrompt.trim();
    if (!provider || !provider.enabled || !prompt) return;

    const apiKey = await loadApiKey(provider.id);
    if (!apiKey) {
      patch({ aiGenStatus: 'error', aiGenError: 'أدخِل مفتاح API لهذا المزوّد أولًا' });
      return;
    }

    aiGenAbortRef.current?.abort();
    const controller = new AbortController();
    aiGenAbortRef.current = controller;
    patch({ aiGenStatus: 'busy', aiGenProgress: 0, aiGenError: null });

    try {
      const result = await provider.generate(
        { prompt, size: state.aiGenSize, apiKey },
        { signal: controller.signal, onProgress: (fraction) => { if (aiGenAbortRef.current === controller) patch({ aiGenProgress: fraction }); } },
      );
      if (aiGenAbortRef.current !== controller) return; // superseded/cancelled — a newer call (or none) owns the dialog's state now
      if (result.kind === 'image') {
        insertLoadedImage({ dataUrl: result.dataUrl, naturalW: result.naturalW, naturalH: result.naturalH });
      } else {
        insertLoadedVideo({ dataUrl: result.dataUrl, naturalW: result.naturalW, naturalH: result.naturalH, durationSec: result.durationSec, poster: result.poster });
      }
      patch({ aiGenStatus: 'done', aiGenProgress: 1 });
    } catch (err) {
      if (aiGenAbortRef.current !== controller) return;
      patch({ aiGenStatus: 'error', aiGenError: describeAiError(err) });
    }
  }, [insertLoadedImage, insertLoadedVideo, state.aiGenProviderId, state.aiGenPrompt, state.aiGenSize]);

  // Swaps the clip of an *existing* video element while keeping its frame
  // (geo/opacity/mask) exactly as-is — same "replace content, keep placement"
  // contract as `replaceLottie`/`replaceImage`. Trim resets to the new source's full
  // range (the old trim window has no guaranteed relationship to a different file's
  // duration) and volume/mute/loop are kept as the user had set them.
  const replaceVideo = useCallback(async (id: ElementId) => {
    const loaded = await pickVideoFile().catch(() => null);
    if (!loaded) return;
    setState((s) => {
      const target = s.elements.find((e) => e.id === id);
      if (!target || target.type !== 'video') return s;
      const elements = s.elements.map((e) =>
        e.id === id && e.type === 'video'
          ? { ...e, src: loaded.dataUrl, naturalW: loaded.naturalW, naturalH: loaded.naturalH, durationSec: loaded.durationSec, trimIn: 0, trimOut: loaded.durationSec, poster: loaded.poster }
          : e,
      );
      return { ...s, elements, ...pushHistory(s) };
    });
  }, []);

  const actions: StudioActions = useMemo(
    () => ({
      goHome: () => patch({ screen: 'home', cmdOpen: false }),
      goEditor: () => patch({ screen: 'editor' }),
      // **يقرأ طبيعةَ الوجهة ويكتبها.** كان مُعالِجًا واحدًا للوسيطَين لا يقرأ
      // `SIZES[sizeIdx].kind` إطلاقًا، فمن اختار «ريل إنستقرام» **أجاب** «فيديو»
      // ثم تسلّم نفسَ لوح الخصائص ونفسَ الشريط ونفسَ الخطّ الزمنيّ المفتوح دائمًا
      // وشارةً تقول «فيديو · ٥ث». السؤال كان مطروحًا والجوابُ يصل إلى لافتة.
      startBlank: (sizeIdx) =>
        setState((s) => startDoc(s, { elements: [], anim: 'none', sizeIdx, customW: s.customW, customH: s.customH, decorAccent: false, fps: DEFAULT_DOC_FPS, medium: sizeAt(sizeIdx, s.customW, s.customH).kind })),
      startBlankCustom: (w, h) =>
        setState((s) =>
          startDoc(s, {
            elements: [],
            anim: 'none',
            sizeIdx: CUSTOM_SIZE_IDX,
            customW: Math.max(1, Math.round(w)),
            customH: Math.max(1, Math.round(h)),
            decorAccent: false,
            fps: DEFAULT_DOC_FPS,
            // مقاسٌ مخصّص لا طبيعةَ له: كتب المستخدم رقمَين ولم يُسمِّ وجهة، فهو
            // `still` كما تقول `sizeAt`. وليس حصرًا: تبديلُ المقاس إلى وجهةٍ
            // مُوقَّتة يقلبه في أيّ لحظة.
            medium: sizeAt(CUSTOM_SIZE_IDX, w, h).kind,
          }),
        ),
      startFromStarter: (id) =>
        setState((s) => {
          const tpl = STARTER_TEMPLATES.find((t) => t.id === id);
          if (!tpl) return s;
          return startDoc(
            s,
            { elements: tpl.elements(), anim: tpl.anim, sizeIdx: tpl.sizeIdx, customW: s.customW, customH: s.customH, decorAccent: tpl.decorAccent, fps: DEFAULT_DOC_FPS, medium: sizeAt(tpl.sizeIdx, s.customW, s.customH).kind },
            { paletteIdx: tpl.paletteIdx, sel: tpl.selectOnOpen },
          );
        }),
      // المستندُ الساكن يُفتح على لحظة استقراره، كما يُصدَّر. المؤشّرُ لا يُحفظ مع
      // المستند، فكان «كمّل» بعد إعادة تشغيل البرنامج يفتح على t=0 — قبل دخول أيّ
      // عنصر — فتظهر اللوحة خلفيةً فارغة والطبقاتُ كلّها في القائمة. ولا مسطرةَ
      // في الساكن يُحرَّك منها المؤشّر، فلا مخرجَ للمصمّم من ذلك.
      refreshProjects: async () => {
        const projects = await listProjects();
        patch({ projects });
      },
      openProject: async (id) => {
        const cur = stateRef.current;
        if (cur.openDoc === 'open' && cur.dirty) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          await saveDoc({ artboards: allArtboardEntries(cur), activeArtboardId: cur.activeArtboardId }, cur.projectId).catch(() => undefined);
        }
        const file = migrateToDocFile(await loadProject(id), cur.lang);
        if (!file) return;
        const next = loadedFileToState(file, id);
        void markCurrentProject(id);
        setState((s) => {
          const opened = { ...s, ...next, screen: 'editor' as const, cmdOpen: false };
          return { ...opened, ...(opened.medium !== 'timed' ? { t: settledTime(opened.elements, opened.fps ?? DEFAULT_DOC_FPS) } : {}) };
        });
      },
      resumeOpenProject: () =>
        patch((s) => ({
          screen: 'editor',
          cmdOpen: false,
          ...(s.medium !== 'timed' ? { t: settledTime(s.elements, s.fps ?? DEFAULT_DOC_FPS) } : {}),
        })),
      toggleLang: () => patch((s) => ({ lang: s.lang === 'ar' ? 'en' : 'ar' })),
      // مغادرةُ أداة القلم **تُثبِّت** المسودّةَ الجارية ولا تُلقيها، ولا تتركها
      // معلّقةً في الحالة كذلك. والعلّةُ التي من أجلها كانت تُمسَح باقيةٌ على
      // صحّتها: معاينةُ المسودّة مشروطةٌ بـ`tool === 'pen'`، فمسودّةٌ مهجورةٌ تختفي
      // عن الشاشة وتبقى في `penDraft` — فتظهر فجأةً عند الرجوع للقلم، والأسوأ:
      // تندمج نقاطُها في أوّل مسارٍ جديد. والإثباتُ يُفرِغ `penDraft` كما يُفرِغه
      // المسحُ، فتلك العلّةُ ممتنعةٌ بحكم البناء — والفرقُ أنّ العملَ صار عنصرًا
      // في المستند بخطوةٍ تُعيده لا عدمًا. التفصيلُ والمصدرُ عند `commitPenDraft`
      // و`armTool` في أعلى هذا الملفّ.
      //
      // ومغادرةُ أداةٍ ما تُخرِج أيضًا من وضع تحرير العقد، لأن المقابض المرسومة
      // على اللوحة لا معنى لها مع أداة رسم أخرى نشِطة. **وتنزع التحديد عن كل
      // شيء** — قرارُ المالك، وهو سطرُنا لا سطرُ المصدر؛ الدليلُ والاستثناءُ
      // الوحيدُ له عند `armTool`.
      //
      // اختيار أداةٍ يُعيد اللوح إلى «التصميم» متى كانت الأداة ليست مكتبة — أي
      // «تحديد» وحدها اليوم. وهذا ليس تجميلًا: بدونه يبقى لوح المكتبة معروضًا بعد
      // أن ينتهي المصمم من الرسم، فلا يجد خصائص ما حدّده للتوّ. فتح المكتبة يمرّ
      // بـ`openToolLibrary` لا من هنا، فيبقى `setTool` صالحًا كما كان لكل نداء
      // برمجي قائم (مُفسِّر الأوامر، لوحة الأوامر، MCP).
      setTool: (tool, opts) =>
        patch((s) => ({
          ...armTool(s, tool, opts),
          ...(TOOL_LIBRARY[tool] === 'none' && s.panel === 'library' ? { panel: 'props' as PanelId } : {}),
        })),
      setShapeDrawKind: (shapeDrawKind) => patch({ shapeDrawKind }),
      openCmd: () => patch({ cmdOpen: true, cmdQuery: '', cmdSel: 0 }),
      closeCmd: () => patch({ cmdOpen: false }),
      setCmdQuery: (cmdQuery) => patch({ cmdQuery, cmdSel: 0 }),
      moveCmdSel: (dir) =>
        patch((s) => {
          const list = visibleCmds(s.cmdQuery, s);
          const next = dir === 1 ? Math.min(list.length - 1, s.cmdSel + 1) : Math.max(0, s.cmdSel - 1);
          return { cmdSel: next };
        }),
      runSelectedCmd: () => {
        const st = mcpStateRef.current;
        const c = visibleCmds(st.cmdQuery, st)[st.cmdSel];
        if (c) runCmd(c);
      },
      runCommand: runCmd,
      setPanel: (panel) => patch({ panel }),
      openLibrary: (tool) => patch({ panel: 'library', libraryTool: tool }),
      toggleRailPanel: (panel, opts) =>
        patch((s) => {
          const same =
            s.panel === panel &&
            (opts?.libraryTool === undefined || s.libraryTool === opts.libraryTool) &&
            (opts?.assetsTab === undefined || s.assetsTab === opts.assetsTab);
          if (same) return { panel: 'props' };
          return {
            panel,
            ...(opts?.libraryTool !== undefined ? { libraryTool: opts.libraryTool } : {}),
            ...(opts?.assetsTab !== undefined ? { assetsTab: opts.assetsTab } : {}),
          };
        }),
      toggleInspector: () => patch((s) => ({ inspectorOpen: !s.inspectorOpen })),
      toggleLayers: () => patch((s) => ({ layersOpen: !s.layersOpen })),
      toggleShortcuts: () => patch((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
      closeShortcuts: () => patch({ shortcutsOpen: false }),
      togglePro: () => {
        const next = !mcpStateRef.current.pro;
        saveUiPrefs({ pro: next });
        patch({ pro: next });
      },
      duplicateSelected: () =>
        setState((s) => {
          const ids = new Set(s.selectedIds);
          if (!ids.size) return s;
          const size = sizeAt(s.sizeIdx, s.customW, s.customH);
          const sources = withDependencies(ids, s.elements);
          const clones = cloneElements(sources, 24 / size.w, 24 / size.h);
          const cloneSel = clones.filter((_, i) => ids.has(sources[i].id)).map((e) => e.id);
          return {
            ...s,
            elements: insertAbove(s.elements, sources, clones),
            selectedIds: cloneSel,
            sel: cloneSel[cloneSel.length - 1] ?? null,
            ...pushHistory(s, 'تكرار'),
          };
        }),
      copySelected: () => {
        const s = stateRef.current;
        const ids = new Set(s.selectedIds);
        if (!ids.size) return;
        const sources = withDependencies(ids, s.elements);
        clipboardRef.current = { elements: sources.map((e) => ({ ...e, ...(ids.has(e.id) ? {} : { __dep: true }) }) as DocElement), pastes: 0 };
      },
      copyAnimation: () => {
        const s = stateRef.current;
        const el = s.elements.find((e) => e.id === s.selectedIds[0]);
        if (!el) return;
        // ونقطةُ الارتكاز معها: حركةٌ تدور حول طرفٍ تصير غيرَها لو دارت حول المركز.
        patch({ animClipboard: { anim: structuredClone(el.anim), textAnim: el.type === 'text' ? structuredClone(el.textAnim) : null, fromType: el.type, pivot: el.pivot ? { ...el.pivot } : null } });
      },
      pasteAnimation: () =>
        setState((s) => {
          const clip = s.animClipboard;
          if (!clip || !s.selectedIds.length) return s;
          const ids = new Set(s.selectedIds);
          let changed = false;
          const elements = s.elements.map((e) => {
            if (!ids.has(e.id) || e.locked) return e;
            // المسموحُ يُسأل عنه بعد اللصق لا قبله: نصٌّ بلا تتابعٍ يناله الآن من المصدر،
            // فيصير «الظهور» له معنًى — ولو سُئل قبلُ لسقط مسارُه في الطريق.
            const textAnim = e.type === 'text' && clip.textAnim ? structuredClone(clip.textAnim) : null;
            const allowed = new Set(animPropertiesFor(textAnim ? { ...e, textAnim } : e));
            const tracks: PropertyTracks = {};
            for (const [prop, track] of Object.entries(clip.anim.tracks) as [AnimProperty, PropertyKeyframe[] | undefined][]) {
              if (track && allowed.has(prop)) tracks[prop] = track.map((k) => ({ ...k, id: newElementId('kf'), bezier: [...k.bezier] as Bezier }));
            }
            // البدايةُ بدايةُ الهدف، وكلُّ ما سواها من المصدر — والمفاتيحُ بزمن الحركة،
            // فتنتقل مع البداية بلا حساب.
            const anim: ElementAnim = { ...structuredClone(clip.anim), start: e.anim.start, tracks };
            changed = true;
            const { pivot: _drop, ...noPivot } = e;
            const withPivot = (clip.pivot ? { ...noPivot, pivot: { ...clip.pivot } } : noPivot) as DocElement;
            if (withPivot.type === 'text' && textAnim) return { ...withPivot, anim, textAnim };
            return { ...withPivot, anim };
          });
          if (!changed) return s;
          return { ...s, elements, ...pushHistory(s, (s.lang === 'ar' ? AR : EN).undo_paste_anim) };
        }),
      cutSelected: () => {
        const s = stateRef.current;
        const ids = new Set(s.selectedIds);
        if (!ids.size) return;
        const sources = withDependencies(ids, s.elements);
        clipboardRef.current = { elements: sources.map((e) => ({ ...e, ...(ids.has(e.id) ? {} : { __dep: true }) }) as DocElement), pastes: -1 };
        const gone = new Set(sources.map((e) => e.id));
        setState((cur) => ({
          ...cur,
          elements: cur.elements.filter((e) => !gone.has(e.id)),
          selectedIds: [],
          sel: null,
          ...pushHistory(cur, 'قص'),
        }));
      },
      pasteClipboard: () => {
        const clip = clipboardRef.current;
        if (!clip || !clip.elements.length) return;
        clip.pastes += 1;
        const n = clip.pastes;
        setState((s) => {
          const size = sizeAt(s.sizeIdx, s.customW, s.customH);
          const raw = clip.elements.map((e) => {
            const { __dep: _dep, ...rest } = e as DocElement & { __dep?: boolean };
            return rest as DocElement;
          });
          const clones = cloneElements(raw, (24 * n) / size.w, (24 * n) / size.h);
          const picked = clones.filter((_, i) => !(clip.elements[i] as DocElement & { __dep?: boolean }).__dep).map((e) => e.id);
          return {
            ...s,
            elements: [...s.elements, ...clones],
            selectedIds: picked,
            sel: picked[picked.length - 1] ?? null,
            tool: 'select',
            ...pushHistory(s, 'لصق'),
          };
        });
      },
      selectAllElements: () =>
        patch((s) => {
          // ⌘A على اللوحة يحدّد ما على اللوحة: طبقاتُ الصوت لا تُرى فيها، فلا تدخل.
          const ids = s.elements.filter((e) => e.visible && !e.locked && e.id !== BACKGROUND_ID && e.type !== 'audio' && e.type !== 'fx').map((e) => e.id);
          return { selectedIds: ids, sel: ids[ids.length - 1] ?? null, tool: 'select' };
        }),
      animateElement: (id, preset) =>
        patch((s) => {
          const elements = s.elements.map((e) => (e.id === id ? { ...e, anim: withPreset(e.anim, preset) } : e));
          const after = elements.find((e) => e.id === id);
          if (!after) return {};
          const label = (s.lang === 'ar' ? AR : EN).ctx_animate;
          if (s.medium !== 'timed') {
            // «بدون» على ساكن لا تطلب حركةً، فلا تجعله مشهدًا. كانت تحوّله فيديو واقفًا
            // عند اللحظة صفر — وعندها كلّ عنصرٍ له دخولٌ لم يدخل بعد، فاختفى التصميم كلّه
            // إلا العنصر المحدَّد، ولا شيء يشتغل (جولة الاستخدام: فتح «حرّك» واختار «بدون»).
            if (preset === 'none') return { elements, ...pushHistory(s, label) };
            // ساكنٌ يصير مشهدًا: الخطّ يطلع من تحت ويشتغل من البداية، فيرى المصمّم
            // الحركة التي طلبها لحظةَ طلبها — لا مؤشّرًا واقفًا بعد نهايتها.
            return { elements, medium: 'timed', tlOpen: true, t: 0, playing: true, ...pushHistory(s, label) };
          }
          const vanished = rendersNothingAt(after.anim, s.t);
          return { elements, ...pushHistory(s, label), t: vanished ? Math.max(s.t, after.anim.start + after.anim.duration) : s.t };
        }),
      animateSelectionOrAll: (preset) =>
        patch((s) => {
          const ids = s.selectedIds.length ? s.selectedIds : s.elements.filter((e) => e.visible && e.id !== BACKGROUND_ID).map((e) => e.id);
          if (!ids.length) return {};
          const targets = new Set(ids);
          const elements = s.elements.map((e) => (targets.has(e.id) ? { ...e, anim: withPreset(e.anim, preset) } : e));
          const label = (s.lang === 'ar' ? AR : EN).ctx_animate;
          return { elements, medium: 'timed', tlOpen: true, t: 0, playing: true, ...pushHistory(s, label) };
        }),
      addTextPreset: (preset: TextPreset) =>
        setState((s) => {
          const def = TEXT_PRESETS[preset];
          const id = newElementId('text');
          const el: DocElement = {
            id,
            type: 'text',
            visible: true,
            locked: false,
            opacity: 100,
            maskId: null,
            geo: { x: (1 - def.w) / 2, y: (1 - def.h) / 2, w: def.w, h: def.h, rotation: 0 },
            text: def.text,
            fontFamily: def.fontFamily,
            fontSize: def.fontSize,
            ...(def.tracking ? { tracking: def.tracking } : {}),
            weight: def.weight,
            color: null,
            halign: def.halign,
            valign: 'top',
            anim: defaultAnim('none', 0, 0.6),
            textAnim: defaultTextStagger(),
            pathId: null,
          };
          return {
            ...armTool(s, 'select'),
            elements: [...s.elements, el],
            selectedIds: [id],
            sel: id,
            ...pushHistory(s, 'نص'),
          };
        }),
      setAssetsTab: (assetsTab) => patch({ assetsTab }),
      toggleTimeline: () => patch((s) => ({ tlOpen: !s.tlOpen })),
      togglePlay,
      // **بالثواني لا بكسرٍ من ٠ إلى ١.** كانت `clamp(t, 0, 1) * TIMELINE_DURATION`،
      // أي أنّ كلّ مُنادٍ كان عليه أن يعرف طول الخطّ ليحوّل موضعَ مؤشّرٍ إلى كسر —
      // ومع مدّةٍ مشتقّة لم يبقَ طولٌ واحدٌ يعرفه الجميع. والحجزُ هنا إلى **مدى
      // المسطرة** لا إلى طول المستند، فيمكن للمؤشّر أن يقف في الفراغ الذي سيُسحَب
      // إليه مقطع.
      scrubTo: (seconds) =>
        patch((s) => ({
          t: clamp(seconds, 0, timelineSpan(documentDuration(s.elements.map((el) => el.anim), s.fps))),
        })),
      // كلُّ تبديلِ مقاسٍ يُعيد اشتقاق الطبيعة. وهذا هو ما يجعل جواب «صورة أم
      // فيديو» **قابلًا للتراجع**: لا بدءَ من جديد، ولا إعادةَ تحميل — ولا حقلًا
      // يبقى يقول «فيديو» على بوسترٍ مربّع. انظر `DocSnapshot.medium`.
      cycleSize: () => patchDoc((s) => withDerivedMedium(s, (s.sizeIdx + 1) % SIZES.length, s.customW, s.customH)),
      setSizeIdx: (sizeIdx) => patchDoc((s) => withDerivedMedium(s, sizeIdx, s.customW, s.customH)),
      setCustomSize: (w, h) => patchDoc((s) => withDerivedMedium(s, CUSTOM_SIZE_IDX, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))),
      setMagicResizeOn: (magicResizeOn) => patch({ magicResizeOn }),
      // Roadmap #8: same "one undo step for the whole action" shape as `patchDoc`
      // (push the pre-change doc once, update doc fields + elements together) but
      // also rewrites `elements` through `magicResizeElements`, which plain
      // `patchDoc` never touches.
      applyMagicResize: (sizeIdx, customW, customH) =>
        setState((s) => {
          const from = sizeAt(s.sizeIdx, s.customW, s.customH);
          const to = sizeIdx === CUSTOM_SIZE_IDX ? { w: Math.max(1, Math.round(customW ?? s.customW)), h: Math.max(1, Math.round(customH ?? s.customH)) } : SIZES[sizeIdx] ?? SIZES[0];
          const elements = magicResizeElements(s.elements, from, to);
          return {
            ...s,
            elements,
            // «التحجيم الذكي» بابٌ رابعٌ لتبديل المقاس، فيمرّ بالمُشتِقّ نفسه —
            // وإلّا صار المستند مُوقَّتًا في الحقل وساكنًا في المقاس.
            ...withDerivedMedium(s, sizeIdx, sizeIdx === CUSTOM_SIZE_IDX ? to.w : s.customW, sizeIdx === CUSTOM_SIZE_IDX ? to.h : s.customH),
            ...pushHistory(s),
          };
        }),
      setExportMagicResize: (exportMagicResize) => patch((s) => exportSettingChanged(s, { exportMagicResize })),
      openArtboards: () => patch({ artboardsOpen: true }),
      closeArtboards: () => patch({ artboardsOpen: false }),
      // Roadmap #16: swaps the active doc/undo-history with `id`'s stored doc —
      // the inverse pair stays symmetric: whatever leaves active gets stashed under
      // its own id in `artboardDocs`, whatever enters active is removed from it.
      switchArtboard: (id) =>
        setState((s) => {
          if (id === s.activeArtboardId) return s;
          const meta = s.artboards.find((a) => a.id === id);
          const incoming = s.artboardDocs[id];
          if (!meta || !incoming) return s;
          const { [id]: _entering, ...restDocs } = s.artboardDocs;
          const outgoing: ArtboardDoc = { doc: docOf(s), historyPast: s.historyPast, historyFuture: s.historyFuture };
          return {
            ...s,
            ...incoming.doc,
            historyPast: incoming.historyPast,
            historyFuture: incoming.historyFuture,
            historyLabels: incoming.historyPast.map(() => ''),
            historyFutureLabels: incoming.historyFuture.map(() => ''),
            activeArtboardId: id,
            postPalette: meta.paletteIdx,
            artboardDocs: { ...restDocs, [s.activeArtboardId]: outgoing },
            sel: null,
            selectedIds: [],
            editingTextId: null,
            cropEditingId: null,
            pendingEditSnapshot: null,
            dirty: true,
          };
        }),
      // A new artboard starts blank (not `createDefaultElements()` — that demo
      // content only makes sense for the very first/only artboard a fresh document
      // opens with) at the same size as whichever artboard was active, and becomes
      // active immediately so the user can start drawing on it right away.
      addArtboard: () =>
        setState((s) => {
          const newId = newArtboardId();
          const name = defaultArtboardName(s.artboards.length + 1, s.lang);
          // لوحةٌ جديدة بمقاس النشطة، فطبيعتُها طبيعتُها ومعدّلُها معدّلُها.
          const newDoc: DocSnapshot = { elements: [], anim: 'none', sizeIdx: s.sizeIdx, customW: s.customW, customH: s.customH, decorAccent: false, fps: s.fps, medium: s.medium };
          const outgoing: ArtboardDoc = { doc: docOf(s), historyPast: s.historyPast, historyFuture: s.historyFuture };
          return {
            ...s,
            ...newDoc,
            historyPast: [],
            historyFuture: [],
            historyLabels: [],
            historyFutureLabels: [],
            activeArtboardId: newId,
            artboards: [...s.artboards, { id: newId, name, paletteIdx: s.postPalette }],
            artboardDocs: { ...s.artboardDocs, [s.activeArtboardId]: outgoing },
            sel: null,
            selectedIds: [],
            editingTextId: null,
            cropEditingId: null,
            pendingEditSnapshot: null,
            dirty: true,
          };
        }),
      // Copies `id`'s current doc (its own elements/anim/size/palette, whether or
      // not it's the active one) into a brand-new artboard inserted right after it
      // in the list, and switches to the copy.
      duplicateArtboard: (id) =>
        setState((s) => {
          const meta = s.artboards.find((a) => a.id === id);
          const sourceDoc = id === s.activeArtboardId ? docOf(s) : s.artboardDocs[id]?.doc;
          if (!meta || !sourceDoc) return s;
          const newId = newArtboardId();
          const name = `${meta.name} ${s.lang === 'ar' ? '(نسخة)' : '(copy)'}`;
          const outgoing: ArtboardDoc = { doc: docOf(s), historyPast: s.historyPast, historyFuture: s.historyFuture };
          const insertAt = s.artboards.findIndex((a) => a.id === id) + 1;
          const artboards = [...s.artboards.slice(0, insertAt), { id: newId, name, paletteIdx: meta.paletteIdx }, ...s.artboards.slice(insertAt)];
          return {
            ...s,
            ...sourceDoc,
            historyPast: [],
            historyFuture: [],
            historyLabels: [],
            historyFutureLabels: [],
            activeArtboardId: newId,
            postPalette: meta.paletteIdx,
            artboards,
            artboardDocs: { ...s.artboardDocs, [s.activeArtboardId]: outgoing },
            sel: null,
            selectedIds: [],
            editingTextId: null,
            cropEditingId: null,
            pendingEditSnapshot: null,
            dirty: true,
          };
        }),
      renameArtboard: (id, name) => patch((s) => ({ artboards: s.artboards.map((a) => (a.id === id ? { ...a, name } : a)), dirty: true })),
      // A document always keeps at least one artboard — deleting the last
      // remaining one is a no-op. Deleting the active artboard activates the one
      // just before it in the list (or the new first one, if index 0 was deleted).
      deleteArtboard: (id) =>
        setState((s) => {
          if (s.artboards.length <= 1) return s;
          const idx = s.artboards.findIndex((a) => a.id === id);
          if (idx === -1) return s;
          const remaining = s.artboards.filter((a) => a.id !== id);
          if (id !== s.activeArtboardId) {
            const { [id]: _dropped, ...restDocs } = s.artboardDocs;
            return { ...s, artboards: remaining, artboardDocs: restDocs, dirty: true };
          }
          const nextMeta = remaining[Math.min(Math.max(0, idx - 1), remaining.length - 1)];
          const incoming = s.artboardDocs[nextMeta.id];
          if (!incoming) return s;
          const { [nextMeta.id]: _entering, [id]: _dropped, ...restDocs } = s.artboardDocs;
          return {
            ...s,
            ...incoming.doc,
            historyPast: incoming.historyPast,
            historyFuture: incoming.historyFuture,
            historyLabels: incoming.historyPast.map(() => ''),
            historyFutureLabels: incoming.historyFuture.map(() => ''),
            activeArtboardId: nextMeta.id,
            postPalette: nextMeta.paletteIdx,
            artboards: remaining,
            artboardDocs: restDocs,
            sel: null,
            selectedIds: [],
            editingTextId: null,
            cropEditingId: null,
            pendingEditSnapshot: null,
            dirty: true,
          };
        }),
      setExportAllArtboards: (exportAllArtboards) => patch((s) => exportSettingChanged(s, { exportAllArtboards })),
      setExportArtboardOwnSize: (exportArtboardOwnSize) => patch((s) => exportSettingChanged(s, { exportArtboardOwnSize })),
      setElementEasing: (id, easing) =>
        commitElements((els) =>
          els.map((e) => (e.id === id ? { ...e, anim: { ...e.anim, easing, tracks: cascadeEasingToTracks(e.anim.tracks, easing, e.anim.bezier) } } : e)),
        ),
      setClipTiming: (ids, timing) =>
        setState((s) => {
          const fps = s.fps;
          let changed = false;
          const elements = s.elements.map((e) => {
            if (!ids.includes(e.id) || e.locked) return e;
            let anim = e.anim;
            // البدايةُ نقلٌ لا تقليم: ما بُني من حركةٍ داخل المقطع ينتقل معه، فتبقى
            // حركةُ الدخول عند بدايته كما صُمِّمت. والشبكةُ أوّلًا ثم الصفرُ أرضيّة.
            if (typeof timing.start === 'number' && Number.isFinite(timing.start)) {
              const target = Math.max(0, snapToFrame(timing.start, fps));
              anim = moveClip(anim, target - anim.start).anim;
            }
            // والنهايةُ تقليمٌ للحافّة الأخيرة — `trim` تَحجز طولًا لا يقلّ عن إطار.
            if (typeof timing.end === 'number' && Number.isFinite(timing.end)) {
              const target = snapToFrame(timing.end, fps);
              anim = trim(anim, 'out', target - (anim.start + anim.duration), { fps }).anim;
            }
            if (anim === e.anim) return e;
            changed = true;
            return { ...e, anim };
          });
          if (!changed) return s;
          return { ...s, elements, ...pushHistory(s, (s.lang === 'ar' ? AR : EN).undo_clip_timing) };
        }),
      setClipBounded: (ids, bounded) =>
        setState((s) => {
          let changed = false;
          const elements = s.elements.map((e) => {
            if (!ids.includes(e.id) || e.locked || !!e.anim.bounded === bounded) return e;
            changed = true;
            // `false` يُكتَب حذفًا لا قيمةً: غيابُ الحقل هو السلوكُ القائم، فعنصرٌ أُطفئ
            // مفتاحُه يعود بايتًا ببايت إلى ما كان قبل أن يُشعَل.
            const { bounded: _drop, ...rest } = e.anim;
            return { ...e, anim: bounded ? { ...e.anim, bounded: true } : rest };
          });
          if (!changed) return s;
          return { ...s, elements, ...pushHistory(s, (s.lang === 'ar' ? AR : EN).undo_clip_bounded) };
        }),
      revealNextAtPlayhead: (id) =>
        setState((s) => {
          const el = s.elements.find((e) => e.id === id);
          if (!el || el.type !== 'text' || el.locked || !el.textAnim.enabled) return s;
          const total = revealUnitCount(el.text, el.textAnim.unit);
          if (total === 0) return s;
          const t = snapToFrame(s.t, s.fps);
          const m = snapToFrame(animTimeAt(el.anim, t), s.fps);
          const track = el.anim.tracks.reveal;
          const current = revealValueAt(el.anim, t) ?? 0;
          // `floor` لا `round`: قيمةٌ بين مفتاحين خطّيّين (٢٫٤) تعني أنّ وحدتين بدأتا، فالتالية
          // الثالثة. والتسامحُ لقيمةٍ مخزونةٍ على شبكة ٠٫٠١ تُقرأ ٢٫٩٩٩٩٩٩٩.
          const next = Math.min(total, Math.floor(current + 1e-6) + 1);
          if (next <= current + 1e-6) return s;
          const bezier = [...DEFAULT_BEZIER] as Bezier;
          let nextTrack: PropertyKeyframe[] = track ?? [];
          if (!track || !track.length) {
            // مفتاحُ الصفر: عند بداية المقطع إن كان المؤشّرُ بعدها، وإلّا قبل المؤشّر بإطار —
            // فالمسارُ يثبت على أوّل قيمه قبل أوّل مفتاح، ولولا الصفرُ لظهرت الكلمةُ قبل أوانها.
            const startM = snapToFrame(animTimeAt(el.anim, el.anim.start), s.fps);
            const zeroAt = startM < m ? startM : m - 1 / s.fps;
            nextTrack = setKeyframe(nextTrack, { id: newElementId('kf'), time: zeroAt, value: 0, easing: 'hold', bezier });
          }
          nextTrack = setKeyframe(nextTrack, { id: newElementId('kf'), time: m, value: next, easing: 'hold', bezier: [...bezier] as Bezier });
          return {
            ...s,
            elements: s.elements.map((e) => (e.id === id ? { ...e, anim: { ...e.anim, tracks: { ...e.anim.tracks, reveal: nextTrack } } } : e)),
            ...pushHistory(s, (s.lang === 'ar' ? AR : EN).undo_reveal_next),
          };
        }),
      clearRevealTiming: (id) =>
        setState((s) => {
          const el = s.elements.find((e) => e.id === id);
          if (!el || el.locked || !el.anim.tracks.reveal) return s;
          const { reveal: _drop, ...tracks } = el.anim.tracks;
          return {
            ...s,
            elements: s.elements.map((e) => (e.id === id ? { ...e, anim: { ...e.anim, tracks } } : e)),
            ...pushHistory(s, (s.lang === 'ar' ? AR : EN).undo_reveal_clear),
          };
        }),
      addTrackKeyframeAtPlayhead: (id, property) =>
        setState((s) => {
          const el = s.elements.find((e) => e.id === id);
          if (!el) return s;
          // «مفتاح عند المؤشّر» تعني عند المؤشّر، وهي الآن تعنيه دائمًا بلا شرط.
          //
          // وما حُذِف من هنا ثلاثةُ أشياء، وكلُّها كانت أعراضًا للكسر لا عللًا:
          //
          // ١. `canKeyframeAtPlayhead`. كان مؤشّرٌ **قبل** بداية المقطع يُرفَض بسببٍ
          //    مكتوب، لأنّ كسرًا سالبًا لا معنى له. ومفتاحٌ قبل البداية الآن زمنُ
          //    حركةٍ سالب، وهو زمنٌ مشروع تمامًا — فلا سببَ للرفض، ولا زرَّ معطَّلًا.
          // ٢. `stretchClipToTime`. كان مؤشّرٌ **بعد** النهاية يَمُدّ المقطع ويُعيد
          //    معايرة كلّ كسرٍ فيه كي لا يتزحزح ما هو في مكانه. والآن لا شيء
          //    يتزحزح أصلًا، فلا شيءَ يُعاد.
          // ٣. `EPS = 0.02`. كان لازمًا لأنّ الكسر متّصلٌ لا يقع على شيء. وقد صار
          //    يقع: المفتاح على إطارٍ بعينه، والهويّةُ مقارنةُ إطارين.
          //
          // والقيمةُ تُقرأ **قبل** الكتابة: هي ما يراه المصمّم على الشاشة في هذه
          // اللحظة بعينها، فلا تُحدِث إضافةُ المفتاح أيّ قفزةٍ بصرية.
          //
          // و«الظهور» بلا مسارٍ ليست قيمتُه المرسومةُ محايدَها (٠): التوقيتُ التلقائيّ يكون
          // قد أظهر وحداتٍ عند المؤشّر، فمفتاحٌ بالصفر كان سيُخفي النصَّ كلَّه بضغطة. فالقيمةُ
          // عددُ ما بدأ منها الآن — `startedUnitCount`، الدالّةُ التي يرسم بها الرسّامان.
          const value =
            property === 'reveal' && el.type === 'text' && !el.anim.tracks.reveal?.length
              ? startedUnitCount(el.textAnim, el.anim, revealUnitCount(el.text, el.textAnim.unit), s.t)
              : resolvePropertyAt(el.anim, property, s.t);
          const time = snapToFrame(animTimeAt(el.anim, s.t), s.fps);
          // و«الظهور» يولد بـ«تثبيت»: مفتاحُه توقيتُ وحدةٍ لا منحنى حركة، فالكلمةُ تظهر عنده
          // لا في منتصف ما بينه وبين التالي. ومن أراد آلةً كاتبةً منتظمة غيّره خطّيًّا.
          const key: PropertyKeyframe = { id: newElementId('kf'), time, value, easing: (property === 'reveal' ? 'hold' : 'easeOut') as EasingId, bezier: [...DEFAULT_BEZIER] as Bezier };
          // قُمعُ الكتابة الواحد — انظر `setKeyframe`. وهو نفسه الذي يَكتب سحبُ
          // الماسة في `Clip.tsx`، فلا يبقى مسارانِ يختلفان في معالجة التصادم.
          const nextTrack = setKeyframe(el.anim.tracks[property], key);
          return {
            ...s,
            elements: s.elements.map((e) => (e.id === id ? { ...e, anim: { ...e.anim, tracks: { ...e.anim.tracks, [property]: nextTrack } } } : e)),
            ...pushHistory(s, (s.lang === 'ar' ? AR : EN).add_keyframe),
          };
        }),
      deleteTrackKeyframe: (id, property, kfId) =>
        commitElements(
          (els) =>
          els.map((e) => {
            if (e.id !== id) return e;
            const track = e.anim.tracks[property];
            if (!track) return e;
            const nextTrack = track.filter((k) => k.id !== kfId);
            const tracks = { ...e.anim.tracks };
            if (nextTrack.length) tracks[property] = nextTrack;
            else delete tracks[property];
            return { ...e, anim: { ...e.anim, tracks } };
          }),
          (state.lang === 'ar' ? AR : EN).delete_keyframe,
        ),
      setTrackKeyframeValue: (id, property, kfId, value) => commitElements((els) => writeKeyframeValue(els, id, property, kfId, value), (state.lang === 'ar' ? AR : EN).kf_set_value),
      liveUpdateTrackKeyframeValue: (id, property, kfId, value) => liveUpdateElements((els) => writeKeyframeValue(els, id, property, kfId, value)),
      setTrackKeyframeEasing: (id, property, kfId, easing) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id || !e.anim.tracks[property]) return e;
            const nextTrack = e.anim.tracks[property]!.map((k) => (k.id === kfId ? { ...k, easing } : k));
            return { ...e, anim: { ...e.anim, tracks: { ...e.anim.tracks, [property]: nextTrack } } };
          }),
        ),
      setTrackKeyframeBezier: (id, property, kfId, bezier) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id || !e.anim.tracks[property]) return e;
            const nextTrack = e.anim.tracks[property]!.map((k) => (k.id === kfId ? { ...k, bezier, easing: 'custom' as EasingId } : k));
            return { ...e, anim: { ...e.anim, tracks: { ...e.anim.tracks, [property]: nextTrack } } };
          }),
        ),
      setZoom: (zoom) => patch({ zoom: clamp(zoom, 10, 400) }),
      zoomIn: () => patch((s) => ({ zoom: clamp(s.zoom + 10, 10, 400) })),
      zoomOut: () => patch((s) => ({ zoom: clamp(s.zoom - 10, 10, 400) })),
      zoomFit: () => patch({ zoom: 100, panX: 0, panY: 0 }),
      setPan: (x, y) => patch({ panX: x, panY: y }),
      panBy: (dx, dy) => patch((s) => ({ panX: s.panX + dx, panY: s.panY + dy })),
      selectElement: (id, additive) =>
        patch((s) => {
          const backToProps = leaveInsertLibrary(s);
          if (id === null) return { ...backToProps, selectedIds: [], sel: null };
          // تحديد عضوٍ في مجموعةٍ يحدّد المجموعة كلها — انظر `expandGroups`. وإزالةُ
          // التحديد بـShift تزيل المجموعة كلها كذلك، وإلا لبقي نصفُها محدَّدًا بعد
          // إيماءةٍ واحدة.
          const members = expandGroups([id], s.elements);
          if (additive) {
            const has = s.selectedIds.includes(id);
            const next = has
              ? s.selectedIds.filter((x) => !members.includes(x))
              : [...s.selectedIds, ...members.filter((m) => !s.selectedIds.includes(m))];
            return { ...backToProps, selectedIds: next, sel: next[0] ?? null, tool: 'select' };
          }
          return { ...backToProps, selectedIds: members, sel: members[0] ?? id, tool: 'select' };
        }),
      // `selectMany` هو مسار **النقر على اللوحة** (`onElementPointerDown` في
      // `Stage.tsx` يناديها، لا `selectElement`)، فهو أهمّ المسارين لهذه القاعدة لا
      // أقلّهما — ولولا تطبيقها هنا أيضًا لبقي اللوح على المكتبة بعد أهمّ إيماءة
      // تحديد في البرنامج كلّه.
      selectMany: (ids) =>
        patch((s) => {
          const next = expandGroups(ids, s.elements);
          return { ...leaveInsertLibrary(s), selectedIds: next, sel: next[0] ?? null };
        }),
      selectNone: () => patch({ selectedIds: [], sel: null }),
      setAnim: (anim) => patchDoc({ anim }),
      /** **تعديلٌ لا يُصيِّر موضوعَه عدمًا.**
       *
       * اللوحةُ تُقَوِّم كلَّ عنصرٍ عند `s.t`، و`s.t` لا تُسكَّن عند لحظة
       * الاستقرار إلا **مرّةً واحدةً عند فتح المستند** (`startDoc`، وتعليلُها
       * هناك: قالبٌ عند الصفر يكون في منتصف دخوله). فحركةٌ تُضاف **بعد** الفتح
       * تُقَوَّم عند مؤشّرٍ يسبقها، أي عند لحظتها الأولى — ولم يصل العنصرُ فيها
       * بعد. فيضغط المصمّمُ زرَّ حركةٍ فيَختفي نصُّه، ولا يبقى إلا إطارُ تحديدٍ
       * على فراغ.
       *
       * **والشرطُ «عدمٌ» لا «نقصان»، وهذا هو الحدُّ كلُّه.** مَن أوقف المؤشّرَ
       * عند ٠٫١ث ليُقارن الأنماطَ عند لحظةٍ واحدة **يريد** أن يرى كلَّ نمطٍ في
       * منتصف دخوله، ونقلُ المؤشّر من تحته يَهدم ما جاء يفعله — وهو عملٌ قائمٌ
       * مقيسٌ في `qa/motion-journey.spec.mjs`. فالقاعدةُ لا تَعمل إلا حين لا
       * يَبقى على الشاشة شيءٌ أصلًا (`rendersNothingAt`).
       *
       * والوجهةُ لحظةُ وصولِ العنصر، ولا تَرجع إلى الخلف أبدًا (`Math.max`) —
       * فالمؤشّرُ مؤشّرُ المصمّم، والقاعدةُ تُنقذه ولا تَقوده.
       *
       * والحكمُ على **ما وقع فعلًا** لا على ما طُلب: `withPreset` تَرفض متى كان
       * للعنصر مسارٌ مبنيٌّ باليد، فتُقرَأ الحركةُ بعد الكتابة لا قبلها — ولذلك
       * لا يُذكَر هنا اسمُ نمطٍ بتّةً، و«بدون» لا تُحرّك شيئًا لأنها لا تُصيِّر
       * عدمًا. */
      setElementAnimPreset: (id, preset) =>
        patch((s) => {
          const elements = s.elements.map((e) => (e.id === id ? { ...e, anim: withPreset(e.anim, preset) } : e));
          const after = elements.find((e) => e.id === id);
          const vanished = !!after && rendersNothingAt(after.anim, s.t);
          return {
            elements,
            ...pushHistory(s, (s.lang === 'ar' ? AR : EN).entrance),
            t: vanished ? Math.max(s.t, after.anim.start + after.anim.duration) : s.t,
          };
        }),
      setElementText: (id, text) => patchTextEl(id, { text }),
      setElementFont: (id, fontFamily) => patchTextEl(id, { fontFamily }),
      setElementFontSize: (id, px) => patchTextEl(id, { fontSize: clamp(px, 8, 400) }),
      setElementTracking: (id, percent) => patchTextEl(id, { tracking: clamp(percent, -20, 50) }),
      setTextLineHeight: (id, lh) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id || e.type !== 'text') return e;
            const { lineHeight: _old, ...rest } = e;
            if (!Number.isFinite(lh) || Math.abs(lh - DEFAULT_LINE_HEIGHT) < 1e-9) return rest as DocElement;
            return { ...e, lineHeight: clamp(lh, 0.5, 4) };
          }),
        ),
      setElementWeight: (id, weight) => patchTextEl(id, { weight }),
      setElementColor: (id, hex) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id) return e;
            if (e.type === 'text') return { ...e, color: hex };
            if (e.type === 'shape') return { ...e, fill: hex };
            return e;
          }),
        ),
      setElementHAlign: (id, halign) => patchTextEl(id, { halign }),
      setElementVAlign: (id, valign) => patchTextEl(id, { valign }),
      setElementJustify: (id, justify) => patchTextEl(id, { justify }),
      setTextStagger: (id, p) =>
        commitElements((els) => els.map((e) => (e.id === id && e.type === 'text' ? { ...e, textAnim: { ...e.textAnim, ...p } } : e))),
      setElementOpacity: (id, opacity) => commitElements((els) => els.map((e) => (e.id === id ? { ...e, opacity: clamp(opacity, 0, 100) } : e))),
      // كسرٌ من عرض اللوح، غيرُ سالبٍ — فالساكنةُ لا معنى لسلبها (بخلاف مفتاحِ
      // المسار، وهو فرقٌ فيُسمَح له). والسقفُ `1` أي عرضُ اللوح كلُّه: حدٌّ
      // للمعنى لا للذوق، وشريطُ اللوح يَعرض ٠..١٠٪ منه.
      setElementBlur: (id, blur) => commitElements((els) => els.map((e) => (e.id === id ? { ...e, blur: clamp(blur, 0, 1) } : e))),
      liveUpdateElementBlur: (id, blur) =>
        liveUpdateElements((els) => els.map((e) => (e.id === id ? { ...e, blur: clamp(blur, 0, 1) } : e))),
      setElementPivot: (id, pivot) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id) return e;
            const { pivot: _old, ...rest } = e;
            if (!pivot || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) return rest as DocElement;
            const x = clamp(pivot.x, 0, 1);
            const y = clamp(pivot.y, 0, 1);
            if (Math.abs(x - 0.5) < 1e-9 && Math.abs(y - 0.5) < 1e-9) return rest as DocElement;
            return { ...e, pivot: { x, y } };
          }),
        ),
      setElementGeoPx: (id, p) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id) return e;
            const size = sizeAt(state.sizeIdx, state.customW, state.customH);
            return {
              ...e,
              geo: {
                x: p.x !== undefined ? p.x / size.w : e.geo.x,
                y: p.y !== undefined ? p.y / size.h : e.geo.y,
                w: p.w !== undefined ? p.w / size.w : e.geo.w,
                h: p.h !== undefined ? p.h / size.h : e.geo.h,
                rotation: p.rotation !== undefined ? p.rotation : e.geo.rotation,
              },
            };
          }),
        ),
      // يكتب الحقل القديم **وكومة المظهر معًا**: الحقل القديم وحده لا يُرى على
      // شكلٍ وُضع من المكتبة، لأن الكومة تسبقه في `currentAppearance`. انظر
      // `withBaseLayerColor` في `lib/appearance.ts` لتفصيل القاعدة.
      setShapeFill: (id, hex) =>
        commitElements((els) => els.map((e) => (e.id === id && e.type === 'shape' ? { ...e, fill: hex, appearance: withBaseLayerColor(e, hex) } : e))),
      // والحدُّ على القاعدة نفسها، وقد كان متروكًا خلفها. `withBaseStroke`
      // و`withBaseStrokeHidden` في `lib/appearance.ts` تحملان الدليل المقيس.
      //
      // و**السُّمكُ يُرفَع من الصفر عند الإيقاد**: الشكلُ يُولَد بـ`strokeWidth: 0`
      // (مغلقًا)، وحدٌّ بسُمك صفرٍ لا يرسم بكسلًا واحدًا — فكان «نشِط» يَصدُق في
      // الحالة ويبقى الشكل بلا حدٍّ على الشاشة. والقاعدةُ المستعملة هي قاعدةُ
      // البرنامج نفسها لِسُمكٍ يُرى على هذه الصفحة: `max(2, pageW × LINE_WIDTH_FRACTION)`
      // — وهي حرفيًّا ما يُولَد به خطُّ المكتبة (`shapeFactory.ts:201`) وما يُولَد
      // به مسارُ القلم المفتوح (أدناه في هذا الملفّ)، فلا رقمَ رابعًا يُخترَع هنا.
      setShapeStroke: (id, hex) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id || e.type !== 'shape') return e;
            if (hex === null) return { ...e, stroke: null, appearance: withBaseStrokeHidden(e) };
            const pageW = sizeAt(state.sizeIdx, state.customW, state.customH).w;
            const width = e.strokeWidth > 0 ? e.strokeWidth : Math.max(2, Math.round(pageW * LINE_WIDTH_FRACTION));
            return { ...e, stroke: hex, strokeWidth: width, appearance: withBaseStroke(e, hex, width) };
          }),
        ),
      setShapeStrokeWidth: (id, w) =>
        commitElements((els) =>
          els.map((e) => (e.id === id && e.type === 'shape' ? { ...e, strokeWidth: Math.max(0, w), appearance: withBaseStrokeWidth(e, Math.max(0, w)) } : e)),
        ),
      setShapeRadius: (id, r) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'shape' ? { ...e, radius: clamp(r, 0, 0.5) } : e))),
      setShapeSmoothAmount: (id, amount) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'shape' ? { ...e, smoothAmount: clamp(amount, 0, 1) } : e))),
      liveUpdateShapeSmoothAmount: (id, amount) =>
        liveUpdateElements((els) => els.map((e) => (e.id === id && e.type === 'shape' ? { ...e, smoothAmount: clamp(amount, 0, 1) } : e))),
      toggleShapeCornerPoint: (id, index) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id || e.type !== 'shape') return e;
            const next = [...(e.cornerPoints ?? [])];
            next[index] = !next[index];
            // تحويل نقطة إلى زاوية يحذف مقبضيها الصريحين (لو كان المصمم سحبهما
            // سابقًا): زاوية حادة بمقبض ممتدّ تناقضٌ لا يقصده أحد، وبقاء المقبض
            // يجعل إعادة التبديل إلى "ناعمة" تُعيد شكلًا قديمًا نسيَه المصمم.
            const handles = e.handles ? [...e.handles] : undefined;
            if (handles && next[index]) handles[index] = null;
            return { ...e, cornerPoints: next, ...(handles ? { handles } : {}) };
          }),
        ),
      setImageFit: (id, fit) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'image' ? { ...e, fit } : e))),
      replaceImage: (id) => replaceImage(id),
      startCropEdit: (id) => patch({ cropEditingId: id }),
      endCropEdit: () => patch({ cropEditingId: null }),
      liveUpdateImageCrop: (id, p) =>
        liveUpdateElements((els) => els.map((e) => (e.id === id && e.type === 'image' ? { ...e, ...p } : e))),
      resetImageCrop: (id) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'image' ? { ...e, ...DEFAULT_IMAGE_CROP } : e))),
      setImageFlip: (id, axis) =>
        commitElements((els) => els.map((e) => (e.id === id && e.type === 'image' ? { ...e, [axis === 'h' ? 'flipH' : 'flipV']: !e[axis === 'h' ? 'flipH' : 'flipV'] } : e))),
      setImageRadius: (id, r) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'image' ? { ...e, radius: clamp(r, 0, 0.5) } : e))),
      // وحدُّ **الصورة** كان متروكًا على المسار الميّت نفسِه الذي تُرك عليه حدُّ
      // الشكل: يكتب الحقلَ القديم وحده، والكومةُ المُجسَّدةُ تسبقه في
      // `currentAppearance` فلا يصل التغييرُ إلى ما يُرسَم. والثلاثُ مساعداتٍ
      // تُطبَّق كما هي بلا تعديلِ حرف — `withBaseStroke` و`withBaseStrokeWidth`
      // و`withBaseStrokeHidden` في `lib/appearance.ts` تَقبل أيَّ `DocElement`
      // أصلًا، ولم يَمنع الصورةَ منها إلا أنّ أحدًا لم يُنادِها.
      //
      // والسُّمكُ يُرفَع من الصفر عند الإيقاد بالقاعدة نفسها، ولها هنا سببٌ أقوى
      // منه في الشكل: الصورةُ تُولَد **دائمًا** بـ`strokeWidth: 0` (أعلاه في هذا
      // الملفّ) — لا «أحيانًا» كالشكل المفتوح — فالإيقادُ بلا رفعٍ كان يُنتج
      // «نشِط» بلا بكسلٍ واحدٍ على الشاشة في كلّ مرّة.
      setImageStroke: (id, hex) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id || e.type !== 'image') return e;
            if (hex === null) return { ...e, stroke: null, appearance: withBaseStrokeHidden(e) };
            const pageW = sizeAt(state.sizeIdx, state.customW, state.customH).w;
            const width = e.strokeWidth > 0 ? e.strokeWidth : Math.max(2, Math.round(pageW * LINE_WIDTH_FRACTION));
            return { ...e, stroke: hex, strokeWidth: width, appearance: withBaseStroke(e, hex, width) };
          }),
        ),
      setImageStrokeWidth: (id, w) =>
        commitElements((els) =>
          els.map((e) => (e.id === id && e.type === 'image' ? { ...e, strokeWidth: Math.max(0, w), appearance: withBaseStrokeWidth(e, Math.max(0, w)) } : e)),
        ),
      addFillLayer: (id) =>
        commitElements((els) => els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), fills: [...currentAppearance(e).fills, newFillLayer()] } } : e))),
      removeFillLayer: (id, layerId) =>
        commitElements((els) => els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), fills: currentAppearance(e).fills.filter((l) => l.id !== layerId) } } : e))),
      duplicateFillLayer: (id, layerId) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id) return e;
            const fills = currentAppearance(e).fills;
            const i = fills.findIndex((l) => l.id === layerId);
            if (i < 0) return e;
            const copy = { ...fills[i], id: newElementId('fill') };
            return { ...e, appearance: { ...currentAppearance(e), fills: [...fills.slice(0, i + 1), copy, ...fills.slice(i + 1)] } };
          }),
        ),
      moveFillLayer: (id, layerId, dir) =>
        commitElements((els) => els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), fills: moveLayer(currentAppearance(e).fills, layerId, dir) } } : e))),
      updateFillLayer: (id, layerId, patch) =>
        commitElements((els) =>
          els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), fills: currentAppearance(e).fills.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) } } : e)),
        ),
      addStrokeLayer: (id) =>
        commitElements((els) => els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), strokes: [...currentAppearance(e).strokes, newStrokeLayer()] } } : e))),
      removeStrokeLayer: (id, layerId) =>
        commitElements((els) =>
          els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), strokes: currentAppearance(e).strokes.filter((l) => l.id !== layerId) } } : e)),
        ),
      duplicateStrokeLayer: (id, layerId) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id) return e;
            const strokes = currentAppearance(e).strokes;
            const i = strokes.findIndex((l) => l.id === layerId);
            if (i < 0) return e;
            const copy = { ...strokes[i], id: newElementId('stroke') };
            return { ...e, appearance: { ...currentAppearance(e), strokes: [...strokes.slice(0, i + 1), copy, ...strokes.slice(i + 1)] } };
          }),
        ),
      moveStrokeLayer: (id, layerId, dir) =>
        commitElements((els) => els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), strokes: moveLayer(currentAppearance(e).strokes, layerId, dir) } } : e))),
      updateStrokeLayer: (id, layerId, patch) =>
        commitElements((els) =>
          els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), strokes: currentAppearance(e).strokes.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) } } : e)),
        ),
      addShadowLayer: (id) =>
        commitElements((els) => els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), shadows: [...currentAppearance(e).shadows, newShadowLayer()] } } : e))),
      removeShadowLayer: (id, layerId) =>
        commitElements((els) =>
          els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), shadows: currentAppearance(e).shadows.filter((l) => l.id !== layerId) } } : e)),
        ),
      duplicateShadowLayer: (id, layerId) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id) return e;
            const shadows = currentAppearance(e).shadows;
            const i = shadows.findIndex((l) => l.id === layerId);
            if (i < 0) return e;
            const copy = { ...shadows[i], id: newElementId('shadow') };
            return { ...e, appearance: { ...currentAppearance(e), shadows: [...shadows.slice(0, i + 1), copy, ...shadows.slice(i + 1)] } };
          }),
        ),
      moveShadowLayer: (id, layerId, dir) =>
        commitElements((els) => els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), shadows: moveLayer(currentAppearance(e).shadows, layerId, dir) } } : e))),
      updateShadowLayer: (id, layerId, patch) =>
        commitElements((els) =>
          els.map((e) => (e.id === id ? { ...e, appearance: { ...currentAppearance(e), shadows: currentAppearance(e).shadows.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) } } : e)),
        ),
      setLottieLoop: (id, loop) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'lottie' ? { ...e, loop } : e))),
      insertVideoTool,
      insertVideoFromFile,
      replaceVideo,
      setVideoTrim: (id, trimIn, trimOut) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id || e.type !== 'video') return e;
            const inSec = clamp(trimIn, 0, e.durationSec);
            const outSec = clamp(trimOut, inSec + 0.1, e.durationSec);
            return { ...e, trimIn: inSec, trimOut: outSec };
          }),
        ),
      setAudioVolume: (id, volume) => commitElements((els) => els.map((e) => (e.id === id && (e.type === 'audio' || e.type === 'video') ? { ...e, volume: clamp(volume, 0, 1) } : e)), (state.lang === 'ar' ? AR : EN).undo_audio_volume),
      setAudioMuted: (id, muted) => commitElements((els) => els.map((e) => (e.id === id && (e.type === 'audio' || e.type === 'video') ? { ...e, muted } : e)), (state.lang === 'ar' ? AR : EN).undo_audio_mute),
      liveSetAudioVolume: (id, volume) => liveUpdateElements((els) => els.map((e) => (e.id === id && (e.type === 'audio' || e.type === 'video') ? { ...e, volume: clamp(volume, 0, 1) } : e))),
      insertAudioTool,
      insertAudioFromFile,
      insertFx,
      setFxProps: (id, p) =>
        commitElements(
          (els) => els.map((e) => (e.id === id && e.type === 'fx' ? { ...e, ...p, ...(p.amount !== undefined ? { amount: clamp(p.amount, 0, 1) } : {}) } : e)),
          (state.lang === 'ar' ? AR : EN).undo_fx_edit,
        ),
      liveSetFxProps: (id, p) =>
        liveUpdateElements((els) => els.map((e) => (e.id === id && e.type === 'fx' ? { ...e, ...p, ...(p.amount !== undefined ? { amount: clamp(p.amount, 0, 1) } : {}) } : e))),
      setVideoVolume: (id, volume) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'video' ? { ...e, volume: clamp(volume, 0, 1) } : e))),
      setVideoMuted: (id, muted) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'video' ? { ...e, muted } : e))),
      setVideoLoop: (id, loop) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'video' ? { ...e, loop } : e))),
      applyClippingMask: (targetId, maskShapeId) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id === targetId) return { ...e, maskId: maskShapeId };
            if (e.id === maskShapeId && e.type === 'shape') return { ...e, visible: false };
            return e;
          }),
        ),
      releaseClippingMask: (targetId) =>
        commitElements((els) => {
          const target = els.find((e) => e.id === targetId);
          const maskId = target?.maskId ?? null;
          return els.map((e) => {
            if (e.id === targetId) return { ...e, maskId: null };
            if (maskId && e.id === maskId && e.type === 'shape') return { ...e, visible: true };
            return e;
          });
        }),
      setTextPathId: (targetId, pathShapeId) =>
        commitElements((els) => els.map((e) => (e.id === targetId && e.type === 'text' ? { ...e, pathId: pathShapeId } : e))),
      setLockAspect: (lockAspect) => patch({ lockAspect }),
      toggleVisible: (id) => commitElements((els) => els.map((e) => (e.id === id ? { ...e, visible: !e.visible } : e))),
      groupSelected: () =>
        setState((s) => {
          // مجموعةٌ من عنصرٍ واحد لا معنى لها، ولا يجوز أن تُسجَّل خطوة تراجعٍ لإيماءةٍ
          // لم تغيّر شيئًا — نفس عقد `commitElementEdit`.
          const ids = expandGroups(s.selectedIds, s.elements);
          if (ids.length < 2) return s;
          const gid = newGroupId();
          const inGroup = (e: DocElement) => ids.includes(e.id);
          // المجاورة في ترتيب الطبقات: تُسحب الأعضاء من أماكنها وتُعاد دفعةً واحدة
          // عند موضع **أعلاها**، محتفظةً بترتيبها النسبيّ فيما بينها. بذلك لا يتخلّل
          // المجموعةَ عنصرٌ غريب، فتتصرّف كوحدةٍ على اللوحة كما تبدو في القائمة.
          const members = s.elements.filter(inGroup).map((e) => ({ ...e, groupId: gid }));
          const rest = s.elements.filter((e) => !inGroup(e));
          const topIdx = s.elements.reduce((acc, e, i) => (inGroup(e) ? i : acc), 0);
          // عدد غير الأعضاء الواقعين تحت أعلى عضو = موضع إدراج الكتلة داخل `rest`.
          const insertAt = s.elements.slice(0, topIdx).filter((e) => !inGroup(e)).length;
          const elements = [...rest.slice(0, insertAt), ...members, ...rest.slice(insertAt)];
          return {
            ...s,
            elements,
            selectedIds: members.map((e) => e.id),
            sel: members[0]?.id ?? s.sel,
            ...pushHistory(s),
          };
        }),
      ungroupSelected: () =>
        setState((s) => {
          const gids = new Set(
            s.selectedIds.map((id) => s.elements.find((e) => e.id === id)?.groupId).filter((g): g is string => !!g),
          );
          if (!gids.size) return s; // لا مجموعة ملموسة: لا تغيير، فلا خطوة تراجع.
          return {
            ...s,
            elements: s.elements.map((e) => (e.groupId && gids.has(e.groupId) ? { ...e, groupId: null } : e)),
            ...pushHistory(s),
          };
        }),
      lockSelected: () =>
        setState((s) => {
          const ids = expandGroups(s.selectedIds, s.elements).filter((id) => !s.elements.find((e) => e.id === id)?.locked);
          if (!ids.length) return s;
          return {
            ...s,
            elements: s.elements.map((e) => (ids.includes(e.id) ? { ...e, locked: true } : e)),
            // المقفل غير قابلٍ للتحديد، فإبقاؤه محدَّدًا بعد القفل يترك مقابضَ تحديدٍ
            // على عنصرٍ لا يستجيب لها — وهي أوضح صورةٍ لـ«ضغطت فلم يحدث شيء».
            selectedIds: [],
            sel: null,
            ...pushHistory(s),
          };
        }),
      toggleLocked: (id) =>
        setState((s) => {
          const target = s.elements.find((e) => e.id === id);
          if (!target) return s;
          const ids = expandGroups([id], s.elements);
          const nextLocked = !target.locked;
          return {
            ...s,
            elements: s.elements.map((e) => (ids.includes(e.id) ? { ...e, locked: nextLocked } : e)),
            selectedIds: nextLocked ? s.selectedIds.filter((x) => !ids.includes(x)) : s.selectedIds,
            sel: nextLocked && s.sel && ids.includes(s.sel) ? null : s.sel,
            ...pushHistory(s),
          };
        }),
      unlockAll: () =>
        setState((s) => {
          if (!s.elements.some((e) => e.locked)) return s;
          return {
            ...s,
            elements: s.elements.map((e) => (e.locked ? { ...e, locked: false } : e)),
            ...pushHistory(s),
          };
        }),
      hideSelected: () =>
        setState((s) => {
          const ids = expandGroups(s.selectedIds, s.elements).filter((id) => s.elements.find((e) => e.id === id)?.visible);
          if (!ids.length) return s;
          return {
            ...s,
            elements: s.elements.map((e) => (ids.includes(e.id) ? { ...e, visible: false } : e)),
            // المخفيّ يسقط من اختبار الإصابة (`Stage.tsx`) فلا يُنقَر — فلا يبقى محدَّدًا.
            selectedIds: [],
            sel: null,
            ...pushHistory(s),
          };
        }),
      showAll: () =>
        setState((s) => {
          if (s.elements.every((e) => e.visible)) return s;
          return {
            ...s,
            elements: s.elements.map((e) => (e.visible ? e : { ...e, visible: true })),
            ...pushHistory(s),
          };
        }),
      renameElement: (id, name) =>
        commitElements((els) => {
          const trimmed = name.trim();
          // اسمٌ فارغ ليس اسمًا: يُحذف الحقل فيعود السطر إلى الاسم المشتقّ من المحتوى
          // (`elementDisplayName`) بدل أن يعرض فراغًا.
          return els.map((e) => (e.id === id ? { ...e, name: trimmed || undefined } : e));
        }),
      bringForward: (ids) =>
        commitElements((els) => {
          const next = [...els];
          for (let i = next.length - 2; i >= 0; i--) {
            if (ids.includes(next[i].id) && !ids.includes(next[i + 1].id)) {
              [next[i], next[i + 1]] = [next[i + 1], next[i]];
            }
          }
          return next;
        }),
      sendBackward: (ids) =>
        commitElements((els) => {
          const next = [...els];
          for (let i = 1; i < next.length; i++) {
            if (ids.includes(next[i].id) && !ids.includes(next[i - 1].id)) {
              [next[i], next[i - 1]] = [next[i - 1], next[i]];
            }
          }
          return next;
        }),
      reorderElement: (id, toIndex) =>
        commitElements((els) => {
          const idx = els.findIndex((e) => e.id === id);
          if (idx === -1) return els;
          const next = [...els];
          const [item] = next.splice(idx, 1);
          next.splice(clamp(toIndex, 0, next.length), 0, item);
          return next;
        }),
      alignSelected: (edge) =>
        commitElements((els) => {
          const ids = new Set(state.selectedIds);
          return els.map((e) => {
            if (!ids.has(e.id)) return e;
            const geo = { ...e.geo };
            if (edge === 'left') geo.x = 0;
            else if (edge === 'right') geo.x = 1 - geo.w;
            else if (edge === 'center') geo.x = (1 - geo.w) / 2;
            else if (edge === 'top') geo.y = 0;
            else if (edge === 'bottom') geo.y = 1 - geo.h;
            else if (edge === 'middle') geo.y = (1 - geo.h) / 2;
            return { ...e, geo };
          });
        }),
      distributeSelected: (axis) =>
        commitElements((els) => {
          const ids = state.selectedIds;
          if (ids.length < 3) return els;
          const targets = els.filter((e) => ids.includes(e.id)).sort((a, b) => (axis === 'x' ? a.geo.x - b.geo.x : a.geo.y - b.geo.y));
          const first = targets[0];
          const last = targets[targets.length - 1];
          const span = axis === 'x' ? last.geo.x - first.geo.x : last.geo.y - first.geo.y;
          const step = span / (targets.length - 1);
          const posById = new Map<ElementId, number>();
          targets.forEach((t, i) => posById.set(t.id, (axis === 'x' ? first.geo.x : first.geo.y) + step * i));
          return els.map((e) => {
            if (!posById.has(e.id)) return e;
            const pos = posById.get(e.id)!;
            return { ...e, geo: axis === 'x' ? { ...e.geo, x: pos } : { ...e.geo, y: pos } };
          });
        }),
      deleteSelected: () =>
        setState((s) => {
          if (!s.selectedIds.length) return s;
          const ids = new Set(s.selectedIds);
          return {
            ...s,
            elements: s.elements.filter((e) => !ids.has(e.id)),
            selectedIds: [],
            sel: null,
            ...pushHistory(s),
          };
        }),
      beginElementEdit,
      commitElementEdit,
      cancelElementEdit,
      liveUpdateElements,
      commitElements,
      splitAtPlayhead,
      nudgeSelected: (dx, dy) =>
        commitElements((els) => {
          const size = sizeAt(state.sizeIdx, state.customW, state.customH);
          const ids = new Set(state.selectedIds);
          return els.map((e) => (ids.has(e.id) ? { ...e, geo: { ...e.geo, x: e.geo.x + dx / size.w, y: e.geo.y + dy / size.h } } : e));
        }),
      startTextEdit: (id) => patch({ editingTextId: id }),
      commitTextEdit: (id, text) =>
        setState((s) => {
          const current = s.elements.find((e) => e.id === id);
          if (current?.type !== 'text' || current.text === text) return { ...s, editingTextId: null };
          return {
            ...s,
            editingTextId: null,
            elements: s.elements.map((e) => (e.id === id && e.type === 'text' ? { ...e, text } : e)),
            ...pushHistory(s),
          };
        }),
      addShapeElement: (kind, geoPx, opts) =>
        setState((s) => {
          const size = sizeAt(s.sizeIdx, s.customW, s.customH);
          const id = newElementId('shape');
          const recipe = { kind, n: opts?.n };
          const g = shapeGeometryFor(recipe, opts?.lineVector);
          // الرماديّ المحيَّد `#919191` يخصّ **نقرة المكتبة** وحدها، لا سحبة الرسم.
          // الأداة الشائعة لا تملك أداة رسم بالسحب إطلاقًا — الشكل عندها يُنتقى من لوح فيهبط
          // بذلك الرمادي (`re-canva-flows.md` §2.4) — فتعميم الرقم على السحب كان
          // سيكون استنتاجًا لا قياسًا، وكان سيغيّر لون كل شكل يرسمه مستخدم حالي.
          // سحبة الرسم تبقى على `fillToken: 'ac'` كما كانت بالضبط.
          const placeholder = opts?.placeholderFill === true;
          const el: DocElement = {
            id,
            type: 'shape',
            visible: true,
            locked: false,
            opacity: 100,
            maskId: null,
            geo: { x: geoPx.x / size.w, y: geoPx.y / size.h, w: geoPx.w / size.w, h: geoPx.h / size.h, rotation: 0 },
            shape: g.shape,
            fill: placeholder ? PLACEHOLDER_FILL : null,
            fillToken: 'ac',
            stroke: null,
            // الخطّ وحده يحمل سُمك حدٍّ: مسار مفتوح لا مساحة له تُعبَّأ، فبلا حدّ لا
            // يُرى شيء. والقيمة نسبةٌ من عرض الصفحة كبقيّة كل شيء هنا.
            strokeWidth: g.closed === false ? Math.max(2, Math.round(size.w * LINE_WIDTH_FRACTION)) : 0,
            radius: g.radius,
            ...(g.points ? { points: g.points, closed: g.closed } : {}),
            // طبقات مظهر صريحة **لأشكال المسار فقط**: `migrateAppearance` تمنح كل
            // `shape:'path'` طبقة حدٍّ إلزاميّة بسُمك 2 (إرثُ مسار القلم اليدوي)،
            // فمثلّث أو نجمة كانا سيصلان بحدٍّ لم يطلبه أحد — والأداة الشائعة تقيس «لا حدّ»
            // على الشكل الجديد. أمّا `rect`/`ellipse` فتُترك بلا `appearance`
            // إطلاقًا كما كانت، فيبقى عقد الترحيل المتأخّر (lazy migration) الذي
            // تقيسه `appearance-stack.spec.mjs` كما هو حرفيًّا.
            ...(g.shape === 'path'
              ? {
                  appearance: placeholder
                    ? libraryAppearance(recipe, size.w)
                    : g.closed === false
                      ? { fills: [], strokes: [newStrokeLayer({ colorToken: 'fg', width: Math.max(2, Math.round(size.w * LINE_WIDTH_FRACTION)), position: 'center' })], shadows: [] }
                      : { fills: [newFillLayer({ colorToken: 'ac' })], strokes: [], shadows: [] },
                }
              : {}),
            anim: defaultAnim('none', 0, 0.6),
          };
          return {
            ...s,
            elements: [...s.elements, el],
            selectedIds: [id],
            sel: id,
            tool: 'select',
            // الأداة ترتدّ إلى «تحديد» (كما كانت)، ولأن «تحديد» ليست مكتبة
            // (`TOOL_LIBRARY.select === 'none'`) يرتدّ اللوح معها إلى «التصميم» —
            // فيجد المصمم خصائص الشكل الذي وضعه للحظته أمامه، لا لوح المكتبة الذي
            // انتهى منه. وهو ما يقيسه محرّر فيديو شائع أيضًا: مفتّش مربوط بالتحديد
            // (`re-capcut-flows.md` §5.4).
            panel: 'props',
            ...pushHistory(s),
          };
        }),
      /** نقرة على بطاقة في لوح الأشكال: تضع الشكل فورًا — **بلا أي سحب**.
       *
       * هنا يُحسَم تضارب حقيقي بين قياسين، لا يُؤخَذ متوسّطه:
       *
       * - **الأداة الشائعة**: النقرة **تضع** الشكل (324×324 = 30% من عرض الصفحة، في المنتصف
       *   تمامًا، `#919191`، بلا حدّ) — `re-canva-flows.md` §2.4.
       * - **محرّر فيديو شائع**: النقرة **معاينة فقط**، والسحب إلى الخط الزمني هو الالتزام —
       *   `re-capcut-flows.md` §2.5.
       *
       * أُخذت دلالة الأداة الشائعة، **لأن سبب محرّر فيديو شائع في حجب الالتزام لا ينطبق على مزيج**:
       * الإفلات في محرّر فيديو شائع يحمل معلومة لا تحملها النقرة — **الزمن** (قيس: المقطع بدأ
       * عند نقطة الإفلات ≈1.27s، لا عند رأس التشغيل ولا عند الصفر، §2.7). فالنقرة
       * هناك *ناقصة* بطبيعتها. أمّا هنا فالشكل يهبط على لوحة ثابتة، و«في المنتصف»
       * جوابٌ كامل لا ناقص — فلا شيء يُحجَب.
       *
       * ولم يُختَر أحدهما على حساب الآخر أصلًا: الإيماءتان على **سطحين مختلفين**،
       * فلا تتنافسان ولا تُخطئ إحداهما الأخرى. نقرة على بطاقة في اللوح = ضَعْ
       * بالمقاس النسبي. سحبة على اللوحة بأداة الأشكال = ارسم صندوقًا بالضبط، بكل
       * مُعدِّلاتها. المصمم الذي يريد 30% في المنتصف ينقر، والذي يريد صندوقًا محدَّدًا
       * يسحب، ولا يقع أحدهما في الأخرى بالخطأ لأن سطح البداية مختلف. */
      placeShapeFromLibrary: (recipe) =>
        setState((s) => {
          const size = sizeAt(s.sizeIdx, s.customW, s.customH);
          const box = clickPlacementBox(size);
          const id = newElementId('shape');
          const g = shapeGeometryFor(recipe);
          const el: DocElement = {
            id,
            type: 'shape',
            visible: true,
            locked: false,
            opacity: 100,
            maskId: null,
            geo: { x: box.x / size.w, y: box.y / size.h, w: box.w / size.w, h: box.h / size.h, rotation: 0 },
            shape: g.shape,
            fill: PLACEHOLDER_FILL,
            fillToken: 'ac',
            stroke: null,
            strokeWidth: g.closed === false ? Math.max(2, Math.round(size.w * LINE_WIDTH_FRACTION)) : 0,
            radius: g.radius,
            ...(g.points ? { points: g.points, closed: g.closed } : {}),
            appearance: libraryAppearance(recipe, size.w),
            anim: defaultAnim('none', 0, 0.6),
          };
          return {
            ...s,
            elements: [...s.elements, el],
            selectedIds: [id],
            sel: id,
            tool: 'select',
            // **ولوح «عناصر» يبقى مفتوحًا** (الأداة الشائعة، ولوح «نصوص» عندنا). كان يُرجِع
            // `panel: 'props'` ليرى المصمّم خصائص الشكل «لا لوح المكتبة الذي انتهى منه» —
            // وذاك يوم كان لوحٌ واحد يتناوبه الاثنان. وفي «لوحة واحدة، ثلاثة أعماق»
            // المفتشُ قائمٌ بذاته على الجانب الآخر، فالخصائص أمامه أصلًا، وإغلاقُ اللوح
            // لا يُكسبه شيئًا ويكلّفه فتحه من جديد لكلّ شكلٍ تالٍ (قيس في الجولة: دائرةٌ
            // ثم يرجع للشريط ليضع الثانية). ولمسُ اللوحة نفسها ما زال يُغلقه
            // (`leaveInsertLibrary`).
            shapeDrawKind: recipe.kind,
            shapeDrawN: recipe.n ?? s.shapeDrawN,
            ...pushHistory(s),
          };
        }),
      setShapeDrawN: (shapeDrawN) => patch({ shapeDrawN: clamp(shapeDrawN, MIN_SHAPE_N, MAX_SHAPE_N) }),
      /** يفتح لوح مكتبة أداةٍ ما ويُسلِّح الأداة نفسها في الآن ذاته.
       * الزرّ الواحد يفعل الأمرين: يبدّل اللوح (قاعدة محرّر فيديو شائع) ويُسلِّح الرسم بالسحب
       * (قاعدة أداة المتّجهات) — فلا يحتاج المصمم أن يعرف أيّهما كان يقصد. */
      openToolLibrary: (tool) =>
        patch((s) => ({
          // المُوَدِّعُ الواحد: إثباتُ المسودّة، وهدمُ أوضاع التحرير، ونزعُ
          // التحديد. وكان هذا المسارُ يُكرّر الشرطَ الثلاثيّ بنفسه — وهو **المسارُ
          // الذي يُنادِيه الشريطُ والاختصارُ بحرفٍ واحد**، أي طريقُ المصمّم
          // الحقيقيّ إلى تسليح أداة، فلا يُترك على نسخةٍ ثانيةٍ من القاعدة.
          ...armTool(s, tool),
          // أداةٌ بلا مكتبة («تحديد») لا تَرِث تبويب «العناصر»: لو كتبت نفسها في
          // `libraryTool` لصار التبويب يعرض «تحديد — قريبًا»، وهو هراء — التحديد
          // ليس محتوًى يُستعرَض. فيبقى التبويب على آخر مكتبةٍ حقيقيّة زارها
          // المصمم، ويعود اللوح نفسه إلى «التصميم».
          ...(TOOL_LIBRARY[tool] === 'none' ? {} : { libraryTool: tool }),
          panel: TOOL_LIBRARY[tool] === 'none' ? 'props' : 'library',
        })),
      addPathElement: (points, closed, bboxPx) =>
        setState((s) => {
          const size = sizeAt(s.sizeIdx, s.customW, s.customH);
          const id = newElementId('path');
          const el: DocElement = {
            id,
            type: 'shape',
            visible: true,
            locked: false,
            opacity: 100,
            maskId: null,
            geo: { x: bboxPx.x / size.w, y: bboxPx.y / size.h, w: Math.max(bboxPx.w, 1) / size.w, h: Math.max(bboxPx.h, 1) / size.h, rotation: 0 },
            shape: 'path',
            fill: closed ? null : 'transparent',
            fillToken: 'ac',
            stroke: null,
            strokeWidth: 4,
            radius: 0,
            points,
            closed,
            anim: defaultAnim('none', 0, 0.6),
          };
          return {
            ...s,
            elements: [...s.elements, el],
            selectedIds: [id],
            sel: id,
            tool: 'select',
            ...pushHistory(s),
          };
        }),
      penAddPoint: (x, y) => patch((s) => ({ penDraft: [...s.penDraft, { x, y }] })),
      penSetDraftHandle: (handle) =>
        patch((s) => {
          if (!s.penDraft.length) return {};
          const next = [...s.penDraft];
          next[next.length - 1] = { ...next[next.length - 1], h: handle };
          return { penDraft: next };
        }),
      penCancel: () => patch({ penDraft: [] }),
      setPenClosePath: (v) => patch({ penClosePath: v }),
      // الجسمُ كلُّه صار `commitPenDraft` في أعلى هذا الملفّ، لأن **موضعَين**
      // يُثبِّتان المسودّةَ الآن لا موضعٌ واحد: الاختتامُ الصريح (مفتاح `Enter`،
      // ونقرةٌ مزدوجة، وإغلاقُ المسار على نقطته الأولى) ومغادرةُ الأداة. وما
      // تُضيفه هذه الدالّةُ فوق المُثبِّت هو **الوجهة** وحدها: الاختتامُ الصريح
      // يُرجِع إلى «تحديد» والمسارُ محدَّد — وهو عقدُها القائم، ولم يتغيّر حرفًا.
      // ومسارُ المغادرة وجهتُه الأداةُ التي ضُغطت، فلا تُسمّيها المُثبِّتة.
      penFinish: (forceClosed) => setState((s) => (s.penDraft.length < 2 ? { ...s, penDraft: [] } : { ...commitPenDraft(s, forceClosed), tool: 'select' })),

      // --- وضع تحرير العقد (بند #11، تكملة) ------------------------------------
      // كل سحبة (نقطة ربط أو مقبض) تمرّ بـ`beginElementEdit` ثم `liveUpdate*` لكل
      // حركة مؤشّر ثم `commitElementEdit` — نفس نمط سحب/تحجيم العناصر في `Stage`،
      // فالسحبة الواحدة = خطوة تراجع واحدة لا خطوة لكل بكسل.
      startNodeEdit: (id) => patch({ nodeEditId: id, nodeEditSel: null, selectedIds: [id], sel: id, tool: 'select' }),
      endNodeEdit: () => patch({ nodeEditId: null, nodeEditSel: null }),
      selectPathNode: (index, part) => patch({ nodeEditSel: { index, part } }),
      liveUpdatePathPoint: (id, index, pt) =>
        liveUpdateElements((els) =>
          els.map((e) => {
            if (e.id !== id || e.type !== 'shape' || !e.points?.[index]) return e;
            const points = [...e.points];
            points[index] = pt;
            // المقابض إزاحات من النقطة، فسحب النقطة ينقلها معه بلا أي تعديل — هذا
            // سبب تخزينها كإزاحات أصلًا (انظر `ShapeElement.handles`).
            return { ...e, points };
          }),
        ),
      liveUpdatePathHandle: (id, index, part, vec, mirror) =>
        liveUpdateElements((els) =>
          els.map((e) => {
            if (e.id !== id || e.type !== 'shape' || !e.points?.[index]) return e;
            const handles: NonNullable<typeof e.handles> = e.points.map((_, i) => e.handles?.[i] ?? null);
            const other = part === 'out' ? 'in' : 'out';
            handles[index] = {
              ...(handles[index] ?? {}),
              [part]: vec,
              ...(mirror ? { [other]: { x: -vec.x, y: -vec.y } } : {}),
            };
            // سحب مقبض يُلغي علم «زاوية» عن نقطته: المصمم طلب انحناءً صريحًا عندها،
            // وإبقاء العلم يجعل `fitSmoothPath` يتجاهل المقبض فلا يتحرّك شيء على
            // الشاشة أثناء السحب — عطل صامت.
            const cornerPoints = e.cornerPoints?.[index] ? e.cornerPoints.map((c, i) => (i === index ? false : c)) : e.cornerPoints;
            return { ...e, handles, ...(cornerPoints ? { cornerPoints } : {}) };
          }),
        ),
      deletePathPoint: (id, index) =>
        setState((s) => {
          const el = s.elements.find((e) => e.id === id);
          if (!el || el.type !== 'shape' || !el.points || index < 0 || index >= el.points.length) return s;
          const nextPoints = el.points.filter((_, i) => i !== index);
          const dropAt = <T,>(arr: T[] | undefined): T[] | undefined => (arr ? arr.filter((_, i) => i !== index) : undefined);
          // أقل من نقطتين = لا مسار؛ حذف العنصر كله أصدق من ترك عنصر بنقطة واحدة لا
          // يُرسَم ولا يُحدَّد (نفس ما يفعله `deleteSelected` لكن كخطوة التراجع نفسها).
          const elements =
            nextPoints.length < 2
              ? s.elements.filter((e) => e.id !== id)
              : s.elements.map((e) =>
                  e.id === id && e.type === 'shape'
                    ? { ...e, points: nextPoints, cornerPoints: dropAt(e.cornerPoints), handles: dropAt(e.handles) }
                    : e,
                );
          const gone = nextPoints.length < 2;
          return {
            ...s,
            elements,
            nodeEditId: gone ? null : s.nodeEditId,
            nodeEditSel: null,
            selectedIds: gone ? [] : s.selectedIds,
            sel: gone ? null : s.sel,
            ...pushHistory(s),
          };
        }),
      insertPathPoint: (id, segIndex, t) =>
        setState((s) => {
          const el = s.elements.find((e) => e.id === id);
          if (!el || el.type !== 'shape' || !el.points) return s;
          const next = insertAnchorOnSegment(el.points, !!el.closed, el.smoothAmount ?? 0, el.cornerPoints, el.handles, segIndex, t);
          if (!next) return s;
          return {
            ...s,
            elements: s.elements.map((e) =>
              e.id === id && e.type === 'shape' ? { ...e, points: next.points, cornerPoints: next.cornerPoints, handles: next.handles } : e,
            ),
            nodeEditSel: { index: segIndex + 1, part: 'anchor' },
            ...pushHistory(s),
          };
        }),
      applyBooleanOp: (op, ids) =>
        setState((s) => {
          const size = sizeAt(s.sizeIdx, s.customW, s.customH);
          // Back-to-front = the order these ids already sit in `s.elements` — see
          // `computeBooleanOp` for why order matters (only for `subtract`).
          const shapes = s.elements.filter((e): e is DocElement & { type: 'shape' } => ids.includes(e.id) && isBooleanEligible(e));
          if (shapes.length < 2) return s;
          const result = computeBooleanOp(op, shapes, size);
          if (!result) return s;
          // Inherit style from the frontmost input shape, same "top element is
          // special" convention as `applyClippingMask`'s mask-picking rule.
          const front = shapes[shapes.length - 1];
          const id = newElementId('path');
          const el: DocElement = {
            id,
            type: 'shape',
            visible: true,
            locked: false,
            opacity: 100,
            maskId: null,
            geo: { x: result.geo.x / size.w, y: result.geo.y / size.h, w: result.geo.w / size.w, h: result.geo.h / size.h, rotation: 0 },
            shape: 'path',
            fill: front.fill,
            fillToken: front.fillToken,
            stroke: front.stroke,
            strokeWidth: front.strokeWidth,
            radius: 0,
            subpaths: result.subpaths,
            closed: true,
            anim: defaultAnim('none', 0, 0.6),
          };
          // Insert where the bottom-most input shape used to sit, counted among the
          // elements that survive — so anything that was layered between/around the
          // inputs keeps its relative z-order.
          const idSet = new Set(ids);
          const bottomOriginalIndex = s.elements.findIndex((e) => e.id === shapes[0].id);
          let insertPos = 0;
          for (let i = 0; i < bottomOriginalIndex; i++) if (!idSet.has(s.elements[i].id)) insertPos++;
          const remaining = s.elements.filter((e) => !idSet.has(e.id));
          const elements = [...remaining.slice(0, insertPos), el, ...remaining.slice(insertPos)];
          return {
            ...s,
            elements,
            selectedIds: [id],
            sel: id,
            ...pushHistory(s),
          };
        }),
      convertTextToOutline: (id, outline, geo, fill) =>
        setState((s) => {
          const target = s.elements.find((e) => e.id === id);
          if (!target || target.type !== 'text') return s;
          const el: DocElement = {
            id: target.id,
            type: 'shape',
            visible: target.visible,
            locked: target.locked,
            opacity: target.opacity,
            maskId: target.maskId,
            anim: target.anim,
            geo,
            shape: 'path',
            fill,
            fillToken: 'fg',
            stroke: null,
            strokeWidth: 0,
            radius: 0,
            closed: true,
            outline,
          };
          const elements = s.elements.map((e) => (e.id === id ? el : e));
          return { ...s, elements, ...pushHistory(s) };
        }),
      insertImageTool,
      insertImageFromFile,
      insertLottieTool,
      insertLottieFromFile,
      replaceLottie,
      undo,
      redo,
      setFontUrl: (fontUrl) => patch({ fontUrl }),
      addFont,
      addFontFromFile,
      addSystemFont,
      removeUserFont,
      // Roadmap #16: also mirrors onto the active artboard's own metadata (see
      // `ArtboardMeta.paletteIdx`) so a palette choice survives switching away and
      // back — the global `postPalette`/`PALETTES[...]` read everywhere else always
      // reflects whichever artboard is currently active, unchanged.
      setBackgroundColor: (color) =>
        setState((s) => {
          // خطوةٌ واحدة في سجلّ التراجع، لا اثنتان: إن كانت زخرفة اللوحة ظاهرة فهي
          // تُرسم تحت العناصر كلّها، وطبقةُ خلفيةٍ تملأ اللوحة كانت ستُخفيها. فتصير
          // الزخرفة عنصرًا حقيقيًّا (بالمعادلة نفسها في `Stage.tsx` و`exportArtboard.ts`)
          // فوق الخلفية مباشرةً — يبقى المظهر كما هو، وتصير الدائرة قابلةً للتحديد.
          const exists = s.elements.some((e) => e.id === BACKGROUND_ID);
          let elements = exists
            ? s.elements.map((e) => (e.id === BACKGROUND_ID && e.type === 'shape' ? { ...e, fill: color } : e))
            : [backgroundLayer(color), ...s.elements];
          let decorAccent = s.decorAccent;
          if (decorAccent) {
            const size = sizeAt(s.sizeIdx, s.customW, s.customH);
            const at = elements.findIndex((e) => e.id === BACKGROUND_ID) + 1;
            elements = [...elements.slice(0, at), decorLayer(size.w, size.h), ...elements.slice(at)];
            decorAccent = false;
          }
          return { ...s, elements, decorAccent, ...pushHistory(s, 'الخلفية') };
        }),
      setPostPalette: (postPalette) => patch((s) => ({ postPalette, artboards: s.artboards.map((a) => (a.id === s.activeArtboardId ? { ...a, paletteIdx: postPalette } : a)) })),
      setDecorAccent: (decorAccent) => patchDoc({ decorAccent }),
      applyPaletteToAll: () =>
        commitElements((els) =>
          els.map((e) => {
            // Also clears any materialized appearance stack back to `undefined` so it
            // re-synthesizes fresh from the now-null legacy field + palette token on next
            // render (`resolveAppearance`) — otherwise a stack built from a since-overridden
            // `color`/`fill` would keep painting the old literal color instead of re-tracking
            // the palette like this action promises (roadmap #5, unaffected by roadmap #17).
            if (e.type === 'text') return { ...e, color: null, appearance: undefined };
            if (e.type === 'shape') return { ...e, fill: null, labelColor: e.label ? null : e.labelColor, appearance: undefined };
            return e;
          }),
        ),
      setAiInput: (aiInput) => patch({ aiInput }),
      sendAi,
      setAiEngine,
      setAiCustomCmd,
      cancelAi,
      detectAiAgents,
      openExport: () => patch({ exportOpen: true, exportState: 'idle', exportProgress: 0, exportError: null, exportResults: [] }),
      closeExport: () => {
        patch({ exportOpen: false, exportState: 'idle' });
      },
      setExportFormat: (exportFormat) =>
        patch((s) => {
          // MP4 has no alpha channel — switching to it forces the transparent
          // toggle off instead of silently ignoring it later at encode time.
          if (exportFormat === 'mp4' || exportFormat === 'gif') {
            const choices = FPS_OPTIONS[exportFormat];
            const fps = choices.includes(s.exportFps) ? s.exportFps : DEFAULT_FPS[exportFormat];
            return exportSettingChanged(s, { exportFormat, exportFps: fps, exportTransparent: exportFormat === 'mp4' ? false : s.exportTransparent });
          }
          // Live Photo's still half is a JPEG — no alpha channel either, same
          // belt-and-suspenders lockout as mp4 above.
          if (exportFormat === 'livephoto') {
            return exportSettingChanged(s, { exportFormat, exportTransparent: false });
          }
          return exportSettingChanged(s, { exportFormat });
        }),
      toggleExportTarget: (id) => patch((s) => exportSettingChanged(s, { targets: { ...s.targets, [id]: !s.targets[id] } })),
      // يشتق القائمة من `SIZES` بدل تعدادٍ مكتوب بالاسم: كان مكتوبًا
      // `{ ig, x, tt, li }` حرفيًا، فصار «تحديد الكل» يحدّد أربعةً من ثلاثة عشر
      // بعد توسيع فهرس المقاسات — زرٌّ يقول الكل ويعني بعضه.
      selectAllTargets: () => patch((s) => exportSettingChanged(s, { targets: Object.fromEntries(SIZES.map((z) => [z.id, true])) })),
      selectProjectSizeTarget: () =>
        patch((s) => {
          // هدفٌ واحد: مقاس هذه اللوحة بعينه — بـ`defaultTargetsFor` نفسِها التي
          // تَبذر الافتراض، فلا يَنحرف الزرُّ عمّا يَفتح عليه الحوار.
          //
          // **وقد كان هذا الزرُّ علاجَ عطلٍ، فصار رجعةً عن توسيعٍ مقصود.** يومَ
          // كُتب كانت الأهدافُ الافتراضيّة أربعةً مكتوبةً بالاسم لا يَربطها
          // بالمشروع شيء، فكان الزرُّ هو الطريقَ الوحيدَ إلى ملفٍّ واحدٍ بمقاس
          // صاحبه. والافتراضُ الآن مقاسُ المشروع نفسُه، فدَورُه أن يَرجع إلى
          // الواحد بعد «تحديد الكل» أو بعد نقراتٍ على البلاطات — وهو دَورٌ قائم:
          // الرجوعُ من ثلاثةَ عشر إلى واحدٍ نقرةٌ واحدة، لا اثنتا عشرة.
          const targets = defaultTargetsFor(s.sizeIdx);
          return Object.keys(targets).length ? exportSettingChanged(s, { targets }) : {};
        }),
      setExportScale: (exportScale) => patch((s) => exportSettingChanged(s, { exportScale })),
      setExportQuality: (exportQuality) => patch((s) => exportSettingChanged(s, { exportQuality })),
      setExportTransparent: (exportTransparent) => patch((s) => exportSettingChanged(s, { exportTransparent })),
      setExportFps: (exportFps) => patch((s) => exportSettingChanged(s, { exportFps })),
      setExportShutterSamples: (exportShutterSamples) => patch((s) => exportSettingChanged(s, { exportShutterSamples })),
      startExport,
      setHomePrompt: (homePrompt) => patch({ homePrompt }),
      startFromPrompt: () => patch({ screen: 'editor', panel: 'ai' }),
      openTemplates: () => patch({ templatesOpen: true }),
      closeTemplates: () => patch({ templatesOpen: false }),
      saveTemplateFromCurrent: (name, slots) =>
        setState((s) => {
          const tpl = createTemplate(name.trim() || 'قالب', s.elements, slots, s.sizeIdx, s.customW, s.customH);
          const templates = [tpl, ...s.templates];
          persistTemplates(templates);
          return { ...s, templates };
        }),
      deleteTemplate: (id) =>
        setState((s) => {
          const templates = s.templates.filter((t) => t.id !== id);
          persistTemplates(templates);
          return { ...s, templates };
        }),
      // تعبئةُ قالبٍ ليست استبدالَ مستندٍ: المستخدمُ يعمل على مقاسٍ اختاره هو
      // (بوستر إنستغرام قصّةً، مثلًا) وليس مطلوبًا منه أن يتبنّى مقاسَ القالب
      // المحفوظ. فالمقاسُ الحاليُّ يبقى كما هو، والعناصرُ الممتلئة تمرّ بمسار
      // التحجيم الذكيّ نفسه الذي يستعمله `applyMagicResize` حين يختلف مقاسُ
      // القالب عن مقاس المستند — لا تمديدٌ أعمى بالنِّسَب الخام.
      applyTemplateFill: (templateId, fills) => {
        const tpl = state.templates.find((t) => t.id === templateId);
        if (!tpl) return;
        setState((s) => {
          const filled = fillTemplate(tpl, fills);
          const from = sizeAt(tpl.sizeIdx, tpl.customW, tpl.customH);
          const to = sizeAt(s.sizeIdx, s.customW, s.customH);
          const elements = from.w === to.w && from.h === to.h ? filled : magicResizeElements(filled, from, to);
          return {
            ...s,
            elements,
            selectedIds: [],
            sel: null,
            templatesOpen: false,
            ...pushHistory(s),
          };
        });
      },
      applyStarterHere: (id) =>
        setState((s) => {
          const tpl = STARTER_TEMPLATES.find((t) => t.id === id);
          if (!tpl) return s;
          const from = SIZES[tpl.sizeIdx];
          const to = sizeAt(s.sizeIdx, s.customW, s.customH);
          const elements = placeDesignInFrame(tpl.elements(), from, to);
          return {
            ...s,
            elements,
            decorAccent: tpl.decorAccent,
            postPalette: tpl.paletteIdx,
            artboards: s.artboards.map((a) => (a.id === s.activeArtboardId ? { ...a, paletteIdx: tpl.paletteIdx } : a)),
            selectedIds: [],
            sel: null,
            templatesOpen: false,
            ...(s.medium !== 'timed' ? { t: settledTime(elements, s.fps ?? DEFAULT_DOC_FPS) } : {}),
            ...pushHistory(s, 'قالب'),
          };
        }),
      applyTemplateMotion: (templateId) => {
        const tpl = state.templates.find((t) => t.id === templateId);
        if (!tpl) return;
        const motion = extractMotionStructure(tpl.elements);
        commitElements((els) => applyMotionStructure(motion, els));
      },
      openLocalModels: () => patch({ localModelsOpen: true }),
      closeLocalModels: () => patch({ localModelsOpen: false }),
      openRefVideo: () => patch({ refVideoOpen: true }),
      closeRefVideo: () => patch({ refVideoOpen: false }),
      importReferenceVideoTemplate: (name, structure) =>
        setState((s) => {
          const tpl = buildReferenceVideoTemplate(name.trim() || 'قالب من فيديو', structure, s.sizeIdx, s.customW, s.customH);
          const templates = [tpl, ...s.templates];
          persistTemplates(templates);
          return { ...s, templates, refVideoOpen: false };
        }),
      setImageBackgroundRemoved: (id, src) =>
        commitElements((els) => els.map((e) => (e.id === id && e.type === 'image' ? { ...e, src, bgOriginalSrc: e.bgOriginalSrc ?? e.src } : e))),
      restoreImageBackground: (id) =>
        commitElements((els) => els.map((e) => (e.id === id && e.type === 'image' && e.bgOriginalSrc ? { ...e, src: e.bgOriginalSrc, bgOriginalSrc: null } : e))),
      openCmdInterpreter: () => patch({ cmdInterpreterOpen: true }),
      closeCmdInterpreter: () => patch({ cmdInterpreterOpen: false }),
      setImageUpscaled: (id, src, naturalW, naturalH) =>
        commitElements((els) => els.map((e) => (e.id === id && e.type === 'image' ? { ...e, src, naturalW, naturalH } : e))),
      traceImage,
      newDocument: (opts) =>
        setState((s) => ({
          ...s,
          elements: [],
          selectedIds: [],
          sel: null,
          anim: 'none',
          decorAccent: false,
          // «مستندٌ جديد» بابٌ خامسٌ لتبديل المقاس، فيمرّ بالمُشتِقّ نفسه.
          ...withDerivedMedium(s, opts?.sizeIdx ?? s.sizeIdx, opts?.customW ?? s.customW, opts?.customH ?? s.customH),
          fps: s.fps,
          ...pushHistory(s),
        })),
      openMcp: () => patch({ mcpOpen: true }),
      closeMcp: () => patch({ mcpOpen: false }),
      setMcpServerEnabled,
      openAiGenerate,
      closeAiGenerate,
      setAiGenProviderId,
      setAiGenPrompt,
      setAiGenSize,
      runAiGenerate,
      cancelAiGenerate,
    }),
    [
      patch,
      patchDoc,
      patchTextEl,
      commitElements,
      liveUpdateElements,
      beginElementEdit,
      commitElementEdit,
      cancelElementEdit,
      splitAtPlayhead,
      togglePlay,
      addFont,
      addFontFromFile,
      addSystemFont,
      removeUserFont,
      sendAi,
      setAiEngine,
      setAiCustomCmd,
      cancelAi,
      detectAiAgents,
      startExport,
      traceImage,
      runCmd,
      setMcpServerEnabled,
      undo,
      redo,
      openAiGenerate,
      closeAiGenerate,
      setAiGenProviderId,
      setAiGenPrompt,
      setAiGenSize,
      runAiGenerate,
      cancelAiGenerate,
      insertImageTool,
      insertImageFromFile,
      replaceImage,
      insertLottieTool,
      insertLottieFromFile,
      replaceLottie,
      insertVideoTool,
      insertVideoFromFile,
      replaceVideo,
      insertAudioTool,
      insertAudioFromFile,
      insertFx,
      persistTemplates,
      state.sizeIdx,
      state.selectedIds,
      state.templates,
    ],
  );

  // Roadmap #20: the live MCP bridge needs "whatever state/actions are current at
  // the moment a tool call arrives", not a snapshot closed over at mount — refs
  // kept fresh every render, read lazily by the bridge loop's `getState`/`actions`.
  const mcpStateRef = useRef(state);
  mcpStateRef.current = state;
  const mcpActionsRef = useRef(actions);
  mcpActionsRef.current = actions;
  // A plain object snapshot of `actions` would freeze every action's closure at
  // whatever `state` existed when the bridge started — e.g. `startExport` would
  // forever use the `exportScale` from that moment, ignoring a later
  // `setExportScale` call in the same tool call. The Proxy makes every property
  // access resolve against the *current* render's `actions`, same as `getState`.
  const mcpLiveActionsRef = useRef<StudioActions>(
    new Proxy({} as StudioActions, {
      get: (_t, prop) => (mcpActionsRef.current as unknown as Record<string | symbol, unknown>)[prop],
    }),
  );

  // --- اختصارات عامّة: النسخ واللصق والتكرار، التصدير ومِزو، الاختصارات، Esc، Space ---
  //
  // المالك (٢٤ أكتوبر ٢٠٢٦): «أهمّ شي الاختصار». هذه هي التي يضغطها كلّ مصمّم في أوّل
  // دقيقة — ⌘D وC وV وA في البرامج الثلاثة كلّها — ولم يكن أيٌّ منها يعمل. وكلّها على
  // `e.code` لا `e.key`، فتعمل والكيبورد عربي (السبب مشروحٌ عند اختصارات `Stage.tsx`).
  //
  // **وEsc سُلّمٌ يرجّعك للسطح:** المحرّرات (نصّ، قصّ، نقاط، قلم) والحوارات والقوائم
  // لها Escape الخاصّ بها وتأخذه أوّلًا — وهذا لا يتدخّل ما دام أيٌّ منها مفتوحًا. فإن
  // لم يبقَ شيء: يُلغي التحديد، ثم يرجع إلى أداة التحديد، ثم يُغلق لوح الإضافة.
  //
  // **وSpace نقرةٌ للتشغيل، ضغطٌ وسحبٌ للتحريك** (كما في أفتر إفكتس): على المستند
  // المُوقَّت، Space تُطلَق بلا سحبٍ بينهما = شغّل/أوقف؛ ومع سحبٍ = تحريك اللوحة كما كان.
  useEffect(() => {
    const editable = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const isButton = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('button, [role="button"], a');
    const overlayOpen = (st: StudioState) =>
      st.cmdOpen || st.exportOpen || st.templatesOpen || st.artboardsOpen || st.localModelsOpen || st.refVideoOpen || st.mcpOpen || st.cmdInterpreterOpen || st.aiGenOpen || st.shortcutsOpen;
    const menuOpen = () => !!document.querySelector('[role="menu"], [role="listbox"], [data-testid="easing-menu"]');
    const textSelected = () => (window.getSelection()?.toString() ?? '').length > 0;
    let spaceTap = false;
    let pendingPaste = false;

    const onDown = (e: KeyboardEvent) => {
      const st = mcpStateRef.current;
      const a = mcpActionsRef.current;
      if (st.screen !== 'editor') return;
      if (e.code === 'Space') return; // يُقرأ في مرحلة الفقاعة — انظر `onSpaceDown`.
      if (editable(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (st.shortcutsOpen && (e.key === 'Escape' || (e.code === 'Slash' && (e.shiftKey || mod)))) {
        e.preventDefault();
        a.closeShortcuts();
        return;
      }
      if ((e.code === 'Slash' && e.shiftKey && !mod) || (e.code === 'Slash' && mod)) {
        if (overlayOpen(st)) return;
        e.preventDefault();
        a.toggleShortcuts();
        return;
      }
      if (overlayOpen(st)) return;

      // ⌥⌘C / ⌥⌘V — نسخُ الحركة ولصقُها (اختصارُ «نسخ الخصائص» في فيغما). قبل فرع ⌘ وحده،
      // لأنّ ذاك يشترط غيابَ ⌥.
      if (mod && e.altKey && !e.shiftKey && (e.code === 'KeyC' || e.code === 'KeyV')) {
        if (!st.selectedIds.length) return;
        e.preventDefault();
        if (e.code === 'KeyC') a.copyAnimation();
        else a.pasteAnimation();
        return;
      }
      if (mod && !e.altKey) {
        if (e.code === 'KeyD' && !e.shiftKey) {
          if (!st.selectedIds.length) return;
          e.preventDefault();
          a.duplicateSelected();
        } else if (e.code === 'KeyC' && !e.shiftKey) {
          if (!st.selectedIds.length || textSelected()) return;
          e.preventDefault();
          a.copySelected();
        } else if (e.code === 'KeyX' && !e.shiftKey) {
          if (!st.selectedIds.length || textSelected()) return;
          e.preventDefault();
          a.cutSelected();
        } else if (e.code === 'KeyV' && !e.shiftKey) {
          // لا `preventDefault`: إن كانت في حافظة النظام صورة، فحدث `paste` أدناه يأخذها،
          // ويُلغي لصق العناصر قبل أن يقع (`pendingPaste`).
          pendingPaste = true;
          window.setTimeout(() => {
            if (pendingPaste) mcpActionsRef.current.pasteClipboard();
            pendingPaste = false;
          }, 0);
        } else if (e.code === 'KeyA' && !e.shiftKey) {
          e.preventDefault();
          a.selectAllElements();
        } else if (e.code === 'KeyE' && !e.shiftKey) {
          e.preventDefault();
          a.openExport();
        } else if (e.code === 'KeyJ' && !e.shiftKey) {
          e.preventDefault();
          a.toggleRailPanel('ai');
        } else if (e.code === 'Backslash') {
          // ⌘\ — اللوحة وحدها (فيغما): يطوي المفتش ولوح الإضافة، وضغطةٌ ثانية ترجع المفتش.
          e.preventDefault();
          const anyOpen = st.inspectorOpen || st.panel === 'library' || st.panel === 'assets' || st.panel === 'ai';
          patch(anyOpen ? { inspectorOpen: false, panel: 'props' } : { inspectorOpen: true });
        }
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !isButton(e.target)) {
        // Enter على المحدَّد = ادخل تحريره (الأداة الشائعة وفيغما): النصّ يُكتب، والمسار تُحرَّر نقاطه.
        if (st.editingTextId || st.penDraft.length || st.selectedIds.length !== 1) return;
        const el = st.elements.find((x) => x.id === st.selectedIds[0]);
        if (!el || el.locked) return;
        if (el.type === 'text') {
          e.preventDefault();
          a.startTextEdit(el.id);
        } else if (el.type === 'shape' && el.shape === 'path' && (el.points?.length ?? 0) >= 2 && !el.outline?.length && !el.subpaths?.length && st.nodeEditId !== el.id) {
          e.preventDefault();
          a.startNodeEdit(el.id);
        }
        return;
      }

      if (e.key === 'Escape' && !e.shiftKey && !mod) {
        if (menuOpen() || st.editingTextId || st.cropEditingId || st.nodeEditId || st.penDraft.length || st.pendingEditSnapshot) return;
        if (st.selectedIds.length) a.selectNone();
        else if (st.tool !== 'select') a.setTool('select');
        else if (st.panel === 'library' || st.panel === 'assets' || st.panel === 'ai') a.setPanel('props');
      }
    };
    // Space في **مرحلة الفقاعة** لا الالتقاط: مسارُ الخطّ الزمنيّ المركَّز يأخذ Space
    // بنفسه ويوقف انتشاره، فلا يصل هنا — وإلا شغّل هو وأوقفنا نحن في الضغطة نفسها.
    const onSpaceDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      spaceTap = mcpStateRef.current.screen === 'editor' && !editable(e.target) && !isButton(e.target);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tap = spaceTap;
      spaceTap = false;
      const st = mcpStateRef.current;
      if (!tap || st.screen !== 'editor' || st.medium !== 'timed' || editable(e.target) || overlayOpen(st)) return;
      e.preventDefault();
      mcpActionsRef.current.togglePlay();
    };
    // ضغطٌ بالفأرة وSpace مضغوطة = سحبُ تحريك، لا نقرةُ تشغيل.
    const onPointer = () => {
      spaceTap = false;
    };
    const onPaste = (e: ClipboardEvent) => {
      const st = mcpStateRef.current;
      if (st.screen !== 'editor' || editable(e.target) || overlayOpen(st)) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      pendingPaste = false;
      e.preventDefault();
      const size = sizeAt(st.sizeIdx, st.customW, st.customH);
      void mcpActionsRef.current.insertImageFromFile(file, { x: size.w / 2, y: size.h / 2 });
    };
    // **مرحلة الالتقاط، قبل كلّ مُستمعٍ آخر.** يحتاج السُّلّم أن يرى الحالة **قبل** أن
    // يأخذ أحدٌ المفتاح: مُستمع Esc الذي يُغلق حوار التصدير يكتب الحالة، ويُفرَغ
    // التحديثُ في نقطة المهامّ الدقيقة بين مُستمعٍ وآخر — فكان هذا يرى الحوارَ مغلقًا
    // فيُلغي التحديد في الضغطة نفسها (قيسَ في `qa/rotation-sign.spec.mjs`).
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keydown', onSpaceDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keydown', onSpaceDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('paste', onPaste);
    };
  }, [patch]);

  useEffect(() => {
    // Only touch the bridge at all once the user has actually opted in — the
    // overwhelming common case is "never enabled this session", which must stay
    // byte-for-byte network-silent (no fetch to 127.0.0.1 at all), not just a
    // silently-swallowed failed one. And there is now nothing to be silent *to*
    // until `mcp_start` has run: no socket exists before then.
    //
    // Gating on the token too, not just the flag, is deliberate: the token is the
    // proof that a listener was really created for us, and every bridge request
    // must present it (see mcp.rs). No token ⇒ no listener ⇒ nothing to poll.
    if (!state.mcpServerEnabled || !state.mcpToken) return;
    const token = state.mcpToken;
    startMcpBridge({ getState: () => mcpStateRef.current, actions: mcpLiveActionsRef.current }, token);
    return () => stopMcpBridge(token);
  }, [state.mcpServerEnabled, state.mcpToken]);

  const dict = state.lang === 'ar' ? AR : EN;
  const dir: 'rtl' | 'ltr' = state.lang === 'ar' ? 'rtl' : 'ltr';

  const value = useMemo(() => ({ state, actions, dict, dir }), [state, actions, dict, dir]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used within StudioProvider');
  return ctx;
}

export function cmdListFor(query: string, s: Pick<StudioState, 'elements' | 'selectedIds'>) {
  return visibleCmds(query, s);
}

export type { Lang };
