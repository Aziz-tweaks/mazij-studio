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

/** تجميعٌ عرضيٌّ بالمنصّة، بالمعرّفات — نفسُ عقد `START_FORMATS` أعلاه بالحرف:
 * بنيةٌ مستقلّةٌ تمامًا عن ترتيب/فهرسة `SIZES` (لا تُعيد ترتيبها ولا تُرقّمها)،
 * فلا تَمسّ ثباتَ الفهرس الذي يعتمد عليه `state.sizeIdx` المحفوظ. كلُّ معرّفٍ من
 * `SIZES` يظهر في مجموعةٍ واحدة بالضبط؛ القارئ الذي يحتاج طبيعة الحجم (صورة/فيديو)
 * لكلّ عضوٍ يقرؤها من `SIZES` نفسها (`kind`) عبر `MEDIUM_CHIP` — هذا الجدول لا
 * يحمل طبيعةً موازية، فلا يمكن أن يختلف عنها. */
export interface PlatformGroup {
  id: string;
  ar: string;
  en: string;
  sizeIds: string[];
}

export const PLATFORM_GROUPS: PlatformGroup[] = [
  { id: 'instagram', ar: 'إنستقرام', en: 'Instagram', sizeIds: ['ig', 'ig-story', 'ig-reel', 'ig-portrait'] },
  { id: 'tiktok', ar: 'تيك توك', en: 'TikTok', sizeIds: ['tt'] },
  { id: 'x', ar: 'إكس (تويتر)', en: 'X (Twitter)', sizeIds: ['x'] },
  { id: 'linkedin', ar: 'لينكدإن', en: 'LinkedIn', sizeIds: ['li'] },
  { id: 'youtube', ar: 'يوتيوب', en: 'YouTube', sizeIds: ['yt-short', 'yt-video', 'yt-thumb'] },
  { id: 'snapchat', ar: 'سناب شات', en: 'Snapchat', sizeIds: ['snap'] },
  { id: 'whatsapp', ar: 'واتساب', en: 'WhatsApp', sizeIds: ['wa-status'] },
  { id: 'print', ar: 'الطباعة', en: 'Print', sizeIds: ['a4'] },
];

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

/** **ما يعرضه كلُّ مستندٍ من أسطح الحركة — «المستند يقرّر الشاشة».**
 *
 * القاعدة ٣ في التصوّر المعتمد (٢٤ أكتوبر ٢٠٢٦): بوست ← لوحة، ريل ← خطٌّ زمنيّ. ومعها
 * صار للحركة أسطحٌ صغيرةٌ أخرى تتبع الطبيعة: رفُّ الطبقات تحت المفتش (للساكن — في
 * المُوقَّت الطبقاتُ مساراتُ الخطّ)، وأقسامُ الحركة في المفتش (حركة الدخول، التتابع،
 * مفاتيح الخصائص). وهي **قراءةٌ للجواب لا تفرّعٌ جديدٌ في السلوك**، فتُكتب جدولًا كـ
 * `MEDIUM_CHIP` أعلاه، لا شروطًا مبعثرة يحرسها A8: طبيعةٌ ثالثةٌ تصير خطأَ ترجمةٍ هنا. */
export const MEDIUM_SURFACES: Record<SizeMedium, { layersDock: boolean; motionProps: boolean; canvaTextGrip: boolean }> = {
  // `canvaTextGrip`: في الوضع البسيط يُمسَك النصّ كما في الأداة الشائعة (بلا مقابض فوق/تحت، والزاوية
  // تكبّر الخطّ). قالها المالك «في الصور» — فهي للساكن؛ والمُوقَّت على مسكه كما كان.
  still: { layersDock: true, motionProps: false, canvaTextGrip: true },
  timed: { layersDock: false, motionProps: true, canvaTextGrip: false },
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
export const FPS_OPTIONS: Record<'mp4' | 'gif' | 'mov' | 'webm', number[]> = {
  mp4: [24, 25, 30, 50, 60],
  mov: [24, 25, 30, 50, 60],
  webm: [24, 25, 30, 50, 60],
  gif: [10, 15, 24],
};
export const DEFAULT_FPS: Record<'mp4' | 'gif' | 'mov' | 'webm', number> = { mp4: 30, mov: 30, webm: 30, gif: 15 };

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
  // الثلاثة الآتية أُضيفت ٢٢ أكتوبر ٢٠٢٦ مع عشرة قوالب جديدة (`src/lib/starterTemplates.ts`):
  // كانت اللوحاتُ السبعُ أعلاه موزَّعةً كلُّها على القوالب الستّة القديمة، ولا تكفي
  // عشرةً تختلف فيما بينها لونًا كما تختلف بنيةً. مُذيَّلةٌ هنا لا مُدرجةٌ وسط
  // المصفوف — نفس القاعدة التي تحكم `SIZES`: فهرسُ اللوحة محفوظٌ داخل كل مستند.
  { bg: '#3D1220', fg: '#F7EFE5', ac: '#C9A44C' },
  { bg: '#F5E6D3', fg: '#2B1B12', ac: '#B3542E' },
  { bg: '#E9EFF5', fg: '#1B2A4A', ac: '#3867D6' },
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
  // التحديد المباشر (A في أداة المتّجهات): السهمُ نفسُه ومربّعُ نقطةٍ عند ذيله — يحدّد
  // النقاط لا الشكل كلَّه.
  direct: 'M5 3l10 6.5-4.8 1.3L7.8 15.5zM13.5 13.5h3.5v3.5h-3.5z',
  // اليد (H): تحريكُ المنظر لا العناصر.
  hand: 'M7 10.5V5.2a1.2 1.2 0 0 1 2.4 0V9.5M9.4 9V4.2a1.2 1.2 0 0 1 2.4 0V9.5M11.8 9.5V5.4a1.2 1.2 0 0 1 2.4 0v5.8c0 3.3-2.3 5.8-5.4 5.8-2.1 0-3.5-1-4.5-2.7L2.9 11.6a1.25 1.25 0 0 1 2.1-1.3L7 12.6',
  templates: 'M3 3h6v8H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 13h6v4H3z',
  upload: 'M10 13V3M6 7l4-4 4 4M4 17h12',
  brand: 'M10 3l2.2 4.6 5 .7-3.6 3.5.9 5L10 14.4 5.5 16.8l.9-5L2.8 8.3l5-.7z',
  sticker: 'M4 4h8l4 4v8H4zM12 4v4h4M7.5 12.5c1.4 1.3 3.6 1.3 5 0',
  layers: 'M10 3l7 4-7 4-7-4zM3 11l7 4 7-4M3 14.5l7 4 7-4',
  keyboard: 'M2.5 5.5h15v9h-15zM5.5 8.5h.01M8.5 8.5h.01M11.5 8.5h.01M14.5 8.5h.01M6.5 11.5h7',
};

export type ToolId = 'select' | 'direct' | 'hand' | 'text' | 'shape' | 'pen' | 'image' | 'lottie' | 'video' | 'audio' | 'fx';

export interface ToolDef {
  id: ToolId;
  /** الحرف المعروض على الزرّ وفي تلميحه — وهو نفسه ما يُسلِّح الأداة. فارغٌ = بلا حرف. */
  key: string;
  /** حروفٌ أخرى تُسلِّح الأداة نفسها (R للمستطيل كما في فيغما، بجانب M أداة المتّجهات). */
  alt?: string[];
}

/** **الحروف من خرائط البرامج الثلاثة، لا من اختيارنا.**
 *
 * المالك اعتمد (٢٤ أكتوبر ٢٠٢٦) قاعدة «V A P M T تشتغل دائمًا»: المصمّم القادم
 * من أداة المتّجهات يضغط الحرف قبل أن يقرأ شيئًا، فالحرف يجب أن يعني هنا ما يعنيه هناك.
 * فـA صار التحديدَ المباشر (كان «صوت»)، وM المستطيل (كان «فيديو»)، وL الدائرة (كان
 * «لوتي»)، وH اليد. والصوت والفيديو والملصقات إدراجُ ملفّات لا أدواتُ رسم، فلا حرف
 * لها — وهي في شريط الإضافة.
 *
 * ولا «احترافي» بعد اليوم: كانت أداتا القلم والصوت تختفيان في «بسيط». المالك:
 * «العمق يُطلب ولا يُفرض» — الأداة حاضرة دائمًا، وسطحها يظهر حين تُستعمَل.
 * (و«الوضع الاحترافي» الذي عاد بعدها بطلبه شيءٌ آخر: **مسكٌ** لا بوّابة — مقابض
 * أداة المتّجهات بدل الأداة الشائعة، ولا يُخفي أداة. انظر `StudioState.pro`.) */
export const TOOLS: ToolDef[] = [
  { id: 'select', key: 'V' },
  { id: 'direct', key: 'A' },
  { id: 'pen', key: 'P' },
  { id: 'text', key: 'T' },
  { id: 'shape', key: 'M', alt: ['R'] },
  { id: 'hand', key: 'H' },
  { id: 'image', key: 'I' },
  { id: 'lottie', key: '' },
  { id: 'video', key: '' },
  { id: 'audio', key: '' },
  { id: 'fx', key: '' },
];

/** الأدوات التي تُعرَض في حبّة الأدوات العائمة أسفل اللوحة، بترتيبها. */
export const PILL_TOOLS: ToolId[] = ['select', 'direct', 'pen', 'text', 'shape', 'hand'];

/** `KeyboardEvent.code` ← معرّف الأداة، مُشتقّ من `TOOLS` نفسه.
 *
 * مُشتقّ لا مكتوب باليد عن قصد: الحرف المعروض في تلميح الزرّ (`tool.key`) وحرفُ
 * الاختصار الذي يعمل فعلًا يجب أن يكونا الشيء نفسه بحكم البناء — فإضافة أداة
 * جديدة إلى `TOOLS` تحمل اختصارها معها، ولا يبقى تلميحٌ يَعِد بما لا يُنفَّذ. */
export const TOOL_BY_CODE: Record<string, ToolId> = Object.fromEntries(
  TOOLS.flatMap((t) => [t.key, ...(t.alt ?? [])].filter(Boolean).map((k) => [`Key${k}`, t.id] as const)),
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
  direct: 'none',
  hand: 'none',
  shape: 'ready',
  // «قريبًا» تخصّ الأدوات **الصامتة فعلًا** — التي لا يظهر لها اليوم أي سطح محتوى
  // ولا أي مجموعة أدوات خاصّة بها في لوح «التصميم». والمكتبة المنتظرة لكلٍّ منها
  // واضحة ومقيسة: قوالب نصّ لـ«نص» (تبويب `Text` المستقل في محرّر فيديو شائع §2.8، وهو
  // يستحقّ تبويبًا أعلى لأنه يحمل قدرات لا يحملها غيره)، ومؤثّرات لـ«تأثيرات»،
  // ومقاطع صوتيّة لـ«صوت».
  // «نصوص» صارت مكتبةً حقيقيّة (٢٤ أكتوبر ٢٠٢٦): عنوان، عنوان فرعي، نص، وأنماط
  // عربيّة جاهزة — `TextLibrary` في `left-panel/LibraryTab.tsx`.
  text: 'ready',
  // «صوت» صار لوحًا حقيقيًّا (٢٥ أكتوبر ٢٠٢٦): استيرادُ ملفٍّ عند المؤشّر وأصواتُ
  // المشروع — `AudioLibrary` في `left-panel/AudioLibrary.tsx`.
  audio: 'ready',
  // «تأثيرات» صار لوحًا حقيقيًّا (٢٨ أكتوبر ٢٠٢٦): فلاتر ومؤثّرات وانتقالات تُضاف بضغطة —
  // `FxLibrary` في `left-panel/FxLibrary.tsx`.
  fx: 'ready',
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

/** إجراءاتٌ يمرّ بها أمرٌ لا تكفيه رُقعة حالة — هي إجراءات البرنامج نفسها، فيفعل الأمرُ
 * من لوحة البحث ما يفعله زرّه تمامًا. */
export interface CmdActions {
  setSizeIdx: (idx: number) => void;
  animateSelectionOrAll: (preset: 'fade' | 'slide' | 'pop') => void;
  togglePro: () => void;
  traceImage: () => Promise<unknown>;
}

export interface CommandDef {
  ar: string;
  en: string;
  /** الاختصار المكتوب بجانب الأمر — **ما يعمل فعلًا لا غير**. كانت هنا ⌘L و⌘T و⌘H ولا
   * مستمعَ لأيٍّ منها، و⌘H في ماك «أخفِ البرنامج» أصلًا. */
  k: string;
  icon: string;
  run: (ctx: { tlOpen: boolean }) => Record<string, unknown>;
  act?: (a: CmdActions) => void;
  /** يُعرض الأمر في اللوحة فقط حين يصحّ على المستند الحاضر. غيابه = دائمًا. */
  when?: (s: { elements: ReadonlyArray<{ type: string; src?: string | null; visible?: boolean }>; selectedIds: string[] }) => boolean;
}

export const CMDS: CommandDef[] = [
  { ar: 'إضافة نص', en: 'Add text', k: 'T', icon: 'text', run: () => ({ tool: 'text', panel: 'props' }) },
  { ar: 'تصدير…', en: 'Export…', k: '⌘E', icon: 'export', run: () => ({ exportOpen: true }) },
  { ar: 'الاختصارات', en: 'Keyboard shortcuts', k: '?', icon: 'keyboard', run: () => ({ shortcutsOpen: true }) },
  { ar: 'الوضع الاحترافي (مسك أداة المتّجهات)', en: 'Pro mode (أداة متّجهات grip)', k: '', icon: 'direct', run: () => ({}), act: (a) => a.togglePro() },
  { ar: 'فتح المكتبة', en: 'Open library', k: '', icon: 'folder', run: () => ({ panel: 'assets' }) },
  { ar: 'استدعاء مِزو', en: 'Ask Mizo', k: '⌘J', icon: 'fx', run: () => ({ panel: 'ai' }) },
  // تتبُّع الصورة المحدَّدة (أو أعلى صورةٍ ظاهرة إن لم يُحدَّد شيء) إلى مسارات — الفعلُ
  // نفسه الذي في قسم الصورة وفي قائمة الزرّ الأيمن (`traceImage`).
  {
    ar: 'تتبّع الصورة إلى متجهات',
    en: 'Trace image to vectors',
    k: '',
    icon: 'pen',
    run: () => ({}),
    act: (a) => void a.traceImage(),
    // صورةٌ ظاهرة: بعد التتبّع تُخفى الصورة، فلا يبقى الأمر معروضًا بلا ما يتتبّعه.
    when: (s) => s.elements.some((e) => e.type === 'image' && !!e.src && e.visible !== false),
  },
  // كانت رُقعةً خامًا `{ sizeIdx: 2 }` لا تشتقّ طبيعة المستند: بوستٌ ساكن يصير بمقاس تيك توك
  // ويبقى ساكنًا بلا خطٍّ زمنيّ — خلافَ اختيار «تيك توك» من منتقي المقاس.
  { ar: 'تغيير المقاس إلى تيك توك', en: 'Resize to TikTok', k: '', icon: 'resize', run: () => ({}), act: (a) => a.setSizeIdx(2) },
  // كانت تكتب `anim: 'fade'` — حقلًا قديمًا لا يقرؤه شيء منذ صارت الحركة لكلّ عنصر —
  // فلا يحدث شيء. الآن: ظهورٌ تدريجيّ للمحدَّد، أو للتصميم كلّه إن لم يُحدَّد شيء.
  { ar: 'حركة: ظهور تدريجي', en: 'Motion: Fade in', k: '', icon: 'play', run: () => ({}), act: (a) => a.animateSelectionOrAll('fade') },
  { ar: 'إظهار/إخفاء شريط الحركة', en: 'Toggle timeline', k: '', icon: 'timeline', run: (s) => ({ tlOpen: !s.tlOpen }) },
  { ar: 'الرجوع للرئيسية', en: 'Go home', k: '', icon: 'home', run: () => ({ screen: 'home' }) },
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
    ? { bg: 'var(--seg)', fg: 'var(--text)', sh: '0 1px 2px rgba(0,0,0,.18)' }
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
