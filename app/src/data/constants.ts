import type { CSSProperties } from 'react';
import type { Lang } from '../i18n/strings';

/** ثابت أم مُوقَّت: هل هذا المقاس وجهةُ صورة ساكنة أم مقطعٍ له مدة؟
 *
 * السبب في وجود هذا الحقل على *فهرس المقاسات* لا على حالة المستند: الوجهة نفسها هي
 * ما يحمل الطبيعة (ريل إنستقرام مُوقَّت دائمًا، ومصغّرة يوتيوب ساكنة دائمًا)، فلا
 * داعي لحقل منفصل في `DocSnapshot` يمكن أن يتعارض مع المقاس المختار. ومعنى ذلك أن
 * تغيير المقاس من `ArtboardSizeMenu` داخل المحرّر يقلب الطبيعة تلقائيًا — وهذه هي
 * بالضبط «قابلية التراجع» التي يعتمدها محرّر الفيديو الشائع (`re-capcut-flows.md` §1.2: المشروع
 * يبدأ `Original` ويُغيَّر لاحقًا من شريط المشغّل، لا قرارٌ نهائي عند الإنشاء). */
export type SizeMedium = 'still' | 'timed';

export interface SizePreset {
  id: string;
  ar: string;
  en: string;
  w: number;
  h: number;
  kind: SizeMedium;
}

/** فهرس المقاسات. **يُذيَّل فقط، ولا يُعاد ترتيبه أبدًا**: `state.sizeIdx` فهرسٌ
 * رقمي خام في هذا المصفوف، ويُحفَظ داخل كل `DocSnapshot` على القرص، ويُقرأ مباشرةً
 * في `AssetsTab` و`ExportDialog` و`ArtboardSizeMenu`، كما أن `CMDS` أدناه يحمل
 * `sizeIdx: 2` حرفيًا. فإدراج صفٍّ في الوسط يُفسد كل مستند محفوظ سابقًا. لذلك
 * الأربعة الأولى (0..3) باقية في مواضعها، والإضافات كلها بعدها.
 *
 * أما *ترتيب العرض* على شاشة البداية فمستقلّ تمامًا — انظر `START_FORMATS`. */
export const SIZES: SizePreset[] = [
  { id: 'ig', ar: 'بوست إنستقرام', en: 'Instagram Post', w: 1080, h: 1080, kind: 'still' },
  { id: 'x', ar: 'تغريدة X', en: 'X Post', w: 1600, h: 900, kind: 'still' },
  { id: 'tt', ar: 'تيك توك', en: 'TikTok', w: 1080, h: 1920, kind: 'timed' },
  { id: 'li', ar: 'لينكدإن', en: 'LinkedIn', w: 1200, h: 627, kind: 'still' },
  // ما بعد هذا السطر إضافاتُ ١٨ أكتوبر ٢٠٢٦: أربعة مقاسات لا تكفي مصمّم محتوى
  // اجتماعي قصير (جرد الواجهة، البند ٢). الأبعاد هي المقاسات المنشورة لكل منصّة.
  { id: 'ig-story', ar: 'ستوري إنستقرام', en: 'Instagram Story', w: 1080, h: 1920, kind: 'still' },
  { id: 'ig-reel', ar: 'ريل إنستقرام', en: 'Instagram Reel', w: 1080, h: 1920, kind: 'timed' },
  // ٤:٥ — المقاس العمودي الذي يملأ أكبر مساحة في تدفّق إنستقرام، مقابل المربّع 1:1.
  { id: 'ig-portrait', ar: 'بوست عمودي', en: 'Portrait Post', w: 1080, h: 1350, kind: 'still' },
  { id: 'yt-short', ar: 'شورت يوتيوب', en: 'YouTube Short', w: 1080, h: 1920, kind: 'timed' },
  { id: 'yt-video', ar: 'فيديو يوتيوب', en: 'YouTube Video', w: 1920, h: 1080, kind: 'timed' },
  { id: 'yt-thumb', ar: 'مصغّرة يوتيوب', en: 'YouTube Thumbnail', w: 1280, h: 720, kind: 'still' },
  { id: 'snap', ar: 'سناب شات', en: 'Snapchat', w: 1080, h: 1920, kind: 'timed' },
  { id: 'wa-status', ar: 'حالة واتساب', en: 'WhatsApp Status', w: 1080, h: 1920, kind: 'timed' },
  // A4 بدقّة ٣٠٠ نقطة/بوصة — الوجهة المطبوعة الوحيدة هنا، وهي رخيصة لأنها مجرّد
  // أبعاد بكسل: لا نزيف ولا CMYK ولا دقّة تأثيرات نقطية (خارج نطاق مزيج صراحةً،
  // `re-illustrator-flows.md` §1.6 البند ٨).
  { id: 'a4', ar: 'A4 للطباعة', en: 'A4 Print', w: 2480, h: 3508, kind: 'still' },
];

/** ترتيب العرض المُرتَّب على شاشة البداية، بالمعرّفات لا بالفهارس — مستقلّ عن ترتيب
 * `SIZES` لأن ذاك مقيَّد بثبات الفهرس (أعلاه) وهذا مقيَّد بما يحتاجه المصمّم أولًا.
 * الأداة الشائعة تحلّ مشكلة التجميع **بالترتيب لا بالتصنيف**: قائمة واحدة مسطّحة تحت عنوان
 * واحد «مقترح»، وصفوف الفيديو مُشرَّبة بين الصور كصفوفٍ عادية في المواضع ٤ و١١ و١٦
 * و١٨ (`re-canva-flows.md` §1.4 و§1.5). وهذا ما نفعله: الوجهات العمودية القصيرة —
 * وهي عمل المالك اليومي — أولًا، ثم الأفقي، ثم الطباعة. */
export const START_FORMATS: string[] = [
  'ig-story',
  'ig-reel',
  'tt',
  'ig',
  'ig-portrait',
  'yt-short',
  'snap',
  'wa-status',
  'x',
  'yt-video',
  'yt-thumb',
  'li',
  'a4',
];

/** Sentinel `sizeIdx` meaning "use the user-typed customW/customH instead of a
 * SIZES[] preset" — kept out of the SIZES array itself so every existing
 * `SIZES[state.sizeIdx]` lookup stays a simple, safe array index elsewhere; call
 * sites that need to resolve the *current* size (including custom) use `sizeAt`. */
export const CUSTOM_SIZE_IDX = -1;

/** شارةُ الطبيعة: أيقونتُها ومفتاحُ لافتتها وهل تَحمل مدّة.
 *
 * **جدولٌ لا شرط، وهذا مقصود.** عرضُ الطبيعة ليس تفرّعًا في السلوك: الأسطحُ الثلاثة
 * التي يتفرّع عليها `medium` فعلًا — وجودُ الخطّ الزمنيّ، وقائمةُ الشريط، ووجهاتُ
 * التصدير — معدودةٌ ومُقيَّدة (المعيار A8)، وبطاقةُ المقاس وشارةُ الخطّ ليستا منها:
 * هما تَقرآن الجوابَ وتطبعانه. وجدولٌ مكتوبٌ بـ`Record<SizeMedium, …>` هو الشكلُ
 * الصحيح لذلك — وهو الشكلُ نفسه الذي تَلبسه `FPS_OPTIONS` و`DEFAULT_FPS` أدناه —
 * وله خصلةٌ لا يملكها الشرط: إضافةُ طبيعةٍ ثالثةٍ تصير **خطأً في الترجمة** عند كلّ
 * قارئ، لا شرطًا منسيًّا في موضع. */
export const MEDIUM_CHIP: Record<SizeMedium, { icon: string; labelKey: 'h_still' | 'h_timed'; showsDuration: boolean }> = {
  still: { icon: 'image', labelKey: 'h_still', showsDuration: false },
  timed: { icon: 'video', labelKey: 'h_timed', showsDuration: true },
};

export function sizeAt(sizeIdx: number, customW: number, customH: number): SizePreset {
  // مقاس مخصّص لا طبيعةَ له: المستخدم كتب رقمين ولم يسمِّ وجهة. نردّه `still` لأنها
  // الحالة الأرخص (لا نفترض مدةً لم يطلبها)، وليس هذا حصرًا عليه: الخط الزمني متاح
  // دائمًا، وتبديل المقاس إلى وجهة مُوقَّتة يقلب الطبيعة في أي لحظة.
  if (sizeIdx === CUSTOM_SIZE_IDX) return { id: 'custom', ar: 'مقاس مخصص', en: 'Custom size', w: customW, h: customH, kind: 'still' };
  return SIZES[sizeIdx] ?? SIZES[0];
}

/** فهرس المقاس بمعرّفه — تحتاجه شاشة البداية لأنها تعرض بترتيب `START_FORMATS`
 * (معرّفات) لكنها تُطبّق بـ`setSizeIdx` (فهرس). */
export function sizeIdxOf(id: string): number {
  return SIZES.findIndex((z) => z.id === id);
}

/** **أهدافُ التصدير الافتراضيّة لمستند: مقاسُه هو، هدفًا واحدًا.**
 *
 * وهذه النسخةُ الثانيةُ من حرفٍ واحدٍ كُتب مرّتين. كان `{ ig: true, x: true,
 * tt: true, li: true }` مكتوبًا بالاسم في موضعَين: في `selectAllTargets` وفي
 * `initialStudioState.targets`. والأربعةُ كانت **كلَّ** `SIZES` قبل ١٨ أكتوبر
 * ٢٠٢٦ — فصحَّ الحرفُ يومَ كُتب، ثم صار بعد توسيع الفهرس إلى ثلاثةَ عشر خطأً بلا
 * سطرٍ يَتغيّر. أُصلحت نسخةُ `selectAllTargets` (زرٌّ كان يقول الكلَّ ويَعني
 * بعضه) وبقيت هذه، فظلَّ كلُّ مشروعٍ يَفتح حوارَ التصدير على أربعةٍ لا يَربطها
 * به شيء.
 *
 * وأثرُها يُقاس: من بدأ على «بوست عمودي» (١٠٨٠×١٣٥٠) ضغط «تصدير» فنزلت أربعةُ
 * ملفّات **ليس فيها ملفُّه** — ثلاثةٌ منها بنِسَبٍ مختلفةٍ تمامًا. وعلى الفيديو
 * الثمنُ مضاعَف: كلُّ هدفٍ رسمُ إطاراتِ المشروع كلِّها وترميزٌ كاملٌ مستقلّ.
 *
 * **ولِمَ هدفٌ واحدٌ لا أربعةٌ «معقولة»:** الدفعةُ سطحٌ قائمٌ بزرَّيه («تحديد
 * الكل» و«مقاس المشروع فقط») وبلاطةٍ لكلّ مقاس، فتوسيعُها نقرةٌ واحدةٌ معلنة.
 * أما العكسُ فلا سطحَ له: من لم يُرِد إلا ملفَّه يَدفع ثلاثةً لم يَرَها قبل أن
 * تَنزل. والافتراضُ يُختار بثمنِ الخطأ لا بوسطِ الاحتمالات.
 *
 * وتُنادَى من كلّ موضعٍ يَصير فيه مقاسُ المستند معلومًا قبل أن يَختار المصمّم —
 * `initialStudioState`، و`startDoc`، ومُستعيدُ الحفظ التلقائيّ — وهي ثلاثةٌ لا
 * واحد، لأن `targets` **ليست حقلًا في `DocSnapshot`**: فالعائدُ بعد إعادة
 * التحميل طريقٌ آخرُ لا تكرارٌ للأوّل، وكان يَرجع إلى الأربعة بصمتٍ لو بُذر
 * الأوّلُ وحده — وهو مَقيسٌ في `qa/export-default-target.spec.mjs` §٣. ويُشاركها
 * `selectProjectSizeTarget` تعريفًا واحدًا، فلا يَنحرف الزرُّ عن الافتراض. */
export function defaultTargetsFor(sizeIdx: number): Record<string, boolean> {
  const id = sizeIdx === CUSTOM_SIZE_IDX ? 'custom' : SIZES[sizeIdx]?.id;
  return id ? { [id]: true } : {};
}

export const dimsOf = (z: SizePreset) => `${z.w} × ${z.h}`;
export const nameOf = (z: SizePreset, lang: Lang) => (lang === 'ar' ? z.ar : z.en);

/** Sane fps choices per video export format — GIF stays low because every extra
 * frame costs real file size through the palette-per-frame encode, while MP4 (a
 * normal delta-encoded codec) has no such penalty. Used by ExportDialog's fps
 * picker and by StudioContext to snap `exportFps` to a valid value on format
 * switch. */
export const FPS_OPTIONS: Record<'mp4' | 'gif', number[]> = {
  mp4: [24, 30, 60],
  gif: [10, 15, 24],
};
export const DEFAULT_FPS: Record<'mp4' | 'gif', number> = { mp4: 30, gif: 15 };

export interface Palette {
  bg: string;
  fg: string;
  ac: string;
  /** Optional secondary accent — only the last, 4-color palette sets this, so its full
   * identity (not just the 3 bg/fg/ac roles) is reachable from color pickers. */
  ac2?: string;
}

export const PALETTES: Palette[] = [
  { bg: '#1E2A3A', fg: '#FFFFFF', ac: '#F4D35E' },
  { bg: '#F3E9D2', fg: '#1B1B1B', ac: '#E07A5F' },
  { bg: '#0F3D3E', fg: '#F1FAEE', ac: '#FFB703' },
  { bg: '#FFFFFF', fg: '#111111', ac: '#0EA5E9' },
  { bg: '#2D1B4E', fg: '#FFFFFF', ac: '#F72585' },
  { bg: '#111111', fg: '#FFFFFF', ac: '#C8F135' },
  // Emerald & gold: deep green background, cream text, gold accent, and a lighter
  // green as a reachable secondary accent (ac2) in color pickers — the only 4-color
  // palette here; see docs/CONTROLS.md. Its index is load-bearing: `paletteIdx`
  // is stored in saved documents and asserted by specs, so entries are appended,
  // never reordered or removed.
  { bg: '#08402F', fg: '#F4F1E9', ac: '#D9B85F', ac2: '#0FA06B' },
];

/** Roadmap #20: fixed local port the Rust-side MCP server listens on (see
 * `src-tauri/src/mcp.rs`). Must match the `MCP_PORT` constant there — kept as one
 * literal on each side rather than a build-time handshake since it never changes
 * at runtime. 127.0.0.1-only, never exposed on the network. */
export const MCP_BRIDGE_PORT = 7420;

export const ICONS: Record<string, string> = {
  select: 'M6 3l11 7-5.5 1.5L9 17z',
  text: 'M4 6V4h12v2M10 4v12M7 16h6',
  shape: 'M3 3h7v7H3zM14 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  pen: 'M10 3l4.5 7L10 17l-4.5-7zM10 10h.01',
  image: 'M3 4h14v12H3zM3 13l4-4 4 4 3-3 3 3',
  lottie: 'M4 4h12v12H4zM8 7l5 3-5 3z',
  video: 'M3 5h10v10H3zM13 9l4-2v6l-4-2z',
  audio: 'M3 9v2M6 6v8M9 3v14M12 6v8M15 8v4',
  fx: 'M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6zM16 14l.6 1.4 1.4.6-1.4.6L16 18l-.6-1.4-1.4-.6 1.4-.6z',
  export: 'M10 3v10M6 9l4 4 4-4M4 16h12',
  sliders: 'M3 6h14M3 10h14M3 14h14M7 4.5v3M13 8.5v3M9 12.5v3',
  folder: 'M3 5h5l2 2h7v9H3z',
  resize: 'M3 3h7v7H3zM10 10h7v7h-7z',
  play: 'M6 4l10 6-10 6z',
  pause: 'M6 4v12M14 4v12',
  timeline: 'M3 5h14M3 10h9M3 15h12',
  home: 'M3 10l7-6 7 6v7h-4v-5H7v5H3z',
};

export type ToolId = 'select' | 'text' | 'shape' | 'pen' | 'image' | 'lottie' | 'video' | 'audio' | 'fx';

export interface ToolDef {
  id: ToolId;
  key: string;
  pro?: boolean;
}

export const TOOLS: ToolDef[] = [
  { id: 'select', key: 'V' },
  { id: 'text', key: 'T' },
  { id: 'shape', key: 'R' },
  { id: 'pen', key: 'P', pro: true },
  { id: 'image', key: 'I' },
  { id: 'lottie', key: 'L' },
  { id: 'video', key: 'M' },
  { id: 'audio', key: 'A', pro: true },
  { id: 'fx', key: 'E' },
];

/** `KeyboardEvent.code` ← معرّف الأداة، مُشتقّ من `TOOLS` نفسه.
 *
 * مُشتقّ لا مكتوب باليد عن قصد: الحرف المعروض في تلميح الزرّ (`tool.key`) وحرفُ
 * الاختصار الذي يعمل فعلًا يجب أن يكونا الشيء نفسه بحكم البناء — فإضافة أداة
 * جديدة إلى `TOOLS` تحمل اختصارها معها، ولا يبقى تلميحٌ يَعِد بما لا يُنفَّذ. */
export const TOOL_BY_CODE: Record<string, ToolId> = Object.fromEntries(
  TOOLS.map((t) => [`Key${t.key}`, t.id]),
);

/** حالة لوح المحتوى الذي يفتحه كل زرّ في شريط الأدوات.
 *
 * **هذا هو المَفصِل، وهو أعمّ من الأشكال.** أقوى ما في تحليل محرّر فيديو شائع ليس مكتبة
 * الأشكال بل القاعدة البنيويّة فوقها: لـمحرّر فيديو شائع أحد عشر تبويبًا، و**كلٌّ منها يبدّل
 * لوح المكتبة بالكامل**، فلا يوجد تبويب يمكن ضغطه فـ«لا يحدث شيء»
 * (`re-capcut-flows.md` §2.1، §5.1). ومزيج اليوم عكسه تمامًا: `ToolRail.tsx` ينادي
 * `actions.setTool()` ولا شيء غيرها، فكل أداة في الشريط — لا الأشكال وحدها — تغيّر
 * حالة داخليّة بلا أثر مرئي. هذا هو الجذر الحقيقي لشكوى المالك.
 *
 * فالعلاج قاعدة واحدة تُطبَّق على الجدول كلّه: **كل أداة تُفتح لوحًا**. ومن لم
 * يُبنَ لوحها بعد يفتح لوحًا يسمّي الأداة ويعلن «قريبًا» — فالصمت ليس خيارًا
 * مطروحًا، والقاعدة في هذا المشروع أن المعطَّل يُعرَض معطَّلًا لا يُخفى.
 *
 * - `'ready'` — مكتبة حقيقيّة مبنيّة.
 * - `'soon'` — لوح يسمّي الأداة ويشرح ما سيأتي، بوسم «قريبًا» ظاهر.
 * - `'none'` — الأداة ليست مكتبةً بطبيعتها: «تحديد» لا تعرض محتوى، فاختيارها يُعيد
 *   اللوح إلى «التصميم» (خصائص ما هو محدَّد) وهو السلوك الصحيح لا غياب سلوك.
 *
 * لإضافة لوح جديد لاحقًا: بدِّل `'soon'` إلى `'ready'` هنا، وأضف فرعًا واحدًا في
 * `LibraryTab.tsx`. لا نظام ألواح ثانٍ. */
export type ToolLibraryStatus = 'ready' | 'soon' | 'none';

export const TOOL_LIBRARY: Record<ToolId, ToolLibraryStatus> = {
  select: 'none',
  shape: 'ready',
  // «قريبًا» تخصّ الأدوات **الصامتة فعلًا** — التي لا يظهر لها اليوم أي سطح محتوى
  // ولا أي مجموعة أدوات خاصّة بها في لوح «التصميم». والمكتبة المنتظرة لكلٍّ منها
  // واضحة ومقيسة: قوالب نصّ لـ«نص» (تبويب `Text` المستقل في محرّر فيديو شائع §2.8، وهو
  // يستحقّ تبويبًا أعلى لأنه يحمل قدرات لا يحملها غيره)، ومؤثّرات لـ«تأثيرات»،
  // ومقاطع صوتيّة لـ«صوت».
  text: 'soon',
  audio: 'soon',
  fx: 'soon',
  // أمّا هذه فليست صامتة، فلا تأخذ لوحًا يحجب ما تعرضه فعلًا:
  //
  // - **قلم**: أدواته الحقيقيّة تعيش في لوح «التصميم» ومشروطة بالأداة نفسها
  //   (`const isPen = state.tool === 'pen'` في `PropsTab.tsx`) — مفتاح «أغلق
  //   المسار» وضبط النعومة. إبدال اللوح بـ«قريبًا» كان **يخفي أدوات مبنيّة
  //   وعاملة**، وهو تراجع لا إصلاح.
  // - **صورة / لوتي / فيديو**: نقرها يفتح منتقي ملفّات فورًا، وهو أوضح أثر مرئي
  //   يمكن لزرٍّ أن يُحدثه. مكتبة «تحميلات» على نمط الأداة الشائعة هي الخطوة التالية
  //   الصحيحة لها، لكنها إضافة لا إصلاح لصمت.
  //
  // القاعدة إذن: «قريبًا» علاجٌ للصمت، لا بديلٌ عن سطح قائم.
  pen: 'none',
  image: 'none',
  lottie: 'none',
  video: 'none',
};

export type LayerId = 'bg' | 'img' | 'head' | 'badge' | 'logo';

export interface LayerDef {
  id: LayerId;
  color: string;
  l: number;
  w: number;
  kfs: number[];
}

export const LAYERS: LayerDef[] = [
  { id: 'bg', color: '#8B9BB4', l: 0, w: 100, kfs: [] },
  { id: 'img', color: '#6FB7A8', l: 10, w: 90, kfs: [0.5, 1.1] },
  { id: 'head', color: '#E0A458', l: 6, w: 94, kfs: [0.3, 0.9] },
  { id: 'badge', color: '#D97A6C', l: 24, w: 76, kfs: [1.2, 1.7] },
  { id: 'logo', color: '#9B8CE8', l: 30, w: 70, kfs: [1.5, 1.9] },
];

export interface CommandDef {
  ar: string;
  en: string;
  k: string;
  icon: string;
  run: (ctx: { mode: 'simple' | 'pro'; tlOpen: boolean }) => Record<string, unknown>;
}

export const CMDS: CommandDef[] = [
  { ar: 'إضافة نص', en: 'Add text', k: 'T', icon: 'text', run: () => ({ tool: 'text', panel: 'props' }) },
  { ar: 'تصدير…', en: 'Export…', k: '⌘E', icon: 'export', run: () => ({ exportOpen: true }) },
  { ar: 'تبديل الوضع الاحترافي', en: 'Toggle Pro mode', k: '⌘.', icon: 'sliders', run: (s) => ({ mode: s.mode === 'pro' ? 'simple' : 'pro' }) },
  { ar: 'فتح المكتبة', en: 'Open library', k: '⌘L', icon: 'folder', run: () => ({ panel: 'assets' }) },
  { ar: 'استدعاء مِزو', en: 'Ask Mizo', k: '⌘J', icon: 'fx', run: () => ({ panel: 'ai' }) },
  { ar: 'تغيير المقاس إلى تيك توك', en: 'Resize to TikTok', k: '', icon: 'resize', run: () => ({ sizeIdx: 2 }) },
  { ar: 'حركة: ظهور تدريجي', en: 'Motion: Fade in', k: '', icon: 'play', run: () => ({ anim: 'fade', tlOpen: true }) },
  { ar: 'إظهار/إخفاء شريط الحركة', en: 'Toggle timeline', k: '⌘T', icon: 'timeline', run: (s) => ({ tlOpen: !s.tlOpen }) },
  { ar: 'الرجوع للرئيسية', en: 'Go home', k: '⌘H', icon: 'home', run: () => ({ screen: 'home' }) },
];

export interface FileAsset {
  name: string;
  bg: string;
  d: string;
}

export const FILES: FileAsset[] = [
  { name: 'product-01.png', bg: '#6B7A8F', d: ICONS.image },
  { name: 'hero.mp4', bg: '#4C6B5E', d: ICONS.video },
  { name: 'logo.svg', bg: '#7A6B9A', d: ICONS.shape },
  { name: 'bg-texture.jpg', bg: '#9A7B5B', d: ICONS.image },
  { name: 'music.mp3', bg: '#5B6F9A', d: ICONS.audio },
  { name: 'model.png', bg: '#8F6B6B', d: ICONS.image },
];

export const BRAND = ['#1E2A3A', '#F4D35E', '#E07A5F', '#0F3D3E', '#F72585', '#C8F135'];

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

export interface Segmented {
  bg: string;
  fg: string;
  sh: string;
}

export const seg = (on: boolean): Segmented =>
  on
    ? { bg: 'var(--surface)', fg: 'var(--text)', sh: '0 1px 2px rgba(0,0,0,.10)' }
    : { bg: 'transparent', fg: 'var(--muted)', sh: 'none' };

export const glyphStyle = (z: { w: number; h: number }, m: number): CSSProperties => {
  const r = z.w / z.h;
  const w = r >= 1 ? m : m * r;
  const h = r >= 1 ? m / r : m;
  return {
    width: w.toFixed(1) + 'px',
    height: h.toFixed(1) + 'px',
    border: '1.5px solid currentColor',
    borderRadius: '3px',
    display: 'block',
  };
};
