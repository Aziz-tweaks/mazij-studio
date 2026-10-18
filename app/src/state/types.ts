import type { Lang } from '../i18n/strings';
import type { SizeMedium, ToolId } from '../data/constants';
import type { DocElement, ElementId } from './elements';
// `createDefaultElements` لم يعد يُستورَد هنا: شاشة البداية نقلت البوستر التجريبي الجاهز
// إلى `starterTemplates.ts` وجعلت المستند الفاضي هو نقطة الانطلاق، فلم يبقَ له إلا
// ذكرٌ في تعليق أدناه. وبقي `DEFAULT_POLYGON_N` لأن مكتبة الأشكال تحتاجه.
import { DEFAULT_POLYGON_N } from '../lib/shapeFactory';
import { DEFAULT_DOC_FPS } from '../lib/animTimeline';
import type { Template } from '../lib/templates';

export type Screen = 'editor' | 'home';
export type Mode = 'simple' | 'pro';
/** `'library'` هو لوح محتوى الأداة المختارة — انظر `TOOL_LIBRARY` في
 * `src/data/constants.ts`. أُضيف لأن أهمّ نتيجة في تحليل محرّر فيديو شائع بنيويّة لا شكليّة:
 * «زرّ في شريط الأدوات يجب أن يبدّل **لوح محتوى**، لا وضع أداة صامتًا»
 * (`re-capcut-flows.md` §5.1). لـمحرّر فيديو شائع أحد عشر تبويبًا وكلٌّ منها يعيد رسم لوح
 * المكتبة بالكامل، فجملة «ضغطت ولم يحدث شيء» **مستحيلة بنيويًّا** هناك. */
export type PanelId = 'props' | 'assets' | 'ai' | 'library' | null;
export type AssetsTab = 'files' | 'fonts' | 'colors' | 'templates';
export type AnimId = 'none' | 'fade' | 'slide' | 'pop';
export type Weight = 'regular' | 'medium' | 'bold';
export type ExportFormat = 'png' | 'jpg' | 'svg' | 'mp4' | 'gif' | 'livephoto';
export type ExportState = 'idle' | 'busy' | 'done' | 'error' | 'unavailable';
export type AiProvider = 'claude' | 'codex' | 'grok';
export type HAlign = 'start' | 'center' | 'end';
export type VAlign = 'top' | 'middle' | 'bottom';
/** الأنواع التي ترسمها أداة الأشكال.
 *
 * كانت `'rect' | 'ellipse'` فقط — شكلان — وكانت القائمة التي تختار بينهما مشروطة
 * بـ`state.mode === 'pro'`، فالوضع البسيط (وهو الافتراضي) يضغط فيه المصمم «أشكال»
 * فلا يظهر شيء إطلاقًا. هذا بالضبط ما قاله المالك (`UX-AUDIT-2026-10-18.md` §3).
 *
 * كلّها تنكمش إلى `ShapeKind` المستنديّ الثلاثي (`rect`/`ellipse`/`path`) عبر
 * `shapeGeometryFor` في `src/lib/shapeFactory.ts`، فلا ترى الرسّامات الثلاث
 * (`ElementView`، `drawElements`، `renderArtboardSvg`) نوعًا جديدًا أبدًا. */
export type ShapeDrawKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'polygon' | 'star' | 'line' | 'arrow';

/** One row of the per-file batch export result list (ExportDialog shows one per
 * requested size/target, success or failure, after/while a multi-size export runs). */
export interface ExportResult {
  id: string;
  label: string;
  w: number;
  h: number;
  ok: boolean;
  /** أبعاد **الملف المكتوب فعلًا** بالبكسل، بعد ضرب المضاعِف (`exportScale`).
   *
   * `w`/`h` أعلاه هما مقاس الهدف الاسمي، وكانا وحدهما ما يُعرَض في قائمة النتائج —
   * فيقرأ المصمّم «١٠٨٠×١٠٨٠» بينما الملف على القرص ٢١٦٠×٢١٦٠ لأن المضاعِف ٢×
   * افتراضيًا. العدد المعروض كان صحيحًا عن شيءٍ لم يُطلب، وخاطئًا عن الملف. غائبان
   * في SVG لأنه متجهيّ بلا أبعاد بكسل. */
  outW?: number;
  outH?: number;
  path?: string;
  error?: string;
  /** Roadmap #16: present only when the batch ran across multiple artboards
   * (`exportAllArtboards`), so ExportDialog can group/label rows by artboard. */
  artboardId?: string;
  artboardName?: string;
  /** Roadmap #23: the paired MOV's path, set only on a Live Photo result.
   * `path` alone points at the still JPEG, which reveals the folder but is not
   * enough to hand the *pair* to the Photos library — and handing over the pair
   * is the only thing that produces a real Live Photo instead of two loose
   * files. ExportDialog shows its "add to Photos" action only on rows carrying
   * this. */
  pairedMovPath?: string;
}

/** Roadmap #16 — one artboard's identity + non-undoable display settings. The
 * artboard's actual content (elements/anim/size) lives in a `DocSnapshot`, either
 * the top-level one (if this is the active artboard) or inside `artboardDocs` (see
 * `StudioState.artboardDocs`) — never duplicated here, so there is exactly one
 * place each artboard's document can go stale. */
export interface ArtboardMeta {
  id: string;
  name: string;
  /** Index into `PALETTES` (`data/constants.ts`) — resolves this artboard's own
   * background/foreground/accent colors, independently of whichever palette the
   * currently active artboard has applied. Mirrors `StudioState.postPalette`
   * (itself not part of `DocSnapshot`/undo) rather than a raw color string, so
   * elements using a `PaletteToken` fill (`fillToken`/`labelColorToken`) resolve
   * correctly per-artboard instead of only against the one active palette. */
  paletteIdx: number;
}

/** A non-active artboard's full document + undo history, keyed by id in
 * `StudioState.artboardDocs`. The active artboard's equivalent lives directly in
 * the top-level `elements`/`anim`/`sizeIdx`/`customW`/`customH`/`historyPast`/
 * `historyFuture` fields, exactly as it did before multi-artboard documents
 * (roadmap #16) existed — this record only gains/loses an entry the moment
 * `switchArtboard`/`addArtboard`/`duplicateArtboard`/`deleteArtboard` moves the
 * active artboard away from (or removes) one. */
export interface ArtboardDoc {
  doc: DocSnapshot;
  historyPast: DocSnapshot[];
  historyFuture: DocSnapshot[];
}

export interface FontEntry {
  id: number;
  name: string;
  family: string;
  status: 'ready' | 'loading' | 'error';
  custom?: boolean;
  error?: string;
}

/** The undo/redo-able subset of state: the full element list plus artboard-level
 * fields (headline entrance animation preset, artboard size, and the custom size
 * typed by the user when sizeIdx is the CUSTOM_SIZE_IDX sentinel). */
export interface DocSnapshot {
  elements: DocElement[];
  anim: AnimId;
  sizeIdx: number;
  customW: number;
  customH: number;
  /** زخرفة اللوحة: الدائرة اللونيّة الكبيرة التي تنزف خارج الحافّة العليا اليمنى.
   *
   * صارت حقلًا في المستند في ١٨ أكتوبر ٢٠٢٦، وهذا تتمّةُ إصلاحٍ ناقص. كانت الدائرة
   * تُرسَم على **كل مستندٍ غير فارغ** بلا استثناء: ليست عنصرًا، فلا تُحدَّد ولا
   * تُنقَل ولا يُغيَّر لونها ولا تُحذَف — ومع ذلك تُحرَق في كل ملفٍّ مُصدَّر. وكان
   * كتمُها على المستند الفارغ وحده يفي بوعد «ابدأ من فراغ» لحظةً واحدة: أوّل عنصرٍ
   * يضعه المصمّم يُنبت في زاويته قرصًا بعرض نصف اللوحة لم يطلبه ولا يملك إزالته.
   * وقد ثبت ذلك بالقياس في حلقة المحاكاة (`qa/replication`): زاوية الهدف الأول
   * خاليةٌ تمامًا، والمحاولة المبنيّة بالواجهة لم تستطع إخلاءها.
   *
   * فالقرار الآن للمستند لا للبرنامج: اللوحة الفارغة تبدأ بلا زخرفة، والقوالب
   * الجاهزة — المؤلَّفة حولها أصلًا — تبدأ بها، وللمصمّم مفتاحٌ يقلبها في لوح
   * «الألوان». وهي داخل `DocSnapshot` لا خارجه لأنها صفةُ مستندٍ تُحفَظ وتُتراجَع
   * ككل صفةٍ أخرى، ولأن كل لوحةٍ في مشروعٍ متعدّد اللوحات تملك جوابها الخاص. */
  decorAccent: boolean;
  /** معدّلُ إطارات المستند. شبكةُ الزمن كلُّها تُقاس به: كلُّ كتابةِ مفتاحٍ
   * تُقرَّب إليه (`snapToFrame`)، وخطوةُ السهم إطارٌ منه، و«أهناك مفتاحٌ عند
   * المؤشّر؟» مقارنةُ أرقامِ إطاراتٍ فيه.
   *
   * قيمُه من `FPS_OPTIONS` القائمة (`src/data/constants.ts`)، وكلُّها أعدادٌ
   * صحيحة — ولذلك يكفي مزيجَ **شبكةٌ** ولا يحتاج قاعدةَ زمنٍ صحيحةً بنبضاتٍ
   * دقيقة. وغيابُه في مستندٍ محفوظٍ يعني ٣٠ (`DEFAULT_DOC_FPS`)، وهو ما كان
   * `FRAME = 1/30` المثبَّت في `Timeline.tsx` يفترضه ضمنًا على كلّ مستند. */
  fps: number;
  /** صورةٌ أم فيديو — جوابُ شاشة البداية، محفوظًا حيث يُقرأ.
   *
   * **وهو مشتقٌّ لا مستقلّ.** الطبيعةُ تملكها الوجهةُ نفسها (`SizePreset.kind`)،
   * فهذا الحقل **ذاكرةٌ لجوابِ الوجهة** لا جوابٌ ثانٍ يُنازعها: يُكتَب من
   * `SIZES[sizeIdx].kind` عند بدء المستند، ويُعاد اشتقاقه عند كلّ تبديلِ مقاس،
   * ويُستكمَل عند التحميل من `sizeAt(...)` إن غاب. وبذلك لا يتعارض مع المقاس
   * المختار — وهو الاعتراضُ المكتوب على `SizeMedium` في `src/data/constants.ts`،
   * وهو اعتراضٌ صحيح: لم يُحَلّ بإنكاره بل بجعلِ الحقل مشتقًّا.
   *
   * ولذلك **يبقى الفرعُ قابلًا للتراجع**: تبديلُ المقاس من `ArtboardSizeMenu`
   * يقلب الطبيعةَ في أيّ لحظةٍ بلا بدءٍ من جديد — وهي بالضبط الخصلةُ التي
   * تَهدِمها بوّابةُ الزرّين، وهي الوعدُ الذي قطعته `HomeScreen.tsx` ولم يكن
   * **مُختبَرًا، لأنّ شيئًا في اتّجاه المجرى لم يكن يقرأ `kind` أصلًا**: كان
   * يُحتسَب في موضعٍ واحد ومستهلكاه شارةٌ ولافتة.
   *
   * ولِمَ حقلٌ في المستند لا اشتقاقٌ في كلّ موضع: لأنّ المواضعَ التي تتفرّع عليه
   * ثلاثةٌ بعينها (وجودُ الخطّ الزمنيّ، وقائمةُ الشريط، ووجهاتُ التصدير)، وثلاثةُ
   * اشتقاقاتٍ محليّة ثلاثةُ أجوبةٍ قد تختلف. حقلٌ واحد = جوابٌ واحد = `grep`
   * يستطيع عدَّ المواضع. */
  medium: SizeMedium;
}

export interface AiMessage {
  role: 'u' | 'a';
  text?: string;
  key?: string;
  palettes?: number[];
  headline?: boolean;
}

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface StudioState {
  screen: Screen;
  lang: Lang;
  mode: Mode;
  tool: ToolId;
  shapeDrawKind: ShapeDrawKind;
  /** عدد أضلاع المضلّع أو رؤوس النجمة المسلَّحة للرسم. يُضبَط من بطاقة المكتبة،
   * ويتغيّر حيًّا بمفتاحي ↑/↓ أثناء السحب — قاعدة أداة المتّجهات الواحدة: «السهم أثناء
   * السحب يغيّر المُعامل المُعرِّف للشكل» (`re-illustrator-flows.md` §2.4). */
  shapeDrawN: number;
  panel: PanelId;
  /** الأداة التي يعرض `panel: 'library'` مكتبتها. */
  libraryTool: ToolId;
  assetsTab: AssetsTab;
  tlOpen: boolean;
  exportOpen: boolean;
  exportFormat: ExportFormat;
  targets: Record<string, boolean>;
  exportState: ExportState;
  exportProgress: number;
  exportScale: 1 | 2 | 3;
  exportQuality: 'high' | 'med';
  exportTransparent: boolean;
  exportFps: number;
  exportError: string | null;
  exportedPaths: string[];
  /** Per-target outcome of the current/last batch export, in request order — lets
   * ExportDialog show a clear per-file result list instead of a single pass/fail. */
  exportResults: ExportResult[];
  /** Roadmap #8: when on, every batch-export target whose size differs from the
   * current artboard gets its own heuristically-resized element layout
   * (`magicResizeElements`) instead of the plain fraction reuse every target got
   * before — an export-time-only setting (not part of `DocSnapshot`/undo, like
   * `exportScale`), since it never touches the live document. */
  exportMagicResize: boolean;
  cmdOpen: boolean;
  cmdQuery: string;
  cmdSel: number;
  aiProvider: AiProvider | null;
  aiMsgs: AiMessage[];
  aiInput: string;
  aiTyping: boolean;
  sizeIdx: number;
  customW: number;
  customH: number;
  playing: boolean;
  t: number;
  anim: AnimId;
  sel: ElementId | null;
  selectedIds: ElementId[];
  editingTextId: ElementId | null;
  cropEditingId: ElementId | null;
  lockAspect: boolean;
  /** Roadmap #8: when on, applying a new artboard size from `ArtboardSizeMenu` runs
   * the document's elements through `magicResizeElements` (anchored contain-fit,
   * text re-fit, safe-area clamp) instead of the plain fraction reuse `setSizeIdx`/
   * `setCustomSize` always did — off by default so existing "apply a size" behavior
   * is unchanged unless explicitly opted into. */
  magicResizeOn: boolean;
  /** A doc snapshot taken at the start of a gesture (drag, slider), not yet pushed to
   * history — committed (or discarded, if nothing actually changed) once the gesture
   * ends. Fixes a plain click/press pushing a no-op undo step. */
  pendingEditSnapshot: DocSnapshot | null;
  /** نقاط المسار الجاري رسمه بالقلم، بإحداثيات المستند (بكسل) — ليست جزءًا من
   * `DocSnapshot`/التراجع، لأن المسار لا يصبح عنصرًا حقيقيًا إلا عند `penFinish`.
   * `h` هو مقبض الخروج الذي سحبه المصمم أثناء وضع النقطة (إزاحة بالبكسل من النقطة)؛
   * غائب = نقرة بلا سحب = زاوية. */
  penDraft: Array<{ x: number; y: number; h?: { x: number; y: number } | null }>;
  penClosePath: boolean;
  /** Roadmap #11 (تكملة) — عنصر المسار الموجود حاليًا في وضع تحرير العقد (سحب نقاط الربط
   * والمقابض على اللوحة مباشرة). `null` = لا أحد؛ مثل `cropEditingId`، وضع واحد
   * لعنصر واحد في المرة. ليس جزءًا من المستند، فلا يُحفَظ ولا يدخل التراجع. */
  nodeEditId: ElementId | null;
  /** نقطة الربط/المقبض المحدَّد داخل وضع تحرير العقد — يحدِّد ما يحذفه زر Delete،
   * وأيّ مقابض تُرسَم (مقابض النقطة المحدَّدة فقط، كما في أداة متّجهات، لا كل مقابض
   * المسار دفعةً واحدة). */
  nodeEditSel: { index: number; part: 'anchor' | 'in' | 'out' } | null;
  fonts: FontEntry[];
  fontUrl: string;
  postPalette: number;
  elements: DocElement[];
  /** حقل المستند — انظر `DocSnapshot.decorAccent`. يعيش مسطّحًا على الحالة كما
   * تعيش `elements`/`anim`/`sizeIdx`: اللوحة النشطة وحدها هنا، وبقيّة اللوحات في
   * `artboardDocs`. */
  decorAccent: boolean;
  /** حقلا مستندٍ آخران، مسطّحان على الحالة كجيرانهما — انظر `DocSnapshot.fps`
   * و`DocSnapshot.medium`. */
  fps: number;
  medium: SizeMedium;
  zoom: number;
  panX: number;
  panY: number;
  homePrompt: string;
  historyPast: DocSnapshot[];
  historyFuture: DocSnapshot[];
  dirty: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  savedAt: number | null;
  /** Roadmap #7+#19: the saved template library (design slots + motion structure),
   * loaded once from disk/localStorage on mount — not part of `DocSnapshot`/undo,
   * since it's a separate persisted library, not the current document. */
  templates: Template[];
  templatesOpen: boolean;
  /** Roadmap #9: dialog listing on-device model capabilities (currently just
   * background removal) with download/delete controls — see LocalModelsDialog.tsx. */
  localModelsOpen: boolean;
  /** Roadmap #21: dialog that reads a reference video's shot/cut structure (via
   * FFmpeg scene detection) and turns it into a new entry in `templates` — see
   * ReferenceVideoDialog.tsx. Not part of `DocSnapshot`/undo for the same reason
   * `templatesOpen` isn't: it's a library-building flow, not a document edit. */
  refVideoOpen: boolean;
  /** Roadmap #20: dialog for the local MCP server toggle — see
   * `src/components/McpServerDialog.tsx`. */
  mcpOpen: boolean;
  /** Roadmap #24-ب: dialog for the local natural-language command interpreter —
   * see `src/components/CommandInterpreterDialog.tsx`. Session UI state only, same
   * reasoning as every other dialog flag here. */
  cmdInterpreterOpen: boolean;
  /** Roadmap #20: the user's explicit opt-in for the local MCP bridge. Off by
   * default on every launch (never persisted) — a deliberate security choice, see
   * docs/CONTROLS.md phase 15.
   *
   * This flag used to be a *claim* rather than a fact: `lib.rs::run()` bound
   * 127.0.0.1:7420 unconditionally at launch, so the dialog rendered "off" while
   * `lsof -iTCP:7420` showed a live, unauthenticated local control surface — and
   * that gap was reproduced with curl, not imagined. It is now causal: flipping it
   * on invokes the `mcp_start` Tauri command that creates the socket, flipping it
   * off invokes `mcp_stop` which closes it. */
  mcpServerEnabled: boolean;
  /** Roadmap #20 security fix: the bearer token `mcp_start` minted for the current
   * listening period, which every request to the bridge must present. Shown in the
   * MCP dialog so the user can paste it into their MCP client. `null` whenever
   * nothing is listening; a fresh one is minted on every enable, so an old token is
   * dead the moment the bridge is switched off. Session-only, never persisted. */
  mcpToken: string | null;
  /** Why the last enable attempt failed (e.g. the port is already taken by another
   * Mazij window), surfaced in the dialog instead of leaving the switch silently
   * disagreeing with reality — the original defect in miniature. */
  mcpError: string | null;
  /** Roadmap #22: dialog for calling an external image/video-generation provider
   * with a key the user typed in themselves — see `AiGenerateDialog.tsx`/
   * `src/lib/aiProviders.ts`. Deliberately outside `DocSnapshot`/undo, same as every
   * other dialog-open flag above: it's session UI state, not a document edit (the
   * one undo step happens only once a result is actually inserted as an element). */
  aiGenOpen: boolean;
  aiGenProviderId: string | null;
  aiGenPrompt: string;
  aiGenSize: string;
  aiGenStatus: 'idle' | 'busy' | 'done' | 'error';
  aiGenProgress: number;
  aiGenError: string | null;
  /** Roadmap #16: every artboard in the document, display order, including the
   * active one's metadata (its actual doc lives in the top-level fields instead —
   * see `ArtboardDoc`). Always has at least one entry. */
  artboards: ArtboardMeta[];
  activeArtboardId: string;
  /** Roadmap #16: every *non-active* artboard's full doc + undo history, keyed by
   * id — see `ArtboardDoc`. */
  artboardDocs: Record<string, ArtboardDoc>;
  /** Roadmap #16: dialog listing every artboard with add/rename/duplicate/delete/
   * switch controls — see `src/components/ArtboardsDialog.tsx`. */
  artboardsOpen: boolean;
  /** Roadmap #16: when on, `startExport` runs the whole selected-sizes batch once
   * per artboard instead of just the active one, reusing the roadmap #3 batch-export
   * loop — an export-time-only setting (not part of `DocSnapshot`/undo), like
   * `exportMagicResize`. */
  exportAllArtboards: boolean;
  /** «كل لوحة بمقاسها» — ملفٌ واحد لكل لوحة **بمقاسها هي**، بدل الضرب الديكارتي في
   * قائمة المقاسات المختارة.
   *
   * بدونه كان مستندٌ من ثلاث لوحات (مربع ١٠٨٠×١٠٨٠ · ستوري ١٠٨٠×١٩٢٠ · عريض
   * ١٦٠٠×٩٠٠) يُخرج **اثني عشر ملفًا** عند تفعيل «كل اللوحات»: ثلاث لوحات × أربعة
   * مقاسات مختارة افتراضيًا — وفيها «المربع بمقاس تيك توك» و«العريض بمقاس إنستقرام»،
   * أي صورٌ لم يصمّمها أحد. ولم تكن هناك طريقة لقول «الثلاثة كما هي».
   *
   * هذا هو سلوك `Use Artboards → All` في أداة المتّجهات حرفيًّا: «كل لوح رسم يُصدَّر
   * منفردًا» (`re-illustrator-flows.md` §4.2). إعدادُ تصديرٍ فقط، خارج
   * `DocSnapshot`/التراجع، مثل `exportMagicResize` و`exportAllArtboards`. */
  exportArtboardOwnSize: boolean;
  /** هل هناك مشروعٌ مفتوح يمكن الرجوع إليه من شاشة البداية؟
   *
   * `'checking'` حتى يردّ `loadDoc` عند الإقلاع، ثم `'none'` لمستخدمٍ جديد لا شيء
   * له، أو `'open'` إمّا لأن مشروعًا محفوظًا استُرجع أو لأن المستخدم بدأ مشروعًا
   * في هذه الجلسة.
   *
   * شاشة البداية تحتاجه لأن العائد **لا يجوز أن يُحتجَز خلف المُنتقي**: إن كان له
   * عمل فأبرزُ شيء على الشاشة هو «متابعة» بنقرة واحدة، دون أن يُسأل عن مقاسٍ
   * اختاره أصلًا. و`'checking'` حالةٌ ثالثة حقيقية لا تجميلية: بدونها تظهر الشاشة
   * لحظةً بلا بطاقة متابعة ثم تقفز البطاقة إلى مكانها، فيضغط المستخدم ما لم يقصد.
   *
   * ولاحِظ أن هذا **علَمٌ فقط، ولا يحمل ملخّص المشروع**: تفاصيل البطاقة (المقاس
   * وعدد العناصر واللوحة) تُقرأ من الحالة الحيّة لا من لقطةٍ محفوظة عند الإقلاع.
   * اللقطة المجمّدة كانت تكذب: من يبدأ مشروعًا جديدًا ثم يرجع للشاشة كان يرى
   * بطاقةً تصف المشروع **السابق**، بينما النقر عليها يفتح المشروع الجديد. */
  openDoc: 'checking' | 'none' | 'open';
}

export const initialStudioState: StudioState = {
  // يفتح البرنامج على **سؤال، لا على مستند**. كانت القيمة `'editor'`، فكان مزيج
  // يتجاوز شاشة البدايته المبنيّة أصلًا (`HomeScreen.tsx`) ويهبط في البوستر التجريبي
  // الجاهز — ولم يكن إليها طريق إلا نقر الشعار، وهي إيماءة لا يخمّنها أحد.
  screen: 'home',
  lang: 'ar',
  mode: 'simple',
  tool: 'select',
  shapeDrawKind: 'rect',
  shapeDrawN: DEFAULT_POLYGON_N,
  panel: 'props',
  libraryTool: 'shape',
  assetsTab: 'fonts',
  tlOpen: true,
  exportOpen: false,
  exportFormat: 'png',
  targets: { ig: true, x: true, tt: true, li: true },
  exportState: 'idle',
  exportProgress: 0,
  exportScale: 2,
  exportQuality: 'high',
  exportTransparent: false,
  exportFps: 30,
  exportError: null,
  exportedPaths: [],
  exportResults: [],
  exportMagicResize: false,
  cmdOpen: false,
  cmdQuery: '',
  cmdSel: 0,
  aiProvider: null,
  aiMsgs: [],
  aiInput: '',
  aiTyping: false,
  sizeIdx: 0,
  customW: 1080,
  customH: 1080,
  playing: false,
  // المؤشّر يبدأ من **الصفر**. كانت القيمة `2.2`، وهي بقيّة من البوستر التجريبي الجاهز
  // (لحظةٌ تبدو فيها حركته مكتملة). على مشروعٍ جديد مدّته ٥ ثوانٍ كانت تعني أن أي
  // عنصر يُضاف تُفتَح عليه حركةُ دخوله (0→0.6ث افتراضًا) **منتهيةً سلفًا**، فلا يرى
  // المصمّم شيئًا يتحرّك ولا يعرف أن هناك ما يتحرّك — ويضيف إليها أن «أضِف مفتاحًا
  // عند المؤشّر» كان يُنزل المعيَّن على حافّة المقطع لا تحت المؤشّر (انظر
  // `playheadInsideClip` في `lib/animTimeline.ts`).
  t: 0,
  // مستندٌ فارغ: لا حركةَ دخولٍ ولا عنصرَ محدَّد. كانت `anim: 'slide'` و
  // `sel: 'head'` تشيران إلى عنصرٍ من البوستر التجريبي، وهو لم يعد موجودًا في الإقلاع
  // (انظر `elements: []` أدناه) — فلو بقيت لأشارت إلى عنصرٍ غير موجود.
  anim: 'none',
  sel: null,
  selectedIds: [],
  editingTextId: null,
  cropEditingId: null,
  lockAspect: false,
  magicResizeOn: false,
  pendingEditSnapshot: null,
  penDraft: [],
  penClosePath: false,
  nodeEditId: null,
  nodeEditSel: null,
  fonts: [
    { id: 1, name: 'Alexandria', family: 'Alexandria', status: 'ready' },
    { id: 2, name: 'Readex Pro', family: "'Readex Pro'", status: 'ready' },
    { id: 3, name: 'Vazirmatn', family: 'Vazirmatn', status: 'ready' },
  ],
  fontUrl: '',
  postPalette: 0,
  // لوحةٌ فارغة فعلًا. هذا هو الإصلاح الأهم في هذه الدفعة: المستند الافتتاحي كان
  // `createDefaultElements()` — سبعة عناصر تؤلّف البوستر التجريبي الجاهز — فكان على
  // المصمّم أن يفهم عملَ غيرِه ثم يفكّكه قبل أن يبدأ. اللوحة الفارغة لا تحتاج
  // شرحًا؛ بوستر غريبٍ يحتاجه. البوستر محفوظ كقالب: `lib/starterTemplates.ts`.
  elements: [],
  // ولا زخرفة. المستند الافتتاحي فارغ، و«فارغ» تعني أن كل ما سيظهر على اللوحة
  // وضعه المصمّم بيده — انظر `DocSnapshot.decorAccent`.
  decorAccent: false,
  // ثلاثون إطارًا، وهو المعدّل الذي كان `FRAME = 1/30` المثبَّت يفترضه على كلّ
  // مستند. والمستندُ الافتتاحيّ صورةٌ ثابتة: `sizeIdx: 0` هو «بوست إنستقرام»
  // و`kind: 'still'` — فالجوابُ هنا مطابقٌ لجواب الوجهة، كما يجب أن يكون دائمًا.
  fps: DEFAULT_DOC_FPS,
  medium: 'still',
  zoom: 100,
  panX: 0,
  panY: 0,
  homePrompt: '',
  historyPast: [],
  historyFuture: [],
  dirty: false,
  saveState: 'idle',
  savedAt: null,
  templates: [],
  templatesOpen: false,
  localModelsOpen: false,
  refVideoOpen: false,
  mcpOpen: false,
  cmdInterpreterOpen: false,
  mcpServerEnabled: false,
  mcpToken: null,
  mcpError: null,
  aiGenOpen: false,
  aiGenProviderId: null,
  aiGenPrompt: '',
  aiGenSize: '1024x1024',
  aiGenStatus: 'idle',
  aiGenProgress: 0,
  aiGenError: null,
  artboards: [{ id: 'ab-1', name: 'لوحة 1', paletteIdx: 0 }],
  activeArtboardId: 'ab-1',
  artboardDocs: {},
  artboardsOpen: false,
  exportAllArtboards: false,
  exportArtboardOwnSize: false,
  openDoc: 'checking',
};
