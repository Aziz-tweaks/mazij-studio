import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AR, EN, type Dictionary, type Lang } from '../i18n/strings';
import { CMDS, SIZES, PALETTES, CUSTOM_SIZE_IDX, DEFAULT_FPS, FPS_OPTIONS, TOOL_LIBRARY, sizeAt, nameOf, clamp, type CommandDef } from '../data/constants';
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
import type { AiProvider, ArtboardDoc, ArtboardMeta, DocSnapshot, ExportResult, HAlign, PanelId, ShapeDrawKind, StudioState, VAlign, Weight } from './types';
import { initialStudioState } from './types';
// اتحادُ ثلاث رحلات مسّت هذا الملف: `newGroupId` من رحلة الحملة (التجميع)،
// و`AnimPreset` من رحلة الفيديو (ربط الحركة بالعنصر المحدَّد)، و`withBaseLayerColor`
// من رحلة البوست (تلوين الشكل عبر كومة المظهر لا عبر الحقل القديم). لا تعارض في
// النيّة — ملفٌّ واحد التقت عليه ثلاثة فروع.
import type { AnimPreset, AnimProperty, AppearanceFillLayer, AppearanceShadowLayer, AppearanceStrokeLayer, DocElement, ElementAnim, ElementId, Geometry, TextElement, TextStaggerAnim } from './elements';
import { DEFAULT_IMAGE_CROP, cascadeEasingToTracks, defaultAnim, defaultTextStagger, newArtboardId, newElementId, newGroupId, tracksFromPreset } from './elements';
import { currentAppearance, migrateAppearance, moveLayer, newFillLayer, newShadowLayer, newStrokeLayer, withBaseLayerColor } from '../lib/appearance';
import type { Bezier, EasingId } from '../lib/easing';
import { DEFAULT_BEZIER } from '../lib/easing';
import type { PathCmd } from '../lib/pathGeometry';
import { TIMELINE_DURATION, canKeyframeAtPlayhead, resolvePropertyAt, stretchClipToTime } from '../lib/animTimeline';
import { fetchAndRegisterFont } from '../lib/loadFont';
import type { PersistedArtboard, PersistedDoc } from '../lib/persist';
import { loadDoc, saveDoc } from '../lib/persist';
import type { SlotFill, Template, TemplateSlot } from '../lib/templates';
import { applyMotionStructure, createTemplate, extractMotionStructure, fillTemplate } from '../lib/templates';
import { loadTemplates, saveTemplates } from '../lib/templatesStore';
import { STARTER_TEMPLATES } from '../lib/starterTemplates';
import type { ReferenceVideoStructure } from '../lib/referenceVideo';
import { buildReferenceVideoTemplate } from '../lib/referenceVideo';
import { renderArtboardPng, renderArtboardSvg } from '../lib/exportArtboard';
import { shapeTextOnCurve } from '../lib/textOnPath';
import { justifySvgTextElement } from '../lib/kashidaJustify';
import { LIVE_PHOTO_DEFAULT_DURATION } from '../lib/livePhotoExport';
import { computeBooleanOp, isBooleanEligible, type BooleanOp } from '../lib/pathBoolean';
import { insertAnchorOnSegment } from '../lib/pathSmoothing';
import { magicResizeElements } from '../lib/magicResize';
import { saveExportedFile } from '../lib/saveExport';
import { effectiveExportScale } from '../lib/exportEstimate';
import { pickImageFile, readImageFile, type LoadedImage } from '../lib/imageFile';
import { pickLottieFile, readLottieFile, type LoadedLottie } from '../lib/lottieFile';
import { pickVideoFile, readVideoFile, type LoadedVideo } from '../lib/videoFile';
import { inTauri } from '../lib/tauriEnv';
import { startMcpBridge, stopMcpBridge } from '../lib/mcpBridge';
import { startMcpServer, stopMcpServer } from '../lib/mcpServerControl';
import { describeAiError, providerById } from '../lib/aiProviders';
import { loadApiKey } from '../lib/aiKeyStore';

/** Switches one clip to an entrance preset **and rebuilds its property tracks** from
 * it, which is the half that used to be missing: `tracks` is the only thing
 * `resolveAnimAt` (and therefore the canvas preview, the DOM preview and every
 * exported video frame) ever reads, so writing `preset` without it changes a label
 * and nothing else.
 *
 * `keyframes` is the legacy 0→1 progress pair `tracksFromPreset` maps through; a clip
 * that somehow lost it (fewer than the two endpoints a preset needs) is reseeded from
 * `defaultAnim` rather than silently producing a one-keyframe, frozen track. */
function withPreset(anim: ElementAnim, preset: AnimPreset): ElementAnim {
  const keyframes = anim.keyframes.length >= 2 ? anim.keyframes : defaultAnim(preset, anim.start, anim.duration, anim.easing).keyframes;
  return { ...anim, preset, keyframes, tracks: tracksFromPreset(preset, keyframes, anim.easing, anim.bezier) };
}

/** Documents saved before independent per-property tracks existed carry an `anim`
 * with only the legacy single `keyframes` track (or no `anim` at all). Synthesizes
 * `tracks` from the legacy preset/keyframes/easing so these load and render
 * pixel-identical to before — see `tracksFromPreset` for the exact per-preset
 * mapping. A no-op for any document that already has real tracks. */
function migrateAnim(anim: ElementAnim | undefined): ElementAnim {
  const a = anim ?? defaultAnim('none', 0, 0.6);
  if (a.tracks && Object.keys(a.tracks).length) return a;
  return { ...a, tracks: tracksFromPreset(a.preset, a.keyframes, a.easing, a.bezier) };
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
 * (±2 lets an element swing fully off-canvas and back for a slide-in/out), scale is
 * a non-negative multiplier, rotation is an unrestricted delta in degrees. */
function clampAnimPropertyValue(property: AnimProperty, v: number): number {
  switch (property) {
    case 'opacity':
      return clamp(v, 0, 1);
    case 'x':
    case 'y':
      return clamp(v, -2, 2);
    case 'scale':
      return Math.max(0, v);
    case 'rotation':
      return v;
  }
}

function visibleCmds(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return CMDS;
  return CMDS.filter((c) => c.ar.includes(q) || c.en.toLowerCase().includes(q));
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

function docOf(s: StudioState): DocSnapshot {
  return { elements: s.elements, anim: s.anim, sizeIdx: s.sizeIdx, customW: s.customW, customH: s.customH, decorAccent: s.decorAccent };
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
function settledTime(elements: DocElement[]): number {
  let t = 0;
  for (const el of elements) t = Math.max(t, el.anim.start + el.anim.duration);
  return Math.min(TIMELINE_DURATION, t);
}

function startDoc(s: StudioState, doc: DocSnapshot, opts?: { paletteIdx?: number; sel?: ElementId | null }): StudioState {
  const id = newArtboardId();
  const sel = opts?.sel ?? null;
  return {
    ...s,
    ...doc,
    screen: 'editor',
    postPalette: opts?.paletteIdx ?? s.postPalette,
    artboards: [{ id, name: defaultArtboardName(1, s.lang), paletteIdx: opts?.paletteIdx ?? s.postPalette }],
    activeArtboardId: id,
    artboardDocs: {},
    historyPast: [],
    historyFuture: [],
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
    t: settledTime(doc.elements),
    cmdOpen: false,
    // صار هناك مشروعٌ مفتوح: شاشة البداية تعرض «متابعة» من الآن، وتصفه من
    // الحالة الحيّة — فالرجوع للشاشة ثم النقر على المتابعة يعود إلى *هذا*.
    openDoc: 'open',
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
  toggleLang: () => void;
  setSimple: () => void;
  setPro: () => void;
  setTool: (tool: StudioState['tool']) => void;
  setShapeDrawKind: (k: ShapeDrawKind) => void;
  openCmd: () => void;
  closeCmd: () => void;
  setCmdQuery: (q: string) => void;
  moveCmdSel: (dir: 1 | -1) => void;
  runSelectedCmd: () => void;
  runCommand: (c: CommandDef) => void;
  setPanel: (panel: PanelId) => void;
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
  addTrackKeyframeAtPlayhead: (id: ElementId, property: AnimProperty) => void;
  deleteTrackKeyframe: (id: ElementId, property: AnimProperty, kfId: string) => void;
  setTrackKeyframeValue: (id: ElementId, property: AnimProperty, kfId: string, value: number) => void;
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
  setElementWeight: (id: ElementId, weight: Weight) => void;
  setElementColor: (id: ElementId, hex: string) => void;
  setElementHAlign: (id: ElementId, a: HAlign) => void;
  setElementVAlign: (id: ElementId, a: VAlign) => void;
  setElementJustify: (id: ElementId, justify: boolean) => void;
  setTextStagger: (id: ElementId, patch: Partial<TextStaggerAnim>) => void;
  setElementOpacity: (id: ElementId, opacity: number) => void;
  setElementGeoPx: (id: ElementId, patch: { x?: number; y?: number; w?: number; h?: number; rotation?: number }) => void;
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
  beginElementEdit: () => void;
  commitElementEdit: () => void;
  liveUpdateElements: (updater: (els: DocElement[]) => DocElement[]) => void;
  commitElements: (updater: (els: DocElement[]) => DocElement[]) => void;
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
  setVideoLoop: (id: ElementId, loop: boolean) => void;
  undo: () => void;
  redo: () => void;
  setFontUrl: (url: string) => void;
  addFont: () => void;
  setPostPalette: (idx: number) => void;
  /** يقلب زخرفة اللوحة — انظر `DocSnapshot.decorAccent`. حقلُ مستندٍ، فيمرّ
   * بـ`patchDoc`: خطوةُ تراجعٍ واحدة ويُحفَظ مع المستند. */
  setDecorAccent: (on: boolean) => void;
  /** Re-colours every text/shape element in the document to the current palette's
   * tokens in one undo step — including elements the user previously gave an explicit
   * manual color (an intentional override of the normal "manual colors stay put when
   * switching palettes" precedence; see docs/CONTROLS.md "تطبيق اللوحة على كل عنصر"). */
  applyPaletteToAll: () => void;
  pickAiProvider: (provider: AiProvider) => void;
  changeAiProvider: () => void;
  setAiInput: (text: string) => void;
  sendAi: (text?: string) => void;
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
}

interface StudioContextValue {
  state: StudioState;
  actions: StudioActions;
  dict: Dictionary;
  dir: 'rtl' | 'ltr';
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StudioState>(initialStudioState);
  const patch = useCallback((p: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => {
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  const commitElements = useCallback((updater: (els: DocElement[]) => DocElement[]) => {
    setState((s) => ({
      ...s,
      elements: updater(s.elements),
      historyPast: [...s.historyPast, docOf(s)],
      historyFuture: [],
      dirty: true,
    }));
  }, []);

  // Click-without-drag must not pollute undo/redo: beginElementEdit only *captures* a
  // snapshot of the doc as it was before the gesture; commitElementEdit pushes that
  // snapshot to history only if the gesture actually changed something. A bare click
  // (pointerdown immediately followed by pointerup, no pointermove in between) never
  // calls liveUpdateElements, so the doc is byte-for-byte identical and nothing is pushed.
  const beginElementEdit = useCallback(() => {
    setState((s) => (s.pendingEditSnapshot ? s : { ...s, pendingEditSnapshot: docOf(s) }));
  }, []);

  const commitElementEdit = useCallback(() => {
    setState((s) => {
      const before = s.pendingEditSnapshot;
      if (!before) return s;
      const changed = JSON.stringify(docOf(s)) !== JSON.stringify(before);
      if (!changed) return { ...s, pendingEditSnapshot: null };
      return { ...s, pendingEditSnapshot: null, historyPast: [...s.historyPast, before], historyFuture: [], dirty: true };
    });
  }, []);

  const liveUpdateElements = useCallback((updater: (els: DocElement[]) => DocElement[]) => {
    setState((s) => ({ ...s, elements: updater(s.elements) }));
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
      return { ...s, ...resolved, elements, historyPast: [...s.historyPast, docOf(s)], historyFuture: [], dirty: true };
    });
  }, []);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      setState((s) => ({
        ...s,
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
        historyPast: [],
        historyFuture: [],
        dirty: false,
        activeArtboardId: active.id,
        postPalette: active.paletteIdx,
        artboards: normalized.map((a): ArtboardMeta => ({ id: a.id, name: a.name, paletteIdx: a.paletteIdx })),
        artboardDocs,
        // المستند مُحمَّل في الحالة، لكن الشاشة تبقى `home`: شاشة البداية تعرض
        // بطاقة «متابعة» بارزة، ونقرةٌ واحدة عليها تفتح هذا المستند بعينه. فلا
        // المُنتقي مفروض على العائد، ولا العمل المحفوظ مخفيّ عنه.
        openDoc: 'open',
      }));
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
      if (aiRef.current) clearTimeout(aiRef.current);
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
      saveDoc({ artboards: allArtboardEntries(state), activeArtboardId: state.activeArtboardId })
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
      patch((cur) => ({ t: cur.t + dt >= TIMELINE_DURATION ? 0 : cur.t + dt }));
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
      const atEnd = s.t >= TIMELINE_DURATION - 1 / 60;
      return { ...s, playing: true, t: atEnd ? 0 : s.t };
    });
  }, []);

  const runCmd = useCallback((c: (typeof CMDS)[number]) => {
    setState((s) => {
      const result = c.run(s);
      const { doc, rest } = splitDocPatch(result);
      const hasDoc = Object.keys(doc).length > 0;
      return {
        ...s,
        ...rest,
        ...doc,
        cmdOpen: false,
        cmdQuery: '',
        cmdSel: 0,
        ...(hasDoc ? { historyPast: [...s.historyPast, docOf(s)], historyFuture: [], dirty: true } : {}),
      };
    });
  }, []);

  const sendAi = useCallback(
    (text?: string) => {
      const txt = (text ?? '').trim();
      if (!txt) return;
      patch((s) => ({ aiMsgs: [...s.aiMsgs, { role: 'u' as const, text: txt }], aiInput: '', aiTyping: true }));
      if (aiRef.current) clearTimeout(aiRef.current);
      aiRef.current = setTimeout(() => {
        const tl = txt.toLowerCase();
        let reply: StudioState['aiMsgs'][number];
        let extra: Partial<Pick<StudioState, 'sizeIdx' | 'anim' | 'tlOpen'>> = {};
        if (/لون|ألوان|color|palette/.test(tl)) reply = { role: 'a', key: 'r_palette', palettes: [1, 2, 3] };
        else if (/عنوان|headline|title|أقصر|shorter/.test(tl)) reply = { role: 'a', key: 'r_headline', headline: true };
        else if (/تيك|tiktok|مقاس|size|resize/.test(tl)) {
          reply = { role: 'a', key: 'r_resize' };
          extra = { sizeIdx: 2 };
        } else if (/حرك|motion|anim/.test(tl)) {
          reply = { role: 'a', key: 'r_motion' };
          extra = { anim: 'fade', tlOpen: true };
        } else reply = { role: 'a', key: 'r_generic' };
        patch((s) => {
          const { doc, rest } = splitDocPatch(extra as Record<string, unknown>);
          const hasDoc = Object.keys(doc).length > 0;
          return {
            aiMsgs: [...s.aiMsgs, reply],
            aiTyping: false,
            ...rest,
            ...doc,
            ...(hasDoc ? { historyPast: [...s.historyPast, docOf(s)], historyFuture: [], dirty: true } : {}),
          };
        });
      }, 900);
    },
    [patch],
  );

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
      .then(() => {
        patch((s) => ({ fonts: s.fonts.map((f) => (f.id === id ? { ...f, status: 'ready' as const } : f)) }));
      })
      .catch((err: Error) => {
        patch((s) => ({ fonts: s.fonts.map((f) => (f.id === id ? { ...f, status: 'error' as const, error: err.message } : f)) }));
      });
  }, [patch, state.fontUrl]);

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
    if ((isVideo || isLivePhoto) && !inTauri) {
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
                { format: fmt, fps: state.exportFps, quality: state.exportQuality, transparent: fmt === 'gif' && state.exportTransparent },
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
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
      } else if (e.key === 'Escape') {
        patch({ cmdOpen: false, exportOpen: false, exportState: 'idle', cropEditingId: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [patch]);

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.historyPast.length) return s;
      const prev = s.historyPast[s.historyPast.length - 1];
      return { ...s, ...prev, historyPast: s.historyPast.slice(0, -1), historyFuture: [docOf(s), ...s.historyFuture], dirty: true };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.historyFuture.length) return s;
      const [next, ...rest] = s.historyFuture;
      return { ...s, ...next, historyPast: [...s.historyPast, docOf(s)], historyFuture: rest, dirty: true };
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
          historyPast: [...s.historyPast, docOf(s)],
          historyFuture: [],
          dirty: true,
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
        return { ...s, elements, historyPast: [...s.historyPast, docOf(s)], historyFuture: [], dirty: true };
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
        historyPast: [...s.historyPast, docOf(s)],
        historyFuture: [],
        dirty: true,
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
      return { ...s, elements, historyPast: [...s.historyPast, docOf(s)], historyFuture: [], dirty: true };
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
        historyPast: [...s.historyPast, docOf(s)],
        historyFuture: [],
        dirty: true,
      };
    });
  }, []);

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
      return { ...s, elements, historyPast: [...s.historyPast, docOf(s)], historyFuture: [], dirty: true };
    });
  }, []);

  const actions: StudioActions = useMemo(
    () => ({
      goHome: () => patch({ screen: 'home', cmdOpen: false }),
      goEditor: () => patch({ screen: 'editor' }),
      startBlank: (sizeIdx) => setState((s) => startDoc(s, { elements: [], anim: 'none', sizeIdx, customW: s.customW, customH: s.customH, decorAccent: false })),
      startBlankCustom: (w, h) =>
        setState((s) =>
          startDoc(s, {
            elements: [],
            anim: 'none',
            sizeIdx: CUSTOM_SIZE_IDX,
            customW: Math.max(1, Math.round(w)),
            customH: Math.max(1, Math.round(h)),
            decorAccent: false,
          }),
        ),
      startFromStarter: (id) =>
        setState((s) => {
          const tpl = STARTER_TEMPLATES.find((t) => t.id === id);
          if (!tpl) return s;
          return startDoc(
            s,
            { elements: tpl.elements(), anim: tpl.anim, sizeIdx: tpl.sizeIdx, customW: s.customW, customH: s.customH, decorAccent: tpl.decorAccent },
            { paletteIdx: tpl.paletteIdx, sel: tpl.selectOnOpen },
          );
        }),
      resumeOpenProject: () => patch({ screen: 'editor', cmdOpen: false }),
      toggleLang: () => patch((s) => ({ lang: s.lang === 'ar' ? 'en' : 'ar' })),
      setSimple: () =>
        patch((s) => ({
          mode: 'simple',
          tool: ['pen', 'audio'].includes(s.tool) ? 'select' : s.tool,
        })),
      setPro: () => patch({ mode: 'pro' }),
      // مغادرة أداة القلم تُلغي المسودّة الجارية بدل تركها معلّقة في الحالة: معاينة
      // المسودّة مشروطة بـ`tool === 'pen'`، فمسودّة مهجورة تختفي عن الشاشة لكنها تبقى
      // في `penDraft` — فتظهر فجأة عند الرجوع للقلم، والأسوأ: تندمج نقاطها في أول
      // مسار جديد يرسمه المصمم بعدها. مغادرة أداة ما تُخرِج أيضًا من وضع تحرير العقد،
      // لأن المقابض المرسومة على اللوحة لا معنى لها مع أداة رسم أخرى نشِطة.
      //
      // اختيار أداةٍ يُعيد اللوح إلى «التصميم» متى كانت الأداة ليست مكتبة — أي
      // «تحديد» وحدها اليوم. وهذا ليس تجميلًا: بدونه يبقى لوح المكتبة معروضًا بعد
      // أن ينتهي المصمم من الرسم، فلا يجد خصائص ما حدّده للتوّ. فتح المكتبة يمرّ
      // بـ`openToolLibrary` لا من هنا، فيبقى `setTool` صالحًا كما كان لكل نداء
      // برمجي قائم (مُفسِّر الأوامر، لوحة الأوامر، MCP).
      setTool: (tool) =>
        patch((s) => ({
          ...(s.tool === tool ? { tool } : { tool, penDraft: [], nodeEditId: null, nodeEditSel: null }),
          ...(TOOL_LIBRARY[tool] === 'none' && s.panel === 'library' ? { panel: 'props' as PanelId } : {}),
        })),
      setShapeDrawKind: (shapeDrawKind) => patch({ shapeDrawKind }),
      openCmd: () => patch({ cmdOpen: true, cmdQuery: '', cmdSel: 0 }),
      closeCmd: () => patch({ cmdOpen: false }),
      setCmdQuery: (cmdQuery) => patch({ cmdQuery, cmdSel: 0 }),
      moveCmdSel: (dir) =>
        patch((s) => {
          const list = visibleCmds(s.cmdQuery);
          const next = dir === 1 ? Math.min(list.length - 1, s.cmdSel + 1) : Math.max(0, s.cmdSel - 1);
          return { cmdSel: next };
        }),
      runSelectedCmd: () => {
        setState((s) => {
          const list = visibleCmds(s.cmdQuery);
          const c = list[s.cmdSel];
          if (!c) return s;
          const result = c.run(s);
          const { doc, rest } = splitDocPatch(result);
          const hasDoc = Object.keys(doc).length > 0;
          return {
            ...s,
            ...rest,
            ...doc,
            cmdOpen: false,
            cmdQuery: '',
            cmdSel: 0,
            ...(hasDoc ? { historyPast: [...s.historyPast, docOf(s)], historyFuture: [], dirty: true } : {}),
          };
        });
      },
      runCommand: runCmd,
      setPanel: (panel) => patch({ panel }),
      setAssetsTab: (assetsTab) => patch({ assetsTab }),
      toggleTimeline: () => patch((s) => ({ tlOpen: !s.tlOpen })),
      togglePlay,
      scrubTo: (t) => patch({ t: clamp(t, 0, 1) * TIMELINE_DURATION }),
      cycleSize: () => patchDoc((s) => ({ sizeIdx: (s.sizeIdx + 1) % SIZES.length })),
      setSizeIdx: (sizeIdx) => patchDoc({ sizeIdx }),
      setCustomSize: (w, h) => patchDoc({ sizeIdx: CUSTOM_SIZE_IDX, customW: Math.max(1, Math.round(w)), customH: Math.max(1, Math.round(h)) }),
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
            sizeIdx,
            customW: sizeIdx === CUSTOM_SIZE_IDX ? to.w : s.customW,
            customH: sizeIdx === CUSTOM_SIZE_IDX ? to.h : s.customH,
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
          };
        }),
      setExportMagicResize: (exportMagicResize) => patch({ exportMagicResize }),
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
          const newDoc: DocSnapshot = { elements: [], anim: 'none', sizeIdx: s.sizeIdx, customW: s.customW, customH: s.customH, decorAccent: false };
          const outgoing: ArtboardDoc = { doc: docOf(s), historyPast: s.historyPast, historyFuture: s.historyFuture };
          return {
            ...s,
            ...newDoc,
            historyPast: [],
            historyFuture: [],
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
      setExportAllArtboards: (exportAllArtboards) => patch({ exportAllArtboards }),
      setExportArtboardOwnSize: (exportArtboardOwnSize) => patch({ exportArtboardOwnSize }),
      setElementEasing: (id, easing) =>
        commitElements((els) =>
          els.map((e) => (e.id === id ? { ...e, anim: { ...e.anim, easing, tracks: cascadeEasingToTracks(e.anim.tracks, easing, e.anim.bezier) } } : e)),
        ),
      addTrackKeyframeAtPlayhead: (id, property) =>
        setState((s) => {
          const el = s.elements.find((e) => e.id === id);
          if (!el || el.anim.duration <= 0) return s;
          // «مفتاح عند المؤشّر» يجب أن تعني عند المؤشّر. كان `clamp(…, 0, 1)` أدناه
          // يَحجِز الزمن المحلّي، فإذا كان المؤشّر بعد نهاية المقطع هبط المعيَّن على
          // حافّة المقطع لا تحت المؤشّر: قياسٌ فعلي على مقطع 0→0.6ث والمؤشّر عند
          // 2.2ث (وهو الموضع الافتراضي السابق للمؤشّر) أنزل المعيَّن عند 12% من
          // المسطرة والمؤشّر عند 44% — فرقُ ١٫٦ ثانية، بلا أي رسالة.
          //
          // العلاج أن يُمَدّ المقطع ليصل المؤشّر (`stretchClipToTime`)، لا أن يُرفض
          // الطلب: هذا ما يقصده المصمّم، وهو **مرئي** (يَعرض المقطع فيزداد عرضه على
          // الخط الزمني) وبلا أثر جانبي على ما ضبطه سابقًا (المفاتيح القائمة تُعاد
          // معايرة كسورها فتبقى في أزمانها المطلقة نفسها). أما المؤشّر **قبل** بداية
          // المقطع فلا يُخدَم: تغطيته تعني نقل `start`، أي تغيير لحظة بدء الحركة بلا
          // طلب — ولذلك يُعطَّل الزرّ هناك بسببٍ مكتوب (`kf_outside_clip`).
          if (!canKeyframeAtPlayhead(el.anim, s.t)) return s;
          const anim = stretchClipToTime(el.anim, s.t);
          const localT = clamp((s.t - anim.start) / anim.duration, 0, 1);
          // القيمة تُقرأ من المقطع **قبل** التمديد: هي ما يراه المصمّم على الشاشة في
          // هذه اللحظة بعينها، فلا تُحدِث إضافةُ المفتاح أي قفزة بصرية. (والتمديد
          // يحفظ الأزمنة المطلقة فالقيمتان متساويتان رياضيًا، لكن يبقى المصدر الأصل.)
          const value = resolvePropertyAt(el.anim, property, s.t);
          const track = anim.tracks[property] ?? [];
          const EPS = 0.02;
          const existing = track.find((k) => Math.abs(k.t - localT) < EPS);
          const nextTrack = existing
            ? track.map((k) => (k.id === existing.id ? { ...k, value } : k))
            : [...track, { id: newElementId('kf'), t: localT, value, easing: 'easeOut' as EasingId, bezier: [...DEFAULT_BEZIER] as Bezier }];
          return {
            ...s,
            elements: s.elements.map((e) => (e.id === id ? { ...e, anim: { ...anim, tracks: { ...anim.tracks, [property]: nextTrack } } } : e)),
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
          };
        }),
      deleteTrackKeyframe: (id, property, kfId) =>
        commitElements((els) =>
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
        ),
      setTrackKeyframeValue: (id, property, kfId, value) =>
        commitElements((els) =>
          els.map((e) => {
            if (e.id !== id || !e.anim.tracks[property]) return e;
            const clamped = clampAnimPropertyValue(property, value);
            const nextTrack = e.anim.tracks[property]!.map((k) => (k.id === kfId ? { ...k, value: clamped } : k));
            return { ...e, anim: { ...e.anim, tracks: { ...e.anim.tracks, [property]: nextTrack } } };
          }),
        ),
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
      setElementAnimPreset: (id, preset) => commitElements((els) => els.map((e) => (e.id === id ? { ...e, anim: withPreset(e.anim, preset) } : e))),
      setElementText: (id, text) => patchTextEl(id, { text }),
      setElementFont: (id, fontFamily) => patchTextEl(id, { fontFamily }),
      setElementFontSize: (id, px) => patchTextEl(id, { fontSize: clamp(px, 8, 400) }),
      setElementTracking: (id, percent) => patchTextEl(id, { tracking: clamp(percent, -20, 50) }),
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
      setShapeStroke: (id, hex) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'shape' ? { ...e, stroke: hex } : e))),
      setShapeStrokeWidth: (id, w) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'shape' ? { ...e, strokeWidth: Math.max(0, w) } : e))),
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
      setImageStroke: (id, hex) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'image' ? { ...e, stroke: hex } : e))),
      setImageStrokeWidth: (id, w) => commitElements((els) => els.map((e) => (e.id === id && e.type === 'image' ? { ...e, strokeWidth: Math.max(0, w) } : e))),
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
          };
        }),
      unlockAll: () =>
        setState((s) => {
          if (!s.elements.some((e) => e.locked)) return s;
          return {
            ...s,
            elements: s.elements.map((e) => (e.locked ? { ...e, locked: false } : e)),
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
          };
        }),
      showAll: () =>
        setState((s) => {
          if (s.elements.every((e) => e.visible)) return s;
          return {
            ...s,
            elements: s.elements.map((e) => (e.visible ? e : { ...e, visible: true })),
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
          };
        }),
      beginElementEdit,
      commitElementEdit,
      liveUpdateElements,
      commitElements,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
            panel: 'props',
            shapeDrawKind: recipe.kind,
            shapeDrawN: recipe.n ?? s.shapeDrawN,
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
          };
        }),
      setShapeDrawN: (shapeDrawN) => patch({ shapeDrawN: clamp(shapeDrawN, MIN_SHAPE_N, MAX_SHAPE_N) }),
      /** يفتح لوح مكتبة أداةٍ ما ويُسلِّح الأداة نفسها في الآن ذاته.
       * الزرّ الواحد يفعل الأمرين: يبدّل اللوح (قاعدة محرّر فيديو شائع) ويُسلِّح الرسم بالسحب
       * (قاعدة أداة المتّجهات) — فلا يحتاج المصمم أن يعرف أيّهما كان يقصد. */
      openToolLibrary: (tool) =>
        patch((s) => ({
          tool,
          penDraft: s.tool === tool ? s.penDraft : [],
          nodeEditId: s.tool === tool ? s.nodeEditId : null,
          nodeEditSel: s.tool === tool ? s.nodeEditSel : null,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
      penFinish: (forceClosed) =>
        setState((s) => {
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
            tool: 'select',
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
          };
        }),

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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
            historyPast: [...s.historyPast, docOf(s)],
            historyFuture: [],
            dirty: true,
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
          return { ...s, elements, historyPast: [...s.historyPast, docOf(s)], historyFuture: [], dirty: true };
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
      // Roadmap #16: also mirrors onto the active artboard's own metadata (see
      // `ArtboardMeta.paletteIdx`) so a palette choice survives switching away and
      // back — the global `postPalette`/`PALETTES[...]` read everywhere else always
      // reflects whichever artboard is currently active, unchanged.
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
      pickAiProvider: (aiProvider) => patch({ aiProvider, aiMsgs: [{ role: 'a', key: 'ai_first' }] }),
      changeAiProvider: () => patch({ aiProvider: null, aiMsgs: [] }),
      setAiInput: (aiInput) => patch({ aiInput }),
      sendAi,
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
            return { exportFormat, exportFps: fps, exportTransparent: exportFormat === 'mp4' ? false : s.exportTransparent };
          }
          // Live Photo's still half is a JPEG — no alpha channel either, same
          // belt-and-suspenders lockout as mp4 above.
          if (exportFormat === 'livephoto') {
            return { exportFormat, exportTransparent: false };
          }
          return { exportFormat };
        }),
      toggleExportTarget: (id) => patch((s) => ({ targets: { ...s.targets, [id]: !s.targets[id] } })),
      // يشتق القائمة من `SIZES` بدل تعدادٍ مكتوب بالاسم: كان مكتوبًا
      // `{ ig, x, tt, li }` حرفيًا، فصار «تحديد الكل» يحدّد أربعةً من ثلاثة عشر
      // بعد توسيع فهرس المقاسات — زرٌّ يقول الكل ويعني بعضه.
      selectAllTargets: () => patch({ targets: Object.fromEntries(SIZES.map((z) => [z.id, true])) }),
      selectProjectSizeTarget: () =>
        patch((s) => {
          // هدفٌ واحد: مقاس هذه اللوحة بعينه. الأهداف الافتراضية
          // (`ig`/`x`/`tt`/`li`) لا علاقة لها بالمقاس الذي بدأ منه المشروع — من بدأ
          // على «ريل إنستقرام» يجد هدفه نفسه **غير محدَّد** وأربعةَ أهدافٍ أخرى
          // محدَّدة، ثلاثةٌ منها بنِسَبٍ مختلفة تمامًا. وعلى الفيديو الثمن مضاعَف:
          // كل هدفٍ يعني رسم ١٥٠ إطارًا وترميزًا كاملًا مستقلًا.
          const id = s.sizeIdx === CUSTOM_SIZE_IDX ? 'custom' : SIZES[s.sizeIdx]?.id;
          if (!id) return {};
          return { targets: { [id]: true } };
        }),
      setExportScale: (exportScale) => patch({ exportScale }),
      setExportQuality: (exportQuality) => patch({ exportQuality }),
      setExportTransparent: (exportTransparent) => patch({ exportTransparent }),
      setExportFps: (exportFps) => patch({ exportFps }),
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
      applyTemplateFill: (templateId, fills) => {
        const tpl = state.templates.find((t) => t.id === templateId);
        if (!tpl) return;
        setState((s) => ({
          ...s,
          elements: fillTemplate(tpl, fills),
          sizeIdx: tpl.sizeIdx,
          customW: tpl.customW,
          customH: tpl.customH,
          selectedIds: [],
          sel: null,
          templatesOpen: false,
          historyPast: [...s.historyPast, docOf(s)],
          historyFuture: [],
          dirty: true,
        }));
      },
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
      newDocument: (opts) =>
        setState((s) => ({
          ...s,
          elements: [],
          selectedIds: [],
          sel: null,
          anim: 'none',
          decorAccent: false,
          sizeIdx: opts?.sizeIdx ?? s.sizeIdx,
          customW: opts?.customW ?? s.customW,
          customH: opts?.customH ?? s.customH,
          historyPast: [...s.historyPast, docOf(s)],
          historyFuture: [],
          dirty: true,
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
      togglePlay,
      addFont,
      sendAi,
      startExport,
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

export function cmdListFor(query: string) {
  return visibleCmds(query);
}

export type { Lang };
