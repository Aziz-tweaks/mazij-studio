import type { DocSnapshot } from '../state/types';
import { inTauri } from './tauriEnv';

const LOCAL_KEY = 'mazij.autosave.v1';
const FILE_NAME = 'autosave.json';

/** Roadmap #16 — one artboard's identity + content as written to disk. See
 * `ArtboardMeta`/`DocSnapshot` in `state/types.ts` for what each field means; undo
 * history is intentionally not persisted here, same as before multi-artboard
 * documents existed (a reload always starts with empty history). */
export interface PersistedArtboard {
  id: string;
  name: string;
  paletteIdx: number;
  doc: DocSnapshot;
}

// ─────────────────────────────────────────────────────────────────────────────
// التحقّقُ على طبقتين / Two-tier validation
// ─────────────────────────────────────────────────────────────────────────────
//
// **ما يجب أن يُنتجه تعديلٌ أصرمُ ممّا يجب أن يَستوفيه ملفٌّ ليُفتَح.** الفكرة من
// محرّر خطٍّ زمنيٍّ مفتوح، وهي مُثبَّتةٌ هناك باختبارٍ مُسمًّى باسم السياسة نفسها
// (`crates/format/src/lib.rs:386-410`، `structural_rule_breaks_still_open`).
//
// الطبقةُ الصارمة — **ما يُنتجه التعديل**:
//   · لا مفتاحانِ على الإطار نفسه. ويُحرَسُ ذلك بنيويًّا لا بفحص: كلُّ كتابةِ مفتاحٍ
//     تمرّ بـ`setKeyframe` (`animTimeline.ts`)، وهي تَستبدل عند تطابق الزمن تمامًا
//     بدل أن تُدرج ثانيًا — فحالةُ «مفتاحان على زمنٍ واحد» لا يُمكن للواجهة أن
//     تَبلغها أصلًا.
//   · لا مقطعٌ بطولٍ صفريّ من سحبِ حافّة: الحافّتان تُحجَزان عند إطارٍ واحد
//     (`Clip.tsx`)، و`frameDuration(fps)` هو أدنى الطول لا `0.1` مثبَّتًا.
//
// الطبقةُ المتسامحة — **ما يُفتَح**: مستندٌ محفوظٌ فيه مقطعٌ بطولٍ صفريّ، أو
// مفتاحانِ على الزمن نفسه، **يُفتَح بكلّ عناصره سليمةً** ولا يُرفَض ولا «يُصلَح»
// بحذفِ شيء. ولا موضعَ في مسار التحميل يُسقِط عنصرًا أو مفتاحًا: `migrateAnim`
// تُحوِّل ولا تَحكم، و`trackValueAt` تقرأ مسافةً صفريّةً بين مفتاحَين فتُعيد قيمةَ
// الثاني (`span <= 0 ? 1 : …`) بدل أن تَقسم على صفر، و`documentDuration` تَحجِز
// الطولَ عند إطارٍ واحد فلا يَنتج مُقامٌ صفريّ في الواجهة.
//
// ولِمَ تُعتمَد السياسةُ الآن ولو لم تَحتجها المرحلة: تركيبُها **بعد** أوّل مستندٍ
// لا يُفتَح هو الترتيبُ المؤلم — المستندُ حينها على قرصِ مستخدمٍ، والبرنامجُ هو من
// كتبه. وهي مُقاسةٌ في `qa/migration-roundtrip.spec.mjs` §٦.

/** الترحيلاتُ المُعنوَنة، بالترتيب. `DOC_MIGRATIONS[i]` يرفع النسخة `i+1` إلى
 * `i+2`.
 *
 * **ونسخةُ المخطّط مشتقّةٌ من طول هذه القائمة لا مكتوبةً بيدها** — الفكرة من
 * محرّر خطٍّ زمنيٍّ مفتوح، `crates/format/src/lib.rs:62-69`
 * (`SCHEMA_VERSION = MIGRATIONS.len() + 1`): فلا تستطيع النسخةُ أن تنحرف عن
 * ترحيلاتها. من أضاف ترحيلًا رفع النسخةَ بحكم البناء، ومن رفع النسخةَ بلا ترحيلٍ
 * لم يستطع. */
export const DOC_MIGRATIONS: readonly string[] = [
  // ١ → ٢: زمنُ المفتاح من كسرٍ من المقطع إلى ثوانٍ مطلقة، و`t` تصير `time`.
  // والترحيلُ نفسه في `migrateKeyframe` في `StudioContext.tsx`، لأنه يعرف العنصر
  // وهذه الوحدةُ لا تعرف إلا البايتات.
  'keyframe-time-absolute',
  // ٢ → ٣: `PropertyTracks` تَقبل `scaleX` و`scaleY` — معاملانِ لكلّ محور يُضربان
  // في `scale` المنتظم (`effectiveScale` في `src/lib/animTimeline.ts`).
  //
  // **وهذا بندٌ لا يُحوِّل بايتًا، وذلك مقصود.** لا بايتَ قائمٌ يُعاد تفسيره: غيابُ
  // المسار **هو** المحايد، ومحايدُه `1`، والضربُ في الواحد تامٌّ في IEEE 754 —
  // فمستندٌ قديمٌ يُرسَم كما كان بالضبط بلا أيّ تحويلٍ يُجرى عليه. وهو عقدُ «كلُّ
  // حقلٍ جديد اختياريٌّ يُكمَّل بقيمةٍ محايدة» المكتوب أعلاه، ونفسُه الذي حمله
  // `sourceIn` و`appearance` و`groupId` — ولم يَحتج واحدٌ منها بندًا هنا.
  //
  // **فلِمَ وُجد البندُ إذن؟ للاتّجاه الآخر، وهو الخطِر.** مستندٌ يحمل مسارَ محورٍ
  // يَفتحه بناءٌ **أقدم**: بلا رفعِ النسخة تُجيب `isTooNew` هناك «لا»، فيُفتَح،
  // فتَقرأ `resolveAnimAt` تلك `scale` وحده وتَرسم الحركةَ **منتظمةً** — صورةٌ
  // خاطئةٌ بلا أيّ خطأٍ يَظهر. وأسوأُ منها: `cascadeEasingToTracks` هناك تَبني
  // `next` من `ANIM_PROPERTIES` التي لا تَعرف المحورَين، فضغطةٌ واحدةٌ على منحنى
  // التخفيف **تَحذفهما من المستند**، ثم يَكتب الحفظُ التلقائيُّ الفقدَ فوق عملٍ
  // قائم.
  //
  // ورفعُ النسخة يَجعل ذلك البناءَ يَرفض الملفَّ صراحةً (`isTooNew` ⇒ `loadDoc`
  // تُعيد `null`) بدل أن يَفتحه بنصفه — وهو بعينه ما تأمر به §1C.٣ في
  // `docs/PLAN-video-branch.md`: «ويُشحَن ترحيلٌ لا يفعل شيئًا بقصد، كي يَتعلّم
  // بناءٌ أقدمُ أن يَرفض ملفًّا أحدثَ رفضًا نظيفًا بدل أن يُسقِط حقولًا في صمت عند
  // أوّل حفظ».
  //
  // وثمنُه مُعلَنٌ لا مُخفًى: رقمُ النسخة واحدٌ للمستند كلِّه، فكلُّ مستندٍ يحفظه
  // هذا البناءُ يَرفضه الأقدمُ — ولو لم يستعمل المحورَين أصلًا. ودقّةٌ أرفعُ من
  // ذلك تَحتاج علمَ قدرةٍ لكلّ ميزة، وهي ليست في هذا التصميم ولم تُطلَب.
  'nonuniform-scale-tracks',
  // ٣ → ٤: ضبابيّةٌ حقيقيّةٌ على العنصر نفسِه — `ElementBase.blur` الساكنةُ ومسارُ
  // `blur` المتحرّك، كسرًا من عرض اللوح (`effectiveBlur` في
  // `src/lib/animTimeline.ts`).
  //
  // **وهذا بندٌ لا يُحوِّل بايتًا، وذلك مقصودٌ للسبب نفسِه**: غيابُ الحقل وغيابُ
  // المسار **هما** المحايد، ومحايدُ الضبابيّة `0`، وجمعُ الصفر تامٌّ في IEEE 754 —
  // فمستندٌ قديمٌ يُرسَم حادًّا كما كان بالضبط، ولا تُنبعَث له `filter` أصلًا ولا
  // يُضبَط له `ctx.filter`. وهو عقدُ `appearance` و`groupId` و`widthProfile` نفسُه.
  //
  // **فلِمَ وُجد البندُ إذن؟ للاتّجاه الآخر، وهو هنا أخطرُ منه في البند السابق،
  // لأنّ الفقدَ على طرفَين لا طرفٍ واحد:**
  //
  // ١. مستندٌ يحمل `el.blur` يَفتحه بناءٌ أقدم: الحقلُ غيرُ معروفٍ هناك، فيُرسَم
  //    العنصرُ **حادًّا بلا أيّ خطأٍ يَظهر** — وهو عينُ ما بُني هذا البندُ لأجله،
  //    فيضيع المقصودُ كلُّه في صمت.
  // ٢. وأسوأُ: `cascadeEasingToTracks` هناك تَبني `next` من `ANIM_PROPERTIES`
  //    التي لا تَعرف `blur`، فضغطةٌ واحدةٌ على منحنى التخفيف **تَحذف المسارَ من
  //    المستند**، ثم يَكتب الحفظُ التلقائيُّ الفقدَ فوق عملٍ قائم. ومعها
  //    `PRESET_FREE_PROPERTIES` هناك لا تَعرف `blur`، فمسارٌ بمفتاحَين يُقرأ
  //    «نمطًا جاهزًا» فتُبيده `withPreset` عند أوّل ضغطةٍ على «تلاشٍ».
  //
  // ورفعُ النسخة يَجعل ذلك البناءَ يَرفض الملفَّ صراحةً (`isTooNew` ⇒ `loadDoc`
  // تُعيد `null`) بدل أن يَفتحه بنصفه — وهو نصُّ ما تأمر به §1C.٣ في
  // `docs/PLAN-video-branch.md`. وثمنُه مُعلَنٌ كما كان: رقمُ النسخة واحدٌ للمستند
  // كلِّه، فكلُّ مستندٍ يحفظه هذا البناءُ يَرفضه الأقدمُ ولو لم يَستعمل الضبابيّة.
  'element-blur',
  // ٤ → ٥: **طبقاتُ المقطع** (٢٥ أكتوبر ٢٠٢٦) — ما احتاجه نسخُ مقطعٍ حقيقيّ من الواجهة:
  // تخفيفُ «تثبيت» (`'hold'`)، و«يظهر في مقطعه فقط» (`ElementAnim.bounded`)، ومسارا
  // «بداية الخط» و«نهاية الخط» (`trimStart`/`trimEnd`)، ومسارُ «الظهور» (`reveal`) وآثارُ
  // التتابع الثلاثة الجديدة (`blur`/`none`/`type`)، وطبقةُ الصوت (`type: 'audio'`).
  //
  // **وهذا بندٌ لا يُحوِّل بايتًا كسابقَيه**: كلُّ حقلٍ جديدٍ غائبٌ عن كلّ مستندٍ قائم،
  // وغيابُه هو السلوكُ القائم بالحرف (لا تثبيتَ، لا حدود، لا قصّ، توقيتٌ تلقائيّ، لا صوت).
  //
  // **وهو للاتّجاه الآخر — وهنا أخطرُ منه في أيّ بندٍ قبله، لأنّ بعضَ الحقول يُسقِط
  // البناءَ الأقدمَ نفسَه لا رسمَه وحده:**
  //
  // ١. `easing: 'hold'` يقرؤه الأقدمُ مفتاحًا في `EASING_BEZIER` لا يجده، فيُمرِّر
  //    `undefined` إلى حلّ بيزيه — رمٌ على كلّ إطارٍ في المقطع.
  // ٢. عنصرٌ `type: 'audio'` يقع في فرع «الشكل» من كلّ رسّامةٍ قديمة (`ElementView`
  //    و`drawElements`) فيُقرأ منه `shape` و`label` غيرُ الموجودين.
  // ٣. والباقي يُرسَم خطأً بلا خطأٍ يظهر: عنصرٌ محدودٌ يبقى ظاهرًا بعد مقطعه، وخطٌّ
  //    مقصوصٌ يُرسَم كاملًا، ونصٌّ موقَّتٌ بالكلمة يظهر بإيقاعٍ ثابت، و«كتابة» تُرسَم تلاشيًا.
  //
  // ورفعُ النسخة يجعل ذلك البناءَ يرفض الملفَّ صراحةً (`isTooNew`) بدل أن يفتحه بنصفه أو
  // يسقط عليه — نصُّ §1C.٣ في `docs/PLAN-video-branch.md`. والثمنُ المعلَنُ نفسُه: كلُّ
  // مستندٍ يحفظه هذا البناءُ يرفضه الأقدمُ ولو لم يستعمل شيئًا من هذا.
  'clip-layers',
  // ٥ → ٦: **طبقاتُ المؤثّرات** (٢٨ أكتوبر ٢٠٢٦) — عنصرٌ `type: 'fx'` (فلتر، مؤثّر،
  // انتقال) يُغيّر ما تحته. لا يُحوِّل بايتًا في مستندٍ قائم؛ والرفعُ لأنّ البناءَ الأقدم
  // يقرأ العنصرَ في فرع «الشكل» من رسّاماته — السببُ نفسُه المكتوب لطبقة الصوت أعلاه.
  'fx-layers',
];

/** رقمُ النسخة الذي يكتبه هذا البناء. */
export const SCHEMA_VERSION = DOC_MIGRATIONS.length + 1;

/** نسخةُ مستندٍ محمَّل. غيابُ الحقل = **صفر** = «أقدمُ من كلّ شيء، فشغِّل كلَّ
 * ترحيل» — وهي حالةُ كلّ مستندٍ حُفِظ قبل اليوم، إذ لم يكن في `PersistedDoc` رقمُ
 * نسخةٍ قطّ. و`.v1` في `LOCAL_KEY` ليست نسخةَ مخطّط: إنها جزءٌ من اسمِ مفتاحِ
 * التخزين، لا تُقرأ ولا تُحلَّل ولا تُقارَن ولا تُكتَب في الحِمل. */
export function schemaVersionOf(raw: unknown): number {
  const v = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** أسماءُ الترحيلات التي يجب أن تُشغَّل على مستندٍ بهذه النسخة. */
export function migrationsFor(version: number): readonly string[] {
  return DOC_MIGRATIONS.slice(Math.max(0, version - 1));
}

/** مستندٌ كتبه بناءٌ **أحدث** من هذا.
 *
 * ويُرفَض صراحةً لا يُفتَح بنصفه: فتحُه يعني إسقاطَ الحقول التي لا يعرفها هذا
 * البناء، ثم كتابتَها فوق الملفّ الأصلي عند أوّل حفظٍ تلقائيّ — أي تلفًا صامتًا في
 * عملٍ قائم. وهذا ما يفعله محرّر خطٍّ زمنيٍّ مفتوح بـ`FormatError::TooNew`
 * (`crates/format/src/lib.rs:295-362`)، والمرحلةُ ١ لا تحتاجه بعد — تحتاجه المرحلةُ
 * ٤، وتركيبُ رقمِ نسخةٍ بعد أوّل ملفٍّ لا يُفتَح هو الترتيبُ المؤلم. */
export function isTooNew(raw: unknown): boolean {
  return schemaVersionOf(raw) > SCHEMA_VERSION;
}

/** The on-disk/localStorage document shape since multi-artboard support (roadmap
 * #16). `loadDoc` returns the raw parsed JSON un-migrated — a document saved
 * before this existed is a bare `DocSnapshot` instead (no `artboards` key at all);
 * wrapping that losslessly into this shape is `StudioContext.tsx`'s job (next to
 * its other doc migrations, `migrateAnim`/`normalizeDoc`), not this module's. */
export interface PersistedDoc {
  artboards: PersistedArtboard[];
  activeArtboardId: string;
  /** اختياريّ في النوع لأنّ كلّ مستندٍ محفوظٍ قبل اليوم لا يحمله؛ و`saveDoc` أدناه
   * يكتبه دائمًا، فلا يُحفَظ مستندٌ بعد اليوم بلا نسخة. */
  schemaVersion?: number;
}

/** **مكتبةُ المشاريع** (٢٨ أكتوبر ٢٠٢٦).
 *
 * كان مزيج يحفظ مشروعًا واحدًا في `autosave.json`، فكلُّ «ابدأ من فراغ» أو قالبٍ جديد يكتب
 * **فوق** المشروع السابق بلا سؤال — وبهذا ضاع مشروعُ تيك توك من ٧٥ عنصرًا يوم ٢٨ أكتوبر
 * حين فُتح قالبٌ للتجربة. فصار لكلّ مشروعٍ ملفُّه:
 *
 * - البرنامج: `<appData>/projects/<id>.json`، ومؤشّرُ المفتوح في `<appData>/current.json`.
 *   و`autosave.json` القديم يُنسَخ مشروعًا أوّلَ مرّة ويبقى في مكانه لا يُمَسّ — فالنسخةُ
 *   المثبّتة الأقدم تجد ملفّها كما تركته.
 * - المعاينة في المتصفّح: `mazij.project.<id>`، ويبقى `LOCAL_KEY` مرآةً للمشروع المفتوح
 *   (تقرؤه فحوصُ الجودة كلُّها).
 *
 * والمعرّفُ يولَد في `startDoc`، فلا يكتب مشروعٌ جديدٌ إلا في ملفّه. */
const PROJECTS_DIR = 'projects';
const CURRENT_FILE = 'current.json';
const PROJECT_KEY_PREFIX = 'mazij.project.';
const CURRENT_KEY = 'mazij.project.current';

export function newProjectId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** وصفُ مشروعٍ في المكتبة — ما تحتاجه شاشةُ البداية لتعرضه بلا فتحه. */
export interface ProjectSummary {
  id: string;
  updatedAt: number;
  sizeIdx: number;
  customW: number;
  customH: number;
  elementCount: number;
  artboardCount: number;
}

function summarize(id: string, raw: unknown, updatedAt: number): ProjectSummary | null {
  const f = raw as { artboards?: Array<{ doc?: { elements?: unknown[]; sizeIdx?: number; customW?: number; customH?: number } }>; activeArtboardId?: string; updatedAt?: number; elements?: unknown[]; sizeIdx?: number; customW?: number; customH?: number } | null;
  if (!f || typeof f !== 'object') return null;
  const doc = Array.isArray(f.artboards) ? f.artboards[0]?.doc : f;
  if (!doc) return null;
  return {
    id,
    updatedAt: typeof f.updatedAt === 'number' ? f.updatedAt : updatedAt,
    sizeIdx: doc.sizeIdx ?? 0,
    customW: doc.customW ?? 1080,
    customH: doc.customH ?? 1080,
    elementCount: Array.isArray(doc.elements) ? doc.elements.length : 0,
    artboardCount: Array.isArray(f.artboards) ? f.artboards.length : 1,
  };
}

async function tauriDirs() {
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const root = await appDataDir();
  return { root, projects: await join(root, PROJECTS_DIR), join };
}


// ———————————————————————— الوسائط خارج ملفّ المشروع ————————————————————————
//
// الصورُ والمقاطعُ والأصوات تعيش في المستند عناوينَ بيانات (`data:`)، وكان ملفُّ المشروع
// يحملها كلَّها: ملفُّ المشهد الثاني ٣ ميجا، ويُعاد كتابتُه كاملًا كلَّ ٧٠٠ م.ث من الحفظ
// التلقائيّ. في البرنامج (لا المتصفّح) تُكتب كلُّ وسيطةٍ مرّةً واحدة في
// `projects/media/<بصمة>.<امتداد>`، ويحمل الملفُّ إشارةً إليها؛ والمستندُ في الذاكرة لا
// يتغيّر. البصمةُ تُحسب مرّةً لكلّ وسيطة وتُحفظ، فلا يُعاد حسابُها مع كلّ حفظ.
const MEDIA_DIR = 'media';
const MEDIA_REF = 'mazij-media:';
const MEDIA_FIELDS = ['src', 'poster', 'bgOriginalSrc'] as const;
const MIN_EXTERNAL = 4096;
const hashOf = new Map<string, string>();
const EXT_OF: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' };
const MIME_OF: Record<string, string> = Object.fromEntries(Object.entries(EXT_OF).map(([m, e]) => [e, m]));

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function externalize(dataUrl: string, mediaDir: string): Promise<string> {
  const known = hashOf.get(dataUrl);
  if (known) return MEDIA_REF + known;
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(5, comma);
  if (!meta.endsWith(';base64')) return dataUrl;
  const mime = meta.slice(0, -7);
  const bytes = b64ToBytes(dataUrl.slice(comma + 1));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  const name = `${Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}.${EXT_OF[mime] ?? 'bin'}`;
  const { writeFile, exists } = await import('@tauri-apps/plugin-fs');
  const { join } = await import('@tauri-apps/api/path');
  const path = await join(mediaDir, name);
  if (!(await exists(path))) await writeFile(path, bytes);
  hashOf.set(dataUrl, name);
  return MEDIA_REF + name;
}

type ElementBag = Record<string, unknown>;
function elementsOf(file: unknown): ElementBag[] {
  const f = file as { artboards?: Array<{ doc?: { elements?: ElementBag[] } }>; elements?: ElementBag[] };
  if (Array.isArray(f?.artboards)) return f.artboards.flatMap((a) => a.doc?.elements ?? []);
  return Array.isArray(f?.elements) ? f.elements : [];
}

/** نسخةٌ من الملفّ بإشاراتٍ بدل الوسائط الكبيرة — للكتابة على القرص وحدها. */
async function withMediaExternal(file: PersistedDoc): Promise<PersistedDoc> {
  const copy = JSON.parse(JSON.stringify(file)) as PersistedDoc;
  const { mkdir } = await import('@tauri-apps/plugin-fs');
  const { projects, join } = await tauriDirs();
  const mediaDir = await join(projects, MEDIA_DIR);
  await mkdir(mediaDir, { recursive: true });
  for (const el of elementsOf(copy)) {
    for (const k of MEDIA_FIELDS) {
      const v = el[k];
      if (typeof v === 'string' && v.startsWith('data:') && v.length > MIN_EXTERNAL) el[k] = await externalize(v, mediaDir);
    }
  }
  return copy;
}

/** يُرجع الوسائطَ إلى المستند المقروء عناوينَ بيانات — فلا يعرف بقيّةُ البرنامج بالإشارات. */
async function withMediaInline(parsed: unknown): Promise<unknown> {
  const els = elementsOf(parsed);
  if (!els.some((el) => MEDIA_FIELDS.some((k) => typeof el[k] === 'string' && (el[k] as string).startsWith(MEDIA_REF)))) return parsed;
  const { readFile, exists } = await import('@tauri-apps/plugin-fs');
  const { projects, join } = await tauriDirs();
  for (const el of els) {
    for (const k of MEDIA_FIELDS) {
      const v = el[k];
      if (typeof v !== 'string' || !v.startsWith(MEDIA_REF)) continue;
      const name = v.slice(MEDIA_REF.length);
      const path = await join(projects, MEDIA_DIR, name);
      if (!(await exists(path))) {
        el[k] = null;
        continue;
      }
      const dataUrl = `data:${MIME_OF[name.split('.').pop() ?? ''] ?? 'application/octet-stream'};base64,${bytesToB64(await readFile(path))}`;
      hashOf.set(dataUrl, name);
      el[k] = dataUrl;
    }
  }
  return parsed;
}

/** Persists the document snapshot for real, **into its own project file**: to the
 * app-data directory via Tauri's fs plugin when packaged, or to localStorage in the
 * plain browser/dev preview. Throws on failure so the caller can show a real "save
 * failed" state instead of pretending the save succeeded. */
export async function saveDoc(file: PersistedDoc, projectId?: string): Promise<void> {
  const id = projectId || newProjectId();
  // النسخةُ تُكتَب هنا لا عند المُنادي، فلا يوجد مسارُ حفظٍ ينسى كتابتها.
  const stamp = { schemaVersion: SCHEMA_VERSION, projectId: id, updatedAt: Date.now() };
  if (inTauri) {
    const json = JSON.stringify({ ...(await withMediaExternal(file)), ...stamp });
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const { root, projects, join } = await tauriDirs();
    await mkdir(projects, { recursive: true });
    await writeTextFile(await join(projects, `${id}.json`), json);
    await writeTextFile(await join(root, CURRENT_FILE), JSON.stringify({ id }));
  } else {
    const json = JSON.stringify({ ...file, ...stamp });
    window.localStorage.setItem(PROJECT_KEY_PREFIX + id, json);
    window.localStorage.setItem(CURRENT_KEY, id);
    window.localStorage.setItem(LOCAL_KEY, json);
  }
}

function parseDocFile(json: string | null): unknown | null {
  if (!json) return null;
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') return null;
  // مستندٌ من بناءٍ أحدث: يُرفَض كأنْ لا حفظَ هناك، فلا يُفتَح بنصفه ولا يُكتَب
  // فوقه. انظر `isTooNew`.
  if (isTooNew(parsed)) return null;
  const hasLegacyShape = Array.isArray((parsed as { elements?: unknown }).elements);
  const hasArtboardsShape = Array.isArray((parsed as { artboards?: unknown }).artboards);
  if (!hasLegacyShape && !hasArtboardsShape) return null;
  return parsed;
}

/** معرّفُ المشروع الذي فتحه آخرُ `loadDoc` — يقرؤه `StudioContext` ليحفظ في الملفّ نفسه. */
let lastLoadedId: string | null = null;
export function loadedProjectId(): string | null {
  return lastLoadedId;
}

/** كلُّ المشاريع المحفوظة، الأحدثُ أوّلًا. لا يرمي: مكتبةٌ لا تُقرأ = مكتبةٌ فارغة. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const out: ProjectSummary[] = [];
  try {
    if (inTauri) {
      const { readDir, readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const { projects, join } = await tauriDirs();
      if (!(await exists(projects))) return [];
      for (const e of await readDir(projects)) {
        if (!e.isFile || !e.name.endsWith('.json')) continue;
        const id = e.name.slice(0, -5);
        try {
          const sum = summarize(id, JSON.parse(await readTextFile(await join(projects, e.name))), 0);
          if (sum) out.push(sum);
        } catch {
          /* ملفٌّ تالف لا يُسقط المكتبة */
        }
      }
    } else {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || !k.startsWith(PROJECT_KEY_PREFIX) || k === CURRENT_KEY) continue;
        try {
          const sum = summarize(k.slice(PROJECT_KEY_PREFIX.length), JSON.parse(window.localStorage.getItem(k) ?? 'null'), 0);
          if (sum) out.push(sum);
        } catch {
          /* idem */
        }
      }
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** يجعل المشروعَ المفتوح هو ما يفتحه البرنامجُ في المرّة القادمة — قبل أوّل تعديلٍ فيه. */
export async function markCurrentProject(id: string): Promise<void> {
  try {
    if (inTauri) {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const { root, join } = await tauriDirs();
      await writeTextFile(await join(root, CURRENT_FILE), JSON.stringify({ id }));
    } else {
      window.localStorage.setItem(CURRENT_KEY, id);
      const json = window.localStorage.getItem(PROJECT_KEY_PREFIX + id);
      if (json) window.localStorage.setItem(LOCAL_KEY, json);
    }
  } catch {
    /* المؤشّرُ راحةٌ لا عقد: الحفظُ التالي يكتبه على أيّ حال */
  }
}

/** يقرأ مشروعًا بعينه من المكتبة — بالشكل الخام نفسه الذي يُرجعه `loadDoc`. */
export async function loadProject(id: string): Promise<unknown | null> {
  try {
    let json: string | null;
    if (inTauri) {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const { projects, join } = await tauriDirs();
      const path = await join(projects, `${id}.json`);
      json = (await exists(path)) ? await readTextFile(path) : null;
    } else {
      json = window.localStorage.getItem(PROJECT_KEY_PREFIX + id);
    }
    const parsed = parseDocFile(json);
    if (parsed) lastLoadedId = id;
    return parsed && inTauri ? await withMediaInline(parsed) : parsed;
  } catch {
    return null;
  }
}

/** Reads back the open project, if any, as raw parsed JSON — either the current
 * `PersistedDoc` shape or a pre-roadmap-#16 bare `DocSnapshot`; the caller
 * (`migrateToDocFile` in `StudioContext.tsx`) tells those apart and migrates.
 * Never throws: a missing/corrupt/unrecognized save just means "start from the
 * default document", same as a first run.
 *
 * **والمشروعُ المفتوح** هو ما يشير إليه `current.json`؛ فإن لم توجد مكتبةٌ بعد وكان
 * `autosave.json` القديم موجودًا، نُسِخ مشروعًا أوّل وبقي هو في مكانه. */
let loading: Promise<unknown | null> | null = null;
export function loadDoc(): Promise<unknown | null> {
  // نداءان متزامنان (وضعُ React الصارم يشغّل أثرَ التحميل مرّتين) يشتركان في قراءةٍ واحدة،
  // وإلا نَسخ كلٌّ منهما `autosave.json` مشروعًا فصار المشروعُ الواحد مشروعين (رُصد في
  // التجربة على البرنامج).
  loading ??= loadDocOnce().finally(() => {
    loading = null;
  });
  return loading;
}

async function loadDocOnce(): Promise<unknown | null> {
  lastLoadedId = null;
  try {
    if (inTauri) {
      const { readTextFile, writeTextFile, exists, mkdir } = await import('@tauri-apps/plugin-fs');
      const { root, projects, join } = await tauriDirs();
      const currentPath = await join(root, CURRENT_FILE);
      if (await exists(currentPath)) {
        const { id } = JSON.parse(await readTextFile(currentPath)) as { id?: string };
        if (id) {
          const got = await loadProject(id);
          if (got) return got;
        }
      }
      const legacy = await join(root, FILE_NAME);
      if (!(await exists(projects)) && (await exists(legacy))) {
        const json = await readTextFile(legacy);
        const parsed = parseDocFile(json);
        if (!parsed) return null;
        const id = newProjectId();
        await mkdir(projects, { recursive: true });
        await writeTextFile(await join(projects, `${id}.json`), json);
        await writeTextFile(currentPath, JSON.stringify({ id }));
        lastLoadedId = id;
        return parsed;
      }
      return null;
    }
    const parsed = parseDocFile(window.localStorage.getItem(LOCAL_KEY));
    if (parsed) lastLoadedId = (parsed as { projectId?: string }).projectId ?? window.localStorage.getItem(CURRENT_KEY) ?? newProjectId();
    return parsed;
  } catch {
    return null;
  }
}
