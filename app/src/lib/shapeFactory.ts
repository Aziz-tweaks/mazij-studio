import type { ShapeKind } from '../state/elements';
import type { AppearanceStack } from '../state/elements';
import { newFillLayer, newStrokeLayer } from './appearance';
import type { ShapeDrawKind } from '../state/types';

/** نقطة بكسور صندوق العنصر نفسه — نفس إطار `ShapeElement.points`. */
export interface Pt {
  x: number;
  y: number;
}

export interface PxBoxLite {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** الرماديّ المحيَّد الذي تضعه الأداة الشائعة على كل شكل جديد — مقيس من شريحة اللون في شريط
 * الخصائص (`re-canva-flows.md` §2.4). ليس أسود، ولا لون الهوية، ولا شفّاف: شكل بهذا
 * الرمادي يُقرأ فورًا كـ«عنصر بديل ينتظر قرارًا»، وهو نصف الفائدة من الرقم.
 *
 * ولهذا لا يأخذ الشكل المضاف من المكتبة `fillToken: 'ac'` (سلوك `addShapeElement`
 * القديم): لون الهوية يجعل الشكل يبدو **منتهيًا**، فلا يلاحظ المصمم أنه لم يختر له
 * لونًا بعد. */
export const PLACEHOLDER_FILL = '#919191';

/** نسبة عرض الشكل المضاف بنقرة إلى عرض الصفحة.
 *
 * مقيس على الأداة الشائعة: نقرة على بطاقة شكل في صفحة 1080×1350 تضع شكلًا **324×324** عند
 * (378, 513) — و‏`324 = 1080 × 0.30` بالضبط، و‏`(1080−324)/2 = 378`،
 * و‏`(1350−324)/2 = 513` (`re-canva-flows.md` §2.4). القاعدة إذن **نسبة من عرض
 * الصفحة**، لا عدد بكسلات ثابت، ولهذا تبدو صحيحة على منشور 1080×1350 وعلى ريل
 * 1080×1920 بالقاعدة نفسها.
 *
 * ويؤكّدها قياس مستقلّ: محرّر فيديو شائع يضع العنصر المضاف بـ**320×320** على لوحة عرضها 1080
 * (`re-capcut-flows.md` §2.6) — أي `320/1080 = 0.296`. برنامجان مختلفان تمامًا في
 * المنطق، وكلاهما يهبط على ≈30% من عرض الصفحة؛ فالنسبة هي الثابت لا الرقم. */
export const CLICK_PLACE_WIDTH_FRACTION = 0.3;

/** نسبة نصف القطر الداخلي إلى الخارجي في النجمة — `1/φ² ≈ 0.382`، نسبة النجمة
 * الخماسيّة (pentagram) الكلاسيكيّة. أي قيمة أعلى تُنتج نجمة منتفخة، وأي قيمة أدنى
 * تُنتج أشواكًا رقيقة؛ الأداة الشائعة تُفرد للمنتفخة بطاقة مستقلّة
 * («8-Pointed Star Inflated»، `re-canva-flows.md` §2.2) وهو ما يؤكّد أن الافتراضي
 * عندها هو النسبة الكلاسيكيّة لا المنتفخة. */
const STAR_INNER_RATIO = 0.382;

/** حدّا عدد الأضلاع/الرؤوس أثناء السحب (مفتاحا ↑/↓).
 *
 * أداة المتّجهات يطابق **مدى الإدخال بدقّته**: مُعيِّن على اللوحة 3–11، شريط تمرير 3–20،
 * وقيمة مكتوبة 3–1000 (`re-illustrator-flows.md` §2.5). مفاتيح الأسهم أثناء السحب
 * هي أقل أدوات الإدخال دقّةً (نقرة واحدة = ضلع واحد)، فتأخذ المدى الأضيق. */
export const MIN_SHAPE_N = 3;
export const MAX_SHAPE_N = 24;

/** عدد الأضلاع الافتراضي للمضلّع — أداة المتّجهات يفتح على مسدّس، والأداة الشائعة تبدأ قسم
 * «مضلعات» بـ Pentagon ثم Hexagon. */
export const DEFAULT_POLYGON_N = 6;
/** عدد الرؤوس الافتراضي للنجمة — نجمة أداة المتّجهات الافتراضيّة خماسيّة، وهي أوّل ما
 * يتوقّعه أحد من كلمة «نجمة». */
export const DEFAULT_STAR_N = 5;

/** مضلّع منتظم محصور في مربّع الوحدة، أوّل رأس في منتصف الحافّة العليا.
 * محصور في **الدائرة** المرسومة داخل الصندوق، فالرؤوس تلامس حوافّ الصندوق — وهو ما
 * يجعل الشكل يملأ صندوقه كما تفعل بطاقات الأداة الشائعة المسطّحة. */
export function regularPolygonPoints(n: number): Pt[] {
  const sides = Math.max(MIN_SHAPE_N, Math.round(n));
  const pts: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push({ x: 0.5 + 0.5 * Math.cos(a), y: 0.5 + 0.5 * Math.sin(a) });
  }
  return pts;
}

/** نجمة بـ`n` رؤوس: رأس خارجي ثم رأس داخلي بالتناوب، أوّل رأس خارجي للأعلى. */
export function starPoints(n: number): Pt[] {
  const tips = Math.max(MIN_SHAPE_N, Math.round(n));
  const pts: Pt[] = [];
  for (let i = 0; i < tips * 2; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.5 * STAR_INNER_RATIO;
    const a = -Math.PI / 2 + (i * Math.PI) / tips;
    pts.push({ x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) });
  }
  return pts;
}

/** سهم يشير إلى اليمين داخل صندوقه: ساق بسُمك 0.36 من ارتفاع الصندوق، ورأس يبلغ
 * عرضه الكامل. يُخزَّن مضلّعًا **مغلقًا** لا خطًّا بسهم طرفيّ، لأن المضلّع المغلق
 * يُعبَّأ ويُصدَّر صحيحًا في المسارات الثلاثة (DOM/canvas/SVG) بلا أي كود خاص —
 * بينما رأس سهم على طرف خطّ كان سيحتاج علامة `marker` لا يفهمها رسّام الـcanvas.
 *
 * الاتجاه ثابت إلى اليمين ولا يُعكس في RTL: السهم هنا **شكل هندسي** يدوّره المصمم
 * كما يريد، لا أيقونة واجهة تتبع اتجاه القراءة. والأداة الشائعة نفسها تُفرد بطاقة لكل اتجاه
 * (Arrow Right/Left/Up/Down، `re-canva-flows.md` §2.2) بدل عكس بطاقة واحدة. */
export function arrowPoints(): Pt[] {
  return [
    { x: 0, y: 0.32 },
    { x: 0.58, y: 0.32 },
    { x: 0.58, y: 0.08 },
    { x: 1, y: 0.5 },
    { x: 0.58, y: 0.92 },
    { x: 0.58, y: 0.68 },
    { x: 0, y: 0.68 },
  ];
}

/** نصف قطر زوايا «المستطيل المدوَّر» ككسر من `min(w,h)` — نفس القيمة التي كان
 * `addShapeElement` يمنحها لكل مستطيل (0.08). الفرق أن المستطيل العادي صار يأخذ 0
 * كما يجب: الأداة الشائعة تُفرد بطاقتين منفصلتين، Square و Rounded Square
 * (`re-canva-flows.md` §2.2)، فمن يختار «مستطيل» يريد زوايا حادّة. */
export const ROUND_RECT_RADIUS = 0.08;

/** سُمك الخطّ المضاف من المكتبة ككسر من عرض الصفحة.
 *
 * **غير مقيس** — لا الوثيقتان تذكران وزن خطّ الأداة الشائعة. اختير 0.0074 (≈8 بكسل على صفحة
 * 1080) ليقرأ الخطُّ بثقل بصري قريب من مساحة بقيّة الصِّيَغ المعبَّأة بالحجم
 * نفسه، وليتناسب مع الصفحة كما يتناسب كل شيء آخر هنا بدل أن يصير شعرة على لوحة
 * كبيرة ومسطرة على لوحة صغيرة. */
export const LINE_WIDTH_FRACTION = 0.0074;

/** ما يحمله كل كِيان في المكتبة: نوعه، وعدد أضلاعه/رؤوسه إن كان مضلّعًا أو نجمة. */
export interface ShapeRecipe {
  kind: ShapeDrawKind;
  /** عدد الأضلاع (مضلّع) أو الرؤوس (نجمة). يُهمَل لبقيّة الأنواع. */
  n?: number;
}

/** هل هذا النوع **مركزيّ الأصل** بطبيعته؟
 *
 * المضلّع والنجمة يُرسمان من المركز إلى الخارج في أداة المتّجهات، ولهذا **يستثنيهما
 * المزوّد الكبير صراحةً** من مُعدِّل «ارسم من المركز» (Option/Alt): المُعدِّل بلا معنى على
 * شكل أصله المركز أصلًا (`re-illustrator-flows.md` §2.4). فننفّذ السبب لا العَرَض:
 * هذان النوعان مركزيّان دائمًا، فيصير Option بلا أثر عليهما طبيعيًّا. */
export function isCenterOrigin(kind: ShapeDrawKind): boolean {
  return kind === 'polygon' || kind === 'star';
}

/** هل الشكل مغلق (يُعبَّأ) أم مفتوح (يُرسَم بخطّ فقط)؟ */
export function isClosedKind(kind: ShapeDrawKind): boolean {
  return kind !== 'line';
}

/** يحوّل كِيان مكتبة إلى نوع المستند + نقاطه.
 *
 * القرار المعماري المهم هنا: الأنواع الثمانية **لا تضيف نوعًا ثالثًا إلى
 * `ShapeKind`**. المستطيل والمستطيل المدوَّر يصيران `'rect'` بنصف قطر مختلف،
 * والدائرة `'ellipse'`، وكل ما بقي `'path'` بنقاط مولَّدة. والمكسب أن الرسّامات
 * الثلاث (`ElementView` للمعاينة الحيّة، `drawElements` للـPNG/الفيديو،
 * `renderArtboardSvg` للـSVG) تعرف `'path'` منذ خريطة الطريق #11 عبر
 * `pathElementCommands` — فكل شكل جديد يُصيَّر ويُصدَّر ويُتراجَع عنه **بلا سطر
 * واحد** في أي من الثلاث. */
export function shapeGeometryFor(recipe: ShapeRecipe, lineVector?: { flipX: boolean; flipY: boolean }): {
  shape: ShapeKind;
  radius: number;
  points?: Pt[];
  closed?: boolean;
} {
  switch (recipe.kind) {
    case 'rect':
      return { shape: 'rect', radius: 0 };
    case 'roundRect':
      return { shape: 'rect', radius: ROUND_RECT_RADIUS };
    case 'ellipse':
      return { shape: 'ellipse', radius: 0 };
    case 'triangle':
      return { shape: 'path', radius: 0, points: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], closed: true };
    case 'polygon':
      return { shape: 'path', radius: 0, points: regularPolygonPoints(recipe.n ?? DEFAULT_POLYGON_N), closed: true };
    case 'star':
      return { shape: 'path', radius: 0, points: starPoints(recipe.n ?? DEFAULT_STAR_N), closed: true };
    case 'arrow':
      return { shape: 'path', radius: 0, points: arrowPoints(), closed: true };
    case 'line': {
      // الخطّ هو النوع الوحيد الذي لا يكفيه صندوقه: صندوق واحد يحمل قُطرين، فلا بدّ
      // من تخزين أيّهما. `flipX/flipY` تأتي من اتجاه السحب الفعلي؛ ومن دونها كان كل
      // خطّ يُرسم من أعلى اليسار إلى أسفل اليمين أيًّا كان اتجاه يد المصمم.
      const sx = lineVector?.flipX ? 1 : 0;
      const sy = lineVector?.flipY ? 1 : 0;
      return { shape: 'path', radius: 0, points: [{ x: sx, y: sy }, { x: 1 - sx, y: 1 - sy }], closed: false };
    }
  }
}

/** طبقات المظهر التي يولد بها شكل المكتبة.
 *
 * تُبنى صريحةً بدل تركها لـ`migrateAppearance` لسببين مقيسين:
 *
 * 1. `migrateAppearance` تمنح **كل** شكل من نوع `'path'` طبقة حدٍّ إلزاميّة بسُمك
 *    `strokeWidth || 2` (`src/lib/appearance.ts`) — لأن مسار القلم اليدوي كان دائمًا
 *    يُرسم بحدّ. لكن الأداة الشائعة تقيس على الشكل الجديد **حدًّا معدومًا**
 *    (`re-canva-flows.md` §2.4)، فمثلّث أو نجمة بحدٍّ أسود 2px ليس ما طُلب. وجود
 *    طبقة واحدة حقيقيّة هنا يجعل `hasAnyLayer` صادقة فتُتخطّى الترحيلة كلّها.
 * 2. وهي الطريقة الوحيدة للتعبير عن «معبَّأ بلا حدّ» (المغلق) مقابل «حدّ بلا تعبئة»
 *    (الخطّ) في نموذج واحد.
 */
export function libraryAppearance(recipe: ShapeRecipe, pageW: number): AppearanceStack {
  if (!isClosedKind(recipe.kind)) {
    return {
      fills: [],
      strokes: [newStrokeLayer({ color: PLACEHOLDER_FILL, colorToken: null, width: Math.max(2, Math.round(pageW * LINE_WIDTH_FRACTION)), position: 'center' })],
      shadows: [],
    };
  }
  return { fills: [newFillLayer({ color: PLACEHOLDER_FILL, colorToken: null })], strokes: [], shadows: [] };
}

/** الصندوق الذي تهبط فيه نقرةٌ على بطاقة مكتبة: **مربّع بـ30% من عرض الصفحة،
 * في منتصفها تمامًا**.
 *
 * مربّع بالبكسل (لا بالكسور) عن قصد: `w` و`h` يُخزَّنان ككسور من **محورين
 * مختلفين**، فشكل «مربّع» على صفحة 1080×1920 هو `w=0.30, h=0.169`. حساب الضلع
 * بالبكسل ثم تحويله هو ما يجعل القاعدة واحدة على كل مقاس. */
export function clickPlacementBox(size: { w: number; h: number }): PxBoxLite {
  const side = size.w * CLICK_PLACE_WIDTH_FRACTION;
  return { x: (size.w - side) / 2, y: (size.h - side) / 2, w: side, h: side };
}

/** أقسام لوح الأشكال وبطاقاتها.
 *
 * الترتيب والتسميات من الأداة الشائعة (`re-canva-flows.md` §2.2): سبعة أقسام مسمّاة،
 * و**الخطوط والأسهم داخل الأشكال** لا في أداة منفصلة — «الخطّ شكل تختاره، لا أداة
 * ترسم بها». دُمج قسمَا الأداة الشائعة «خطوط» (الأول) و«الأسهم» (الخامس) في قسم واحد هنا:
 * ببطاقتين لكل منهما وبشبكة من أربعة أعمدة، قسمان منفصلان كانا سيُهدران صفّين
 * ليعرضا بطاقتين.
 *
 * `status: 'soon'` = مرئي ومعطَّل بوسم «قريبًا». قسمَا الأداة الشائعة السادس والسابع
 * (أشكال خريطة التدفّق، فقاعات الكلام) يظهران كذلك: القاعدة في هذا المشروع أن ما
 * لم يُبنَ يُعرَض معطَّلًا صريحًا، ولا يُعرَض أبدًا قابلًا للنقر وميّتًا. */
export interface LibraryTile {
  id: string;
  recipe: ShapeRecipe;
  /** مفتاح التسمية في `strings.ts`. */
  labelKey: string;
  status: 'ready' | 'soon';
}

export interface LibrarySection {
  /** مفتاح عنوان القسم في `strings.ts`. */
  titleKey: string;
  tiles: LibraryTile[];
}

export const SHAPE_SECTIONS: LibrarySection[] = [
  {
    titleKey: 'shp_sec_basic',
    tiles: [
      { id: 'rect', recipe: { kind: 'rect' }, labelKey: 'shape_rect', status: 'ready' },
      { id: 'roundRect', recipe: { kind: 'roundRect' }, labelKey: 'shape_roundRect', status: 'ready' },
      { id: 'ellipse', recipe: { kind: 'ellipse' }, labelKey: 'shape_ellipse', status: 'ready' },
      { id: 'triangle', recipe: { kind: 'triangle' }, labelKey: 'shape_triangle', status: 'ready' },
    ],
  },
  {
    titleKey: 'shp_sec_polygons',
    tiles: [
      { id: 'pentagon', recipe: { kind: 'polygon', n: 5 }, labelKey: 'shape_pentagon', status: 'ready' },
      { id: 'hexagon', recipe: { kind: 'polygon', n: 6 }, labelKey: 'shape_hexagon', status: 'ready' },
      { id: 'octagon', recipe: { kind: 'polygon', n: 8 }, labelKey: 'shape_octagon', status: 'ready' },
    ],
  },
  {
    titleKey: 'shp_sec_stars',
    tiles: [
      { id: 'star5', recipe: { kind: 'star', n: 5 }, labelKey: 'shape_star5', status: 'ready' },
      { id: 'star6', recipe: { kind: 'star', n: 6 }, labelKey: 'shape_star6', status: 'ready' },
      { id: 'star8', recipe: { kind: 'star', n: 8 }, labelKey: 'shape_star8', status: 'ready' },
    ],
  },
  {
    titleKey: 'shp_sec_lines',
    tiles: [
      { id: 'line', recipe: { kind: 'line' }, labelKey: 'shape_line', status: 'ready' },
      { id: 'arrow', recipe: { kind: 'arrow' }, labelKey: 'shape_arrow', status: 'ready' },
    ],
  },
  {
    titleKey: 'shp_sec_flowchart',
    tiles: [
      { id: 'soon-diamond', recipe: { kind: 'polygon', n: 4 }, labelKey: 'shape_diamond', status: 'soon' },
      { id: 'soon-bubble', recipe: { kind: 'rect' }, labelKey: 'shape_bubble', status: 'soon' },
    ],
  },
];

/** كل بطاقة جاهزة في المكتبة، مسطَّحة — تستخدمها الاختبارات ومُفسِّر الأوامر. */
export const READY_TILES: LibraryTile[] = SHAPE_SECTIONS.flatMap((s) => s.tiles.filter((t) => t.status === 'ready'));

/** مسار SVG للبطاقة في اللوح، في إطار 0..100.
 *
 * بطاقات الأداة الشائعة «صِيَغ مسطّحة صلبة» بلا لون ولا حدّ ولا معاينة لما سيبدو عليه الشكل
 * بعد وضعه — البطاقة تنقل **الهندسة وحدها** (`re-canva-flows.md` §2.2). نولّدها من
 * نفس `shapeGeometryFor` التي تبني العنصر الحقيقي، فلا يمكن للبطاقة أن تكذب على ما
 * ستضعه. */
export function tilePathD(recipe: ShapeRecipe): string {
  const g = shapeGeometryFor(recipe);
  if (g.shape === 'ellipse') return 'M50 2A48 48 0 1 1 50 98A48 48 0 1 1 50 2Z';
  if (g.shape === 'rect') {
    const r = g.radius * 96;
    return `M${2 + r} 2H${98 - r}A${r} ${r} 0 0 1 98 ${2 + r}V${98 - r}A${r} ${r} 0 0 1 ${98 - r} 98H${2 + r}A${r} ${r} 0 0 1 2 ${98 - r}V${2 + r}A${r} ${r} 0 0 1 ${2 + r} 2Z`;
  }
  const pts = g.points ?? [];
  // 2..98 بدل 0..100: البطاقة تحتاج هامشًا، وإلا لامس الشكل حدّ البطاقة فقُرئ مقصوصًا.
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(2 + p.x * 96).toFixed(2)} ${(2 + p.y * 96).toFixed(2)}`).join('');
  return g.closed ? `${d}Z` : d;
}


/** يطبّق مُعدِّلات لوحة المفاتيح على سحبة رسم ويُخرج الصندوق النهائي.
 *
 * دالّة نقيّة عن قصد: هذه هي العضلة التي يلاحظ المصمم المدرَّب غيابها في ثوانٍ
 * (`re-illustrator-flows.md` §2.4)، فيجب أن تكون قابلة للاختبار بالأرقام لا
 * بالانطباع. كان المسار في `Stage.tsx` قبل هذا صندوق `min`/`abs` لا يقرأ أي
 * مُعدِّل إطلاقًا.
 *
 * - `shift` — **ثلاثة معانٍ بحسب العائلة**، وهذا هو بيت القصيد: تساوي العرض
 *   والارتفاع للمستطيل والدائرة والمثلّث والسهم، لكن **تقطيع الزاوية إلى مضاعفات
 *   45°** للخطّ. تنفيذ «اقفل النسبة» الساذج وحده كان سيكون خاطئًا للخطّ.
 * - `alt` — ارسم من المركز. يُهمَل للمضلّع والنجمة لأنهما مركزيّان أصلًا
 *   (`isCenterOrigin`)، وهو استثناء تنصّ عليه المزوّد الكبير حرفيًّا.
 * - الإزاحة بـ`Space` لا تدخل هنا: هي تُحرّك **نقطة الأصل** نفسها قبل استدعاء هذه
 *   الدالّة، فيحفظ الصندوق قياسه ويتنقّل — وهو أبسط وأدقّ من إضافة إزاحة ثالثة.
 */
export function shapeDragBox(
  kind: ShapeDrawKind,
  start: { x: number; y: number },
  cur: { x: number; y: number },
  mods: { shift: boolean; alt: boolean },
): PxBoxLite & { flipX: boolean; flipY: boolean } {
  let dx = cur.x - start.x;
  let dy = cur.y - start.y;

  if (mods.shift) {
    if (kind === 'line') {
      // تقطيع الزاوية: نُسقط طول السحبة على أقرب مضاعف لـ45°، فيبقى الطول الذي
      // سحبه المصمم ويُصحَّح الاتجاه وحده.
      const len = Math.hypot(dx, dy);
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      dx = len * Math.cos(a);
      dy = len * Math.sin(a);
    } else {
      // الضلع الأكبر يقود: الصندوق ينمو إلى أبعد ما وصله المؤشّر على أي محور، وهو
      // ما يتوقّعه من يسحب قطريًّا ليحصل على مربّع.
      const s = Math.max(Math.abs(dx), Math.abs(dy));
      dx = (dx < 0 ? -1 : 1) * s;
      dy = (dy < 0 ? -1 : 1) * s;
    }
  }

  // بعد المُعدِّلات صار الطرف الفعلي `start + (dx, dy)` — لا موضع المؤشّر الخام.
  // كل ما تحت هذا السطر يُحسَب من هذا الطرف المصحَّح وحده.
  const fromCenter = mods.alt || isCenterOrigin(kind);
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  return fromCenter
    ? { x: start.x - absX, y: start.y - absY, w: absX * 2, h: absY * 2, flipX: dx < 0, flipY: dy < 0 }
    : { x: start.x + Math.min(0, dx), y: start.y + Math.min(0, dy), w: absX, h: absY, flipX: dx < 0, flipY: dy < 0 };
}

/** هل بلغت السحبة حدًّا يُعتبر شكلًا؟
 *
 * الخطّ يُقاس بأطول محور لا بكليهما: خطٌّ أفقيّ تمامًا ارتفاع صندوقه صفر، وشرط
 * `w > 4 && h > 4` القديم كان سيرفض كل خطّ مستقيم يرسمه المصمم. */
export function dragIsBigEnough(kind: ShapeDrawKind, box: { w: number; h: number }, min = 4): boolean {
  return kind === 'line' ? Math.max(box.w, box.h) > min : box.w > min && box.h > min;
}

/** يمنع الصندوق المنكمش على محور واحد (خطّ أفقيّ/رأسيّ) من أن يصير صفريّ المساحة،
 * فتبقى مقابض التحديد والدوران قابلة للإمساك. */
export function floorDegenerate(box: PxBoxLite, minSide = 1): PxBoxLite {
  return { ...box, w: Math.max(box.w, minSide), h: Math.max(box.h, minSide) };
}
