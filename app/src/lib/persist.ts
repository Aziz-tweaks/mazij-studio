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

/** Persists the document snapshot for real: to the app-data directory via Tauri's
 * fs plugin when packaged, or to localStorage in the plain browser/dev preview.
 * Throws on failure so the caller can show a real "save failed" state instead of
 * pretending the save succeeded. */
export async function saveDoc(file: PersistedDoc): Promise<void> {
  // النسخةُ تُكتَب هنا لا عند المُنادي، فلا يوجد مسارُ حفظٍ ينسى كتابتها.
  const json = JSON.stringify({ ...file, schemaVersion: SCHEMA_VERSION });
  if (inTauri) {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(await join(dir, FILE_NAME), json);
  } else {
    window.localStorage.setItem(LOCAL_KEY, json);
  }
}

/** Reads back the last autosaved document, if any, as raw parsed JSON — either the
 * current `PersistedDoc` shape or a pre-roadmap-#16 bare `DocSnapshot`; the caller
 * (`migrateToDocFile` in `StudioContext.tsx`) tells those apart and migrates.
 * Never throws: a missing/corrupt/unrecognized save just means "start from the
 * default document", same as a first run. */
export async function loadDoc(): Promise<unknown | null> {
  try {
    let json: string | null;
    if (inTauri) {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const filePath = await join(await appDataDir(), FILE_NAME);
      json = (await exists(filePath)) ? await readTextFile(filePath) : null;
    } else {
      json = window.localStorage.getItem(LOCAL_KEY);
    }
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
  } catch {
    return null;
  }
}
