import type { AnimPreset, DocElement, ElementId } from '../state/elements';
import { DEFAULT_IMAGE_CROP, defaultAnim, defaultTextStagger } from '../state/elements';
import type { TemplateSlot } from './templates';

/** البوستر التجريبي — بوسترُ عروضٍ لمقهى «رواق»، وهو علامةٌ متخيَّلة كبقيّة ما
 * يظهر في هذا المستودع. و**كان** هذا البوستر هو المستند الافتتاحي للتطبيق.
 *
 * نُقل إلى هنا في ١٨ أكتوبر ٢٠٢٦. السبب ليس أن المحتوى سيّئ، بل أنه كان في المكان
 * الخطأ: `initialStudioState.elements` كانت تستدعي `createDefaultElements()`، فكان
 * البرنامج يفتح على **عملٍ فنيٍّ نهائيٍّ لم يصنعه المستخدم**، وعليه أن يفهمه ثم
 * يفكّكه قبل أن يبدأ. وهذا — لا غياب شاشة البداية — هو العيب الأكبر: المزوّد الكبير إكسبرس
 * أيضًا لا تسأل شيئًا عند الإقلاع ولا يُقال عنها إنها غير مفهومة، لأنها تفتح على
 * مستند **فارغ** ٤٠٠×٦٠٠ (`re-illustrator-flows.md` §1.5).
 *
 * فالبوستر لم يُحذَف: القالب الجاهز قيمةٌ حقيقية، ومكانه الصحيح مسار القوالب —
 * يُفتح بنقرة من شاشة البداية حين يطلبه المصمّم، لا أن يُفرض عليه. */
export function createDemoPosterElements(): DocElement[] {
  return [
    {
      id: 'img',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0.08, y: 0.485, w: 0.34, h: 0.425, rotation: 0 },
      src: null,
      fit: 'cover',
      ...DEFAULT_IMAGE_CROP,
      flipH: false,
      flipV: false,
      radius: 0.06,
      stroke: null,
      strokeWidth: 0,
      naturalW: 0,
      naturalH: 0,
      placeholder: true,
      anim: defaultAnim('fade', 0.5, 0.6, 'easeOut'),
    },
    {
      id: 'discount',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0.46, y: 0.67, w: 0.46, h: 0.12, rotation: 0 },
      text: 'خصم يصل إلى ٥٠٪ على كل شيء · حتى الأحد',
      fontFamily: 'Alexandria',
      fontSize: 34.56,
      weight: 'medium',
      color: null,
      halign: 'start',
      valign: 'top',
      anim: defaultAnim('fade', 0.3, 0.6, 'easeOut'),
      textAnim: defaultTextStagger(),
      pathId: null,
    },
    {
      id: 'head',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0.36, y: 0.31, w: 0.56, h: 0.33, rotation: 0 },
      text: 'عروض رواق هذا الأسبوع',
      fontFamily: 'Alexandria',
      fontSize: 96,
      weight: 'bold',
      color: null,
      halign: 'start',
      valign: 'top',
      anim: defaultAnim('slide', 0.3, 0.6, 'easeOut'),
      textAnim: defaultTextStagger(),
      pathId: null,
    },
    {
      id: 'badge',
      type: 'shape',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0.1, y: 0.09, w: 0.18, h: 0.18, rotation: -8 },
      shape: 'ellipse',
      fill: null,
      fillToken: 'ac',
      stroke: null,
      strokeWidth: 0,
      radius: 0,
      anim: defaultAnim('pop', 1.2, 0.5, 'back'),
    },
    {
      // Independently selectable/editable text, layered on top of the `badge` circle —
      // previously baked into the shape as a non-editable `label`; see docs/CONTROLS.md.
      id: 'badge-label',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0.14, y: 0.1475, w: 0.1, h: 0.065, rotation: -8 },
      text: '٥٠٪',
      fontFamily: 'Alexandria',
      fontSize: 58,
      weight: 'bold',
      color: null,
      halign: 'center',
      valign: 'middle',
      anim: defaultAnim('pop', 1.2, 0.5, 'back'),
      textAnim: defaultTextStagger(),
      pathId: null,
    },
    {
      id: 'logo',
      type: 'shape',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0.887, y: 0.885, w: 0.028, h: 0.028, rotation: 0 },
      shape: 'rect',
      fill: null,
      fillToken: 'ac',
      stroke: null,
      strokeWidth: 0,
      radius: 0.3,
      anim: defaultAnim('fade', 1.5, 0.4, 'linear'),
    },
    {
      // Independently selectable/editable wordmark text, to the start side of the
      // `logo` square — previously a non-editable `label` baked into the shape.
      id: 'logo-label',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 100,
      maskId: null,
      geo: { x: 0.765, y: 0.8815, w: 0.11, h: 0.035, rotation: 0 },
      text: 'رواق',
      fontFamily: 'Alexandria',
      fontSize: 32,
      weight: 'bold',
      color: null,
      anim: defaultAnim('fade', 1.5, 0.4, 'linear'),
      halign: 'center',
      valign: 'middle',
      textAnim: defaultTextStagger(),
      pathId: null,
    },
  ];
}

/** الخانات القابلة للتعبئة في البوستر التجريبي — نفس عقد `Template.slots`: تسمية
 * ما يُستبدَل محتواه دون المساس بالبنية ولا بالحركة. */
export const DEMO_POSTER_SLOTS: TemplateSlot[] = [
  { id: 'slot-head', label: 'العنوان', elementId: 'head', kind: 'text' },
  { id: 'slot-discount', label: 'السطر الفرعي', elementId: 'discount', kind: 'text' },
  { id: 'slot-badge-label', label: 'الشارة', elementId: 'badge-label', kind: 'text' },
  { id: 'slot-img', label: 'صورة المنتج', elementId: 'img', kind: 'image' },
];

/** قالب جاهز مدمج في التطبيق (لا يأتي من مكتبة المستخدم المحفوظة).
 *
 * `anim` و`selectOnOpen` موجودان لأن فتح قالب يجب أن يسلّم المصمّم مستندًا
 * **جاهزًا للعمل عليه فورًا**: العنوان محدَّد، وحركة الدخول مضبوطة — لا مستندًا
 * صحيحًا لكنه بلا تحديد ولا حركة. */
export interface StarterTemplate {
  id: string;
  /** مفتاح الاسم في `Dictionary` — القوالب المدمجة تُترجَم كبقية الواجهة. */
  nameKey: 't1' | 't2' | 't3' | 't4' | 't5' | 't6';
  paletteIdx: number;
  sizeIdx: number;
  anim: AnimPreset;
  /** هل يبدأ القالب بزخرفة اللوحة (`DocSnapshot.decorAccent`)؟ البوستر التجريبي وأخواته
   * أُلِّفت حولها — فراغ الزاوية العليا اليمنى فيها مقصودٌ لها — فتبدأ بها. وهذا
   * الحقل هو ما يجعل الزخرفة قرارَ **القالب** بدل أن تكون قاعدةً عامّة تسري على
   * كل مستندٍ غير فارغ في البرنامج. */
  decorAccent: boolean;
  selectOnOpen: ElementId | null;
  elements: () => DocElement[];
  slots: TemplateSlot[];
}

/** القوالب المدمجة المعروضة على شاشة البداية. كلها اليوم بنيةُ البوستر التجريبي نفسها
 * بلوحة ألوان ومقاسٍ مختلفين — وهذا مذكورٌ صراحةً لا مُخبَّأ: التنويع الحقيقي
 * يأتي من مكتبة القوالب التي يحفظها المستخدم (`state.templates`)، ومن استيراد
 * البنية من فيديو مرجعي. أول عنصر هو البوستر الأصلي بحالته الافتتاحية السابقة
 * بالضبط (مقاس ١٠٨٠×١٠٨٠، لوحة ٠، حركة `slide`، العنوان محدَّد). */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  { id: 'demo-poster', nameKey: 't1', paletteIdx: 0, sizeIdx: 0, anim: 'slide', decorAccent: true, selectOnOpen: 'head', elements: createDemoPosterElements, slots: DEMO_POSTER_SLOTS },
  { id: 'quote', nameKey: 't2', paletteIdx: 1, sizeIdx: 1, anim: 'slide', decorAccent: true, selectOnOpen: 'head', elements: createDemoPosterElements, slots: DEMO_POSTER_SLOTS },
  { id: 'hiring', nameKey: 't3', paletteIdx: 2, sizeIdx: 3, anim: 'slide', decorAccent: true, selectOnOpen: 'head', elements: createDemoPosterElements, slots: DEMO_POSTER_SLOTS },
  { id: 'product', nameKey: 't4', paletteIdx: 3, sizeIdx: 0, anim: 'slide', decorAccent: true, selectOnOpen: 'head', elements: createDemoPosterElements, slots: DEMO_POSTER_SLOTS },
  { id: 'reel', nameKey: 't5', paletteIdx: 4, sizeIdx: 2, anim: 'slide', decorAccent: true, selectOnOpen: 'head', elements: createDemoPosterElements, slots: DEMO_POSTER_SLOTS },
  { id: 'tweet', nameKey: 't6', paletteIdx: 5, sizeIdx: 1, anim: 'slide', decorAccent: true, selectOnOpen: 'head', elements: createDemoPosterElements, slots: DEMO_POSTER_SLOTS },
];
