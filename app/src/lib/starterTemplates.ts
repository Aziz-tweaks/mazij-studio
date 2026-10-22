import type { AnimPreset, DocElement, ElementAnim, ElementId, Geometry, ImageElement, PaletteToken, ShapeElement, ShapeKind, TextElement } from '../state/elements';
import { DEFAULT_IMAGE_CROP, defaultAnim, defaultTextStagger } from '../state/elements';
import type { HAlign, VAlign, Weight } from '../state/types';
import type { TemplateSlot } from './templates';

/** مُنشِئاتٌ خاصّةٌ صغيرة — لا قالبَ هياكل مشتركًا. الفرقُ بين هذه وبين العلّة
 * التي بُنيت القوالبُ العشرة الآتية لإصلاحها (`createDemoPosterElements` تُنادى
 * ستَّ مرّاتٍ ببياناتٍ مختلفة فقط) جوهريٌّ: `mkText`/`mkShape`/`mkImage` تبنيان
 * **حقول العنصر الثابتة فقط** (id/visible/locked/opacity/maskId/الحقول الافتراضية
 * لنوعه) — نفس الدَين المتكرّر في كل عنصرٍ من أي نوع بصرف النظر عن القالب، تمامًا
 * كما تفعل `textEl`/`imageEl`/`shapeEl` في `qa/templates.spec.mjs`. كلُّ قرارٍ
 * تصميميّ — الهندسة، التسلسل، العدد، الدور — يبقى مكتوبًا بالكامل في دالّة كل قالب. */
function mkText(id: ElementId, text: string, geo: Geometry, cfg: { fontSize: number; weight?: Weight; color?: string | null; halign?: HAlign; valign?: VAlign; fontFamily?: string; opacity?: number; anim: ElementAnim }): TextElement {
  return {
    id,
    type: 'text',
    visible: true,
    locked: false,
    opacity: cfg.opacity ?? 100,
    maskId: null,
    geo,
    text,
    fontFamily: cfg.fontFamily ?? 'Alexandria',
    fontSize: cfg.fontSize,
    weight: cfg.weight ?? 'regular',
    color: cfg.color ?? null,
    halign: cfg.halign ?? 'start',
    valign: cfg.valign ?? 'top',
    anim: cfg.anim,
    textAnim: defaultTextStagger(),
    pathId: null,
  };
}

function mkShape(id: ElementId, shape: ShapeKind, geo: Geometry, cfg: { fillToken?: PaletteToken; radius?: number; opacity?: number; anim: ElementAnim }): ShapeElement {
  return {
    id,
    type: 'shape',
    visible: true,
    locked: false,
    opacity: cfg.opacity ?? 100,
    maskId: null,
    geo,
    shape,
    fill: null,
    fillToken: cfg.fillToken ?? 'ac',
    stroke: null,
    strokeWidth: 0,
    radius: cfg.radius ?? 0,
    anim: cfg.anim,
  };
}

function mkImage(id: ElementId, geo: Geometry, cfg: { radius?: number; opacity?: number; anim: ElementAnim }): ImageElement {
  return {
    id,
    type: 'image',
    visible: true,
    locked: false,
    opacity: cfg.opacity ?? 100,
    maskId: null,
    geo,
    src: null,
    fit: 'cover',
    ...DEFAULT_IMAGE_CROP,
    flipH: false,
    flipV: false,
    radius: cfg.radius ?? 0,
    stroke: null,
    strokeWidth: 0,
    naturalW: 0,
    naturalH: 0,
    placeholder: true,
    anim: cfg.anim,
  };
}

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

// ============================================================================
// خمسةَ عشرَ قالبًا، ٢٢ أكتوبر ٢٠٢٦ — كلّ واحدةٍ دالّةُ بناءٍ مستقلّة ببنية تخطيطٍ
// مختلفة عن أخواتها (لا نسخة من `createDemoPosterElements` بأرقامٍ مختلفة، وهي
// العلّة التي حُذفت بها خمسةُ قوالبَ زائفة في هذا التاريخ — انظر الفقرة عند
// `STARTER_TEMPLATES` أدناه). التنويع بنيويٌّ لا لونيٌّ فقط: قُطريّ، تمركزٌ كامل،
// شبكةٌ بعمودٍ فاصل، تذكرةٌ بشقٍّ وثُلمتَين، إطارٌ مزدوجٌ متناظر، انقسامٌ رأسيٌّ
// نصٌّ/صورة، أعمدةٌ إحصائيّة، قائمةُ بنودٍ بخطوطِ فصل، إطارٌ مذهَّبٌ بختمٍ متراكب،
// طبقاتُ فقاعاتٍ غير متناظرة — والخمسةُ المُضافة في هذا التاريخ نفسه: خلفيّةٌ
// كاملةٌ بشريطٍ سفليٍّ وشارةٍ قُطريّةٍ في الزاوية (عقار)، أشرطةُ خطابٍ رسميٍّ
// علويّةٌ وسفليّةٌ بلا إطار (إعلانٌ مؤسّسي)، سلسلةُ دوائرَ مرقَّمةٍ يصلها خطٌّ
// رأسيّ (خطوات)، نصفانِ متقابلانِ بخاتمٍ مركزيٍّ على الدَّرز (قبل/بعد)، وبطاقةُ
// شاشةٍ مائلةٌ فوق تركيبةٍ من أيقونةٍ وتقييمٍ ودعوة (إعلان تطبيق). كل واحدةٍ
// بلوحتها الخاصّة من `PALETTES`، وخطّها، وثقلِ حبرها، ومقاسِها الذي بُنيت له.
// ============================================================================

/** ١. عرضٌ/خصمٌ — قُطريّ. مثلّثٌ قُطريّ حقيقيّ (شكلُ `path`، لا مستطيلٌ مُدار)
 * يحمل النسبةَ الضخمة أعلى اللوحة، والعنوانُ تحته على الخلفيّة العاديّة، وصورةٌ
 * مستديرةٌ وزرٌّ في الزاوية السفليّة. خصمٌ آخر لا يشبه بوستر «رواق» الأصليّ في
 * شيء — لا صورةٌ يسارًا ونصٌّ يمينًا، بل قطعٌ قُطريٌّ واحدٌ يقود العين من الزاوية
 * العليا إلى الزرّ السفليّ. */
export function createOfferSplitElements(): DocElement[] {
  const diagonal: ShapeElement = {
    ...(mkShape('diagonal', 'path', { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('slide', 0, 0.5, 'easeOut') }) as ShapeElement),
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0.72 }],
    closed: true,
  };
  return [
    diagonal,
    mkText('eyebrow', 'تخفيضات نهاية الموسم', { x: 0.08, y: 0.06, w: 0.6, h: 0.05, rotation: 0 }, { fontSize: 28, weight: 'medium', color: '#FFFFFF', anim: defaultAnim('fade', 0.2, 0.5, 'easeOut') }),
    mkText('percent', '٦٠٪', { x: 0.06, y: 0.14, w: 0.7, h: 0.28, rotation: 0 }, { fontSize: 190, weight: 'bold', color: '#FFFFFF', anim: defaultAnim('pop', 0.3, 0.6, 'back') }),
    mkText('headline', 'خصم الشتاء على كل المقاسات', { x: 0.08, y: 0.52, w: 0.84, h: 0.14, rotation: 0 }, { fontSize: 54, weight: 'bold', anim: defaultAnim('slide', 0.4, 0.6, 'easeOut') }),
    mkImage('photo', { x: 0.56, y: 0.66, w: 0.38, h: 0.28, rotation: 0 }, { radius: 0.5, anim: defaultAnim('fade', 0.5, 0.5, 'easeOut') }),
    mkShape('cta', 'rect', { x: 0.08, y: 0.86, w: 0.42, h: 0.08, rotation: 0 }, { fillToken: 'ac', radius: 0.5, anim: defaultAnim('pop', 0.6, 0.5, 'back') }),
    mkText('cta-label', 'تسوّق الآن', { x: 0.08, y: 0.86, w: 0.42, h: 0.08, rotation: 0 }, { fontSize: 30, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', anim: defaultAnim('pop', 0.6, 0.5, 'back') }),
  ];
}

export const OFFER_SPLIT_SLOTS: TemplateSlot[] = [
  { id: 'slot-eyebrow', label: 'السطر العلوي', elementId: 'eyebrow', kind: 'text' },
  { id: 'slot-percent', label: 'نسبة الخصم', elementId: 'percent', kind: 'text' },
  { id: 'slot-headline', label: 'العنوان', elementId: 'headline', kind: 'text' },
  { id: 'slot-photo', label: 'صورة المنتج', elementId: 'photo', kind: 'image' },
  { id: 'slot-cta', label: 'زرّ الدعوة', elementId: 'cta-label', kind: 'text' },
];

/** ٢. اقتباسٌ — تمركزٌ كامل، أخفّ القوالب العشرة حِبرًا بقصد: الفراغ هنا هو
 * التصميم، لا ما تبقّى بعد وضع المحتوى. علامتا تنصيصٍ شبحيّتان بشفافيّةٍ منخفضة
 * أعلى النصّ المركزيّ، وخطّان رفيعان متناظران فوق وتحت الاقتباس بدل أيّ شكلٍ
 * زخرفيٍّ ثقيل. */
export function createQuoteSpotlightElements(): DocElement[] {
  return [
    mkShape('rule-top', 'rect', { x: 0.46, y: 0.06, w: 0.08, h: 0.01, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('fade', 0, 0.5, 'easeOut') }),
    mkText('mark', '"', { x: 0.38, y: 0.09, w: 0.24, h: 0.16, rotation: 0 }, { fontSize: 140, weight: 'bold', opacity: 18, halign: 'center', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0, 0.6, 'easeOut') }),
    mkText('quote', 'النجاح ليس نهاية الطريق، بل خطوة في بدايته', { x: 0.13, y: 0.34, w: 0.74, h: 0.28, rotation: 0 }, { fontSize: 52, weight: 'medium', halign: 'center', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.3, 0.6, 'easeOut') }),
    mkShape('rule-bottom', 'rect', { x: 0.44, y: 0.65, w: 0.12, h: 0.012, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('fade', 0.5, 0.5, 'easeOut') }),
    mkText('attribution', '— حكمة عربية', { x: 0.25, y: 0.68, w: 0.5, h: 0.06, rotation: 0 }, { fontSize: 26, weight: 'medium', halign: 'center', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.55, 0.5, 'easeOut') }),
  ];
}

export const QUOTE_SPOTLIGHT_SLOTS: TemplateSlot[] = [
  { id: 'slot-quote', label: 'نصّ الاقتباس', elementId: 'quote', kind: 'text' },
  { id: 'slot-attribution', label: 'المصدر', elementId: 'attribution', kind: 'text' },
];

/** ٣. وظيفةٌ شاغرة — شبكةٌ بعمودٍ فاصل. خطٌّ رأسيٌّ يقسم اللوحة ٦٨/٣٢: يسارٌ
 * عريضٌ للعنوان والمتطلّبات كفقرةٍ واحدة، يمينٌ ضيّقٌ لاسم الشركة وزرّ التقديم —
 * توزيعُ أعمدةٍ حقيقيّ، لا نصًّا وصورةً متجاورين كبقيّة القوالب. */
export function createHiringGridElements(): DocElement[] {
  return [
    mkShape('divider', 'rect', { x: 0.68, y: 0, w: 0.012, h: 1, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('fade', 0, 0.4, 'linear') }),
    mkShape('badge-pill', 'rect', { x: 0.07, y: 0.1, w: 0.22, h: 0.1, rotation: 0 }, { fillToken: 'ac', radius: 0.5, anim: defaultAnim('pop', 0.1, 0.5, 'back') }),
    mkText('badge-label', 'نوظّف الآن', { x: 0.07, y: 0.1, w: 0.22, h: 0.1, rotation: 0 }, { fontSize: 24, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', anim: defaultAnim('pop', 0.1, 0.5, 'back') }),
    mkText('title', 'مطوّر واجهات أمامية', { x: 0.07, y: 0.24, w: 0.58, h: 0.28, rotation: 0 }, { fontSize: 50, weight: 'bold', anim: defaultAnim('slide', 0.25, 0.6, 'easeOut') }),
    mkText('requirements', 'خبرة لا تقل عن ٣ سنوات في React\nإتقان التصميم المتجاوب\nالعمل ضمن فريقٍ منهجيّة Agile', { x: 0.07, y: 0.56, w: 0.56, h: 0.32, rotation: 0 }, { fontSize: 24, anim: defaultAnim('fade', 0.4, 0.5, 'easeOut') }),
    mkText('company', 'شركة نماء التقنية · الرياض', { x: 0.73, y: 0.1, w: 0.24, h: 0.14, rotation: 0 }, { fontSize: 22, weight: 'medium', anim: defaultAnim('fade', 0.2, 0.5, 'easeOut') }),
    mkShape('cta', 'rect', { x: 0.73, y: 0.78, w: 0.22, h: 0.11, rotation: 0 }, { fillToken: 'ac', radius: 0.5, anim: defaultAnim('pop', 0.5, 0.5, 'back') }),
    mkText('cta-label', 'قدّم الآن', { x: 0.73, y: 0.78, w: 0.22, h: 0.11, rotation: 0 }, { fontSize: 24, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', anim: defaultAnim('pop', 0.5, 0.5, 'back') }),
  ];
}

export const HIRING_GRID_SLOTS: TemplateSlot[] = [
  { id: 'slot-badge-label', label: 'الشارة', elementId: 'badge-label', kind: 'text' },
  { id: 'slot-title', label: 'اسم الوظيفة', elementId: 'title', kind: 'text' },
  { id: 'slot-requirements', label: 'المتطلّبات', elementId: 'requirements', kind: 'text' },
  { id: 'slot-company', label: 'الشركة', elementId: 'company', kind: 'text' },
  { id: 'slot-cta', label: 'زرّ الدعوة', elementId: 'cta-label', kind: 'text' },
];

/** ٤. تذكرةُ فعاليّة — تذكرةٌ حقيقيّة بشِقٍّ: شريطٌ سفليٌّ بلوحةٍ مختلفة (الشقّ
 * القابل للفصل) تفصله عن المتن ثُلمتان دائريّتان بلون الخلفيّة تَقرضان حافّتيه —
 * الإيهامُ البصريُّ الذي يجعل التذكرة تذكرةً، لا مجرّد مستطيلٍ ملوَّن أسفل
 * الصفحة. */
export function createEventTicketElements(): DocElement[] {
  return [
    mkText('eyebrow', 'فعاليّة موسيقيّة حيّة', { x: 0.08, y: 0.08, w: 0.6, h: 0.05, rotation: 0 }, { fontSize: 26, weight: 'medium', fontFamily: 'Vazirmatn', anim: defaultAnim('fade', 0, 0.5, 'easeOut') }),
    mkText('title', 'ليلة الجاز تحت النجوم', { x: 0.08, y: 0.16, w: 0.84, h: 0.28, rotation: 0 }, { fontSize: 78, weight: 'bold', fontFamily: 'Vazirmatn', anim: defaultAnim('slide', 0.2, 0.6, 'easeOut') }),
    mkShape('date-badge', 'rect', { x: 0.08, y: 0.48, w: 0.26, h: 0.14, rotation: 0 }, { fillToken: 'ac', radius: 0.12, anim: defaultAnim('pop', 0.35, 0.5, 'back') }),
    mkText('date-label', '٢٤ نوفمبر', { x: 0.08, y: 0.48, w: 0.26, h: 0.14, rotation: 0 }, { fontSize: 28, weight: 'bold', color: '#0F3D3E', halign: 'center', valign: 'middle', fontFamily: 'Vazirmatn', anim: defaultAnim('pop', 0.35, 0.5, 'back') }),
    mkText('location', 'فندق الريتز · قاعة الفينيق، الرياض', { x: 0.4, y: 0.5, w: 0.52, h: 0.1, rotation: 0 }, { fontSize: 24, fontFamily: 'Vazirmatn', valign: 'middle', anim: defaultAnim('fade', 0.4, 0.5, 'easeOut') }),
    mkShape('stub-panel', 'rect', { x: 0, y: 0.8, w: 1, h: 0.2, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('slide', 0.3, 0.5, 'easeOut') }),
    mkShape('notch-left', 'ellipse', { x: -0.04, y: 0.76, w: 0.08, h: 0.08, rotation: 0 }, { fillToken: 'bg', anim: defaultAnim('fade', 0.3, 0.4, 'linear') }),
    mkShape('notch-right', 'ellipse', { x: 0.96, y: 0.76, w: 0.08, h: 0.08, rotation: 0 }, { fillToken: 'bg', anim: defaultAnim('fade', 0.3, 0.4, 'linear') }),
    mkText('stub-text', 'تذكرة الدخول · صالحة لشخصٍ واحد', { x: 0.08, y: 0.86, w: 0.84, h: 0.08, rotation: 0 }, { fontSize: 22, weight: 'medium', color: '#0F3D3E', halign: 'center', valign: 'middle', fontFamily: 'Vazirmatn', anim: defaultAnim('fade', 0.45, 0.4, 'easeOut') }),
  ];
}

export const EVENT_TICKET_SLOTS: TemplateSlot[] = [
  { id: 'slot-eyebrow', label: 'نوع الفعاليّة', elementId: 'eyebrow', kind: 'text' },
  { id: 'slot-title', label: 'اسم الفعاليّة', elementId: 'title', kind: 'text' },
  { id: 'slot-location', label: 'المكان', elementId: 'location', kind: 'text' },
  { id: 'slot-stub', label: 'نصّ الشقّ', elementId: 'stub-text', kind: 'text' },
];

/** ٥. تهنئةُ مناسبة — إطارٌ مزدوجٌ متناظر: حلقةٌ ذهبيّةٌ خارجيّةٌ ثم حلقةٌ
 * بلون الخلفيّة داخلها (لا حدٌّ مرسوم، بل مستطيلان متداخلان يُنتجان مظهر
 * الإطار)، وزخرفتا معيَّنٍ (مربّعٌ مُدارٌ ٤٥°) أعلى النصّ وأسفله — تماثلٌ عموديٌّ
 * كامل لا يوجد في أيّ قالبٍ آخر من العشرة. */
export function createOccasionCardElements(): DocElement[] {
  return [
    mkShape('frame-outer', 'rect', { x: 0.04, y: 0.04, w: 0.92, h: 0.92, rotation: 0 }, { fillToken: 'ac', radius: 0.03, anim: defaultAnim('fade', 0, 0.5, 'easeOut') }),
    mkShape('frame-inner', 'rect', { x: 0.065, y: 0.065, w: 0.87, h: 0.87, rotation: 0 }, { fillToken: 'bg', radius: 0.02, anim: defaultAnim('fade', 0.1, 0.5, 'easeOut') }),
    mkShape('ornament-top', 'rect', { x: 0.46, y: 0.1, w: 0.08, h: 0.08, rotation: 45 }, { fillToken: 'ac', anim: defaultAnim('pop', 0.3, 0.5, 'back') }),
    mkText('greeting', 'كلّ عامٍ وأنتم بخير', { x: 0.15, y: 0.38, w: 0.7, h: 0.18, rotation: 0 }, { fontSize: 68, weight: 'bold', halign: 'center', valign: 'middle', anim: defaultAnim('fade', 0.35, 0.6, 'easeOut') }),
    mkText('subtitle', 'بمناسبة عيد الفطر المبارك', { x: 0.15, y: 0.58, w: 0.7, h: 0.08, rotation: 0 }, { fontSize: 28, weight: 'medium', halign: 'center', valign: 'middle', anim: defaultAnim('fade', 0.45, 0.5, 'easeOut') }),
    mkShape('ornament-bottom', 'rect', { x: 0.46, y: 0.82, w: 0.08, h: 0.08, rotation: 45 }, { fillToken: 'ac', anim: defaultAnim('pop', 0.5, 0.5, 'back') }),
    mkText('sender', 'من أسرة التصميم الرقميّ', { x: 0.2, y: 0.88, w: 0.6, h: 0.06, rotation: 0 }, { fontSize: 20, halign: 'center', valign: 'middle', anim: defaultAnim('fade', 0.55, 0.4, 'easeOut') }),
  ];
}

export const OCCASION_CARD_SLOTS: TemplateSlot[] = [
  { id: 'slot-greeting', label: 'التهنئة', elementId: 'greeting', kind: 'text' },
  { id: 'slot-subtitle', label: 'المناسبة', elementId: 'subtitle', kind: 'text' },
  { id: 'slot-sender', label: 'المُرسِل', elementId: 'sender', kind: 'text' },
];

/** ٦. بطاقةُ منتج — انقسامٌ رأسيٌّ صريح: صورةٌ تملأ النصف الأيمن حافّةً إلى
 * حافّة (لا تأطيرَ ولا حشوَ حولها)، والنصف الأيسر فقرةُ معلوماتٍ مكدَّسة (سطرٌ
 * علويٌّ، اسمٌ، وصفٌ، سعرٌ في شارة، دعوةٌ للشراء) — دورُ النصّ هنا «نصٌّ مع
 * صورة» بالمعنى الحرفيّ، لا نصٌّ طافٍ فوق صورةٍ كخلفيّة. */
export function createProductCardElements(): DocElement[] {
  return [
    mkImage('photo', { x: 0.5, y: 0, w: 0.5, h: 1, rotation: 0 }, { anim: defaultAnim('fade', 0, 0.6, 'easeOut') }),
    mkText('eyebrow', 'وصل حديثًا', { x: 0.07, y: 0.1, w: 0.3, h: 0.05, rotation: 0 }, { fontSize: 15, weight: 'bold', color: '#0FA06B', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.1, 0.5, 'easeOut') }),
    mkText('name', 'سماعة الصوت اللاسلكيّة X1', { x: 0.07, y: 0.2, w: 0.4, h: 0.16, rotation: 0 }, { fontSize: 31, weight: 'bold', fontFamily: "'Readex Pro'", anim: defaultAnim('slide', 0.2, 0.6, 'easeOut') }),
    mkText('description', 'صوتٌ نقيٌّ وبطاريةٌ تدوم طوال اليوم', { x: 0.07, y: 0.4, w: 0.38, h: 0.14, rotation: 0 }, { fontSize: 16, fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.3, 0.5, 'easeOut') }),
    mkShape('price-tag', 'rect', { x: 0.07, y: 0.62, w: 0.26, h: 0.12, rotation: 0 }, { fillToken: 'ac', radius: 0.1, anim: defaultAnim('pop', 0.45, 0.5, 'back') }),
    mkText('price-label', '٢٤٩ ر.س', { x: 0.07, y: 0.62, w: 0.26, h: 0.12, rotation: 0 }, { fontSize: 20, weight: 'bold', color: '#08402F', halign: 'center', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('pop', 0.45, 0.5, 'back') }),
    mkText('cta', 'تسوّق الآن ←', { x: 0.07, y: 0.8, w: 0.3, h: 0.06, rotation: 0 }, { fontSize: 15, weight: 'medium', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.55, 0.4, 'easeOut') }),
  ];
}

export const PRODUCT_CARD_SLOTS: TemplateSlot[] = [
  { id: 'slot-eyebrow', label: 'السطر العلوي', elementId: 'eyebrow', kind: 'text' },
  { id: 'slot-name', label: 'اسم المنتج', elementId: 'name', kind: 'text' },
  { id: 'slot-description', label: 'الوصف', elementId: 'description', kind: 'text' },
  { id: 'slot-price', label: 'السعر', elementId: 'price-label', kind: 'text' },
  { id: 'slot-photo', label: 'صورة المنتج', elementId: 'photo', kind: 'image' },
];

/** ٧. إحصائيّة/إنفوجرافيك — ثلاثةُ أعمدةِ قياسٍ أفقيّةٍ، كلُّ عمودٍ شريطَين
 * متراكبَين (مسارٌ خافتٌ بعرضٍ كامل، وشريطٌ ملوَّنٌ فوقه بعرضٍ نسبيٍّ لقيمته) —
 * دورُ الشكل هنا قياسٌ بصريٌّ لرقم، لا زخرفةٌ ولا حاوٍ لنصّ، وهو دورٌ لا يتكرّر
 * في أيٍّ من القوالب الأخرى. */
export function createStatInfographicElements(): DocElement[] {
  const row = (idx: number, yBase: number, label: string, value: string, fraction: number): DocElement[] => [
    mkText(`row${idx}-label`, label, { x: 0.08, y: yBase, w: 0.5, h: 0.045, rotation: 0 }, { fontSize: 24, weight: 'medium', anim: defaultAnim('fade', 0.5 + idx * 0.1, 0.4, 'easeOut') }),
    mkText(`row${idx}-value`, value, { x: 0.74, y: yBase, w: 0.18, h: 0.045, rotation: 0 }, { fontSize: 24, weight: 'bold', halign: 'end', anim: defaultAnim('fade', 0.5 + idx * 0.1, 0.4, 'easeOut') }),
    mkShape(`row${idx}-track`, 'rect', { x: 0.08, y: yBase + 0.05, w: 0.84, h: 0.035, rotation: 0 }, { fillToken: 'fg', opacity: 15, radius: 0.5, anim: defaultAnim('fade', 0.5 + idx * 0.1, 0.4, 'easeOut') }),
    mkShape(`row${idx}-fill`, 'rect', { x: 0.08, y: yBase + 0.05, w: 0.84 * fraction, h: 0.035, rotation: 0 }, { fillToken: 'ac', radius: 0.5, anim: defaultAnim('slide', 0.55 + idx * 0.1, 0.5, 'easeOut') }),
  ];
  return [
    mkText('title', 'نمو المستخدمين خلال عام', { x: 0.08, y: 0.06, w: 0.84, h: 0.07, rotation: 0 }, { fontSize: 32, weight: 'bold', anim: defaultAnim('fade', 0, 0.5, 'easeOut') }),
    mkText('big-stat', '+٣٢٠٪', { x: 0.08, y: 0.14, w: 0.84, h: 0.22, rotation: 0 }, { fontSize: 160, weight: 'bold', color: '#C8F135', anim: defaultAnim('pop', 0.2, 0.6, 'back') }),
    ...row(0, 0.42, 'تطبيق الجوال', '٨٥٪', 0.85),
    ...row(1, 0.59, 'المتجر الإلكترونيّ', '٦٠٪', 0.6),
    ...row(2, 0.76, 'الفرع الحضوريّ', '٣٥٪', 0.35),
  ];
}

export const STAT_INFOGRAPHIC_SLOTS: TemplateSlot[] = [
  { id: 'slot-title', label: 'العنوان', elementId: 'title', kind: 'text' },
  { id: 'slot-big-stat', label: 'الرقم الكبير', elementId: 'big-stat', kind: 'text' },
  { id: 'slot-row0-label', label: 'بند ١', elementId: 'row0-label', kind: 'text' },
  { id: 'slot-row0-value', label: 'قيمة ١', elementId: 'row0-value', kind: 'text' },
  { id: 'slot-row1-label', label: 'بند ٢', elementId: 'row1-label', kind: 'text' },
  { id: 'slot-row1-value', label: 'قيمة ٢', elementId: 'row1-value', kind: 'text' },
  { id: 'slot-row2-label', label: 'بند ٣', elementId: 'row2-label', kind: 'text' },
  { id: 'slot-row2-value', label: 'قيمة ٣', elementId: 'row2-value', kind: 'text' },
];

/** ٨. قائمةُ طعام — قائمةُ بنودٍ عموديّة، أربعُ صفوفٍ كلُّ صفٍّ اسمٌ يبدأ من
 * الحافّة وسعرٌ ينتهي عند الحافّة الأخرى، وخطوطُ فصلٍ رفيعةٌ بين الصفوف — عمودا
 * نصٍّ متقابلا الاتّجاه بمعنًى وظيفيّ (اسمٌ/سعر)، لا يظهر هذا التركيب في أيّ
 * قالبٍ آخر. */
export function createMenuListElements(): DocElement[] {
  const item = (idx: number, y: number, name: string, price: string, withRule: boolean): DocElement[] => {
    const els: DocElement[] = [
      mkText(`item${idx}-name`, name, { x: 0.1, y, w: 0.6, h: 0.06, rotation: 0 }, { fontSize: 30, weight: 'medium', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.3 + idx * 0.08, 0.4, 'easeOut') }),
      mkText(`item${idx}-price`, price, { x: 0.72, y, w: 0.18, h: 0.06, rotation: 0 }, { fontSize: 28, weight: 'bold', halign: 'end', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.3 + idx * 0.08, 0.4, 'easeOut') }),
    ];
    if (withRule) els.push(mkShape(`item${idx}-rule`, 'rect', { x: 0.1, y: y + 0.065, w: 0.8, h: 0.003, rotation: 0 }, { fillToken: 'fg', opacity: 20, anim: defaultAnim('fade', 0.35 + idx * 0.08, 0.3, 'linear') }));
    return els;
  };
  return [
    mkText('header', 'قائمة اليوم', { x: 0.1, y: 0.08, w: 0.8, h: 0.08, rotation: 0 }, { fontSize: 46, weight: 'bold', halign: 'center', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0, 0.5, 'easeOut') }),
    mkText('subheader', 'مقهى رواء', { x: 0.1, y: 0.16, w: 0.8, h: 0.04, rotation: 0 }, { fontSize: 22, weight: 'medium', color: '#B3542E', halign: 'center', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.1, 0.4, 'easeOut') }),
    mkShape('rule-top', 'rect', { x: 0.35, y: 0.21, w: 0.3, h: 0.006, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('fade', 0.15, 0.4, 'linear') }),
    ...item(0, 0.28, 'قهوة عربيّة مُحمّصة', '١٨ ر.س', true),
    ...item(1, 0.38, 'كرواسون بالزبدة', '١٤ ر.س', true),
    ...item(2, 0.48, 'عصير برتقال طازج', '١٢ ر.س', true),
    ...item(3, 0.58, 'تشيز كيك بالتوت', '٢٢ ر.س', false),
  ];
}

export const MENU_LIST_SLOTS: TemplateSlot[] = [
  { id: 'slot-header', label: 'عنوان القائمة', elementId: 'header', kind: 'text' },
  { id: 'slot-subheader', label: 'اسم المحل', elementId: 'subheader', kind: 'text' },
  { id: 'slot-item0-name', label: 'بند ١ — الاسم', elementId: 'item0-name', kind: 'text' },
  { id: 'slot-item0-price', label: 'بند ١ — السعر', elementId: 'item0-price', kind: 'text' },
  { id: 'slot-item1-name', label: 'بند ٢ — الاسم', elementId: 'item1-name', kind: 'text' },
  { id: 'slot-item1-price', label: 'بند ٢ — السعر', elementId: 'item1-price', kind: 'text' },
  { id: 'slot-item2-name', label: 'بند ٣ — الاسم', elementId: 'item2-name', kind: 'text' },
  { id: 'slot-item2-price', label: 'بند ٣ — السعر', elementId: 'item2-price', kind: 'text' },
  { id: 'slot-item3-name', label: 'بند ٤ — الاسم', elementId: 'item3-name', kind: 'text' },
  { id: 'slot-item3-price', label: 'بند ٤ — السعر', elementId: 'item3-price', kind: 'text' },
];

/** ٩. شهادةُ تقدير — إطارٌ مذهّبٌ أفقيٌّ (مستطيلان متداخلان كالتهنئة، بنسبةٍ
 * مختلفة تناسب العرض الأفقيّ) وختمٌ بيضاويٌّ مُدارٌ يتراكب على ركن الإطار
 * الداخليّ بدل أن يسكن داخله — طبقاتٌ متراكبةٌ حقيقيّة، وهي الدورُ الذي لا
 * يظهر في قالب التهنئة المتناظر تمامًا. */
export function createCertificateElements(): DocElement[] {
  return [
    mkShape('frame-outer', 'rect', { x: 0.03, y: 0.04, w: 0.94, h: 0.92, rotation: 0 }, { fillToken: 'ac', radius: 0.01, anim: defaultAnim('fade', 0, 0.5, 'easeOut') }),
    mkShape('frame-inner', 'rect', { x: 0.045, y: 0.06, w: 0.91, h: 0.88, rotation: 0 }, { fillToken: 'bg', radius: 0.005, anim: defaultAnim('fade', 0.1, 0.5, 'easeOut') }),
    mkText('kicker', 'شهادة تقدير', { x: 0.2, y: 0.12, w: 0.6, h: 0.12, rotation: 0 }, { fontSize: 38, weight: 'bold', halign: 'center', valign: 'middle', anim: defaultAnim('fade', 0.2, 0.5, 'easeOut') }),
    mkText('recipient-line', 'يُقدَّم هذا التقدير إلى', { x: 0.25, y: 0.28, w: 0.5, h: 0.05, rotation: 0 }, { fontSize: 15, halign: 'center', valign: 'middle', anim: defaultAnim('fade', 0.3, 0.4, 'easeOut') }),
    mkText('name', 'محمد العبدالله', { x: 0.15, y: 0.35, w: 0.7, h: 0.14, rotation: 0 }, { fontSize: 40, weight: 'bold', color: '#F4D35E', halign: 'center', valign: 'middle', anim: defaultAnim('slide', 0.4, 0.6, 'easeOut') }),
    mkText('body', 'تقديرًا لجهوده المتميّزة وتفانيه في العمل خلال عام ٢٠٢٦', { x: 0.2, y: 0.52, w: 0.6, h: 0.1, rotation: 0 }, { fontSize: 15, halign: 'center', valign: 'middle', anim: defaultAnim('fade', 0.5, 0.5, 'easeOut') }),
    mkShape('signature-line', 'rect', { x: 0.6, y: 0.74, w: 0.2, h: 0.003, rotation: 0 }, { fillToken: 'fg', opacity: 60, anim: defaultAnim('fade', 0.6, 0.4, 'linear') }),
    mkText('signature-label', 'التوقيع', { x: 0.6, y: 0.75, w: 0.2, h: 0.04, rotation: 0 }, { fontSize: 12, halign: 'center', valign: 'middle', anim: defaultAnim('fade', 0.65, 0.4, 'easeOut') }),
    mkShape('seal', 'ellipse', { x: 0.06, y: 0.68, w: 0.16, h: 0.16, rotation: -10 }, { fillToken: 'ac', anim: defaultAnim('pop', 0.55, 0.5, 'back') }),
    mkText('seal-label', 'معتمد', { x: 0.06, y: 0.68, w: 0.16, h: 0.16, rotation: -10 }, { fontSize: 14, weight: 'bold', color: '#1E2A3A', halign: 'center', valign: 'middle', anim: defaultAnim('pop', 0.55, 0.5, 'back') }),
  ];
}

export const CERTIFICATE_SLOTS: TemplateSlot[] = [
  { id: 'slot-kicker', label: 'العنوان', elementId: 'kicker', kind: 'text' },
  { id: 'slot-name', label: 'اسم المُكرَّم', elementId: 'name', kind: 'text' },
  { id: 'slot-body', label: 'نصّ التقدير', elementId: 'body', kind: 'text' },
  { id: 'slot-signature', label: 'توقيع', elementId: 'signature-label', kind: 'text' },
];

/** ١٠. إعلانُ دورةٍ أو ورشة — طبقاتٌ متراكبةٌ غير متناظرة: فقاعةٌ كبيرةٌ خافتةٌ
 * تنزف خارج الحافّة العلويّة، وفقاعةٌ أصغر صلبةٌ فوقها قريبًا من الزاوية نفسها —
 * تراكمٌ حرٌّ لا تماثلٌ، على عكس التهنئة والشهادة. */
export function createEventAdElements(): DocElement[] {
  return [
    mkShape('blob-back', 'ellipse', { x: 0.55, y: -0.25, w: 0.7, h: 0.7, rotation: 0 }, { fillToken: 'ac', opacity: 15, anim: defaultAnim('fade', 0, 0.6, 'easeOut') }),
    mkShape('blob-front', 'ellipse', { x: 0.68, y: 0.5, w: 0.45, h: 0.45, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('pop', 0.15, 0.6, 'back') }),
    mkText('eyebrow', 'ورشة تطوير', { x: 0.06, y: 0.1, w: 0.3, h: 0.07, rotation: 0 }, { fontSize: 19, weight: 'bold', color: '#3867D6', fontFamily: 'Vazirmatn', anim: defaultAnim('fade', 0.2, 0.5, 'easeOut') }),
    mkText('title', 'بناء واجهاتٍ بِريأكت من الصفر', { x: 0.06, y: 0.2, w: 0.52, h: 0.28, rotation: 0 }, { fontSize: 35, weight: 'bold', fontFamily: 'Vazirmatn', anim: defaultAnim('slide', 0.3, 0.6, 'easeOut') }),
    mkText('instructor', 'تقديم: م. فرقةُ الليل', { x: 0.06, y: 0.52, w: 0.5, h: 0.06, rotation: 0 }, { fontSize: 19, weight: 'medium', fontFamily: 'Vazirmatn', anim: defaultAnim('fade', 0.4, 0.5, 'easeOut') }),
    mkShape('date-badge', 'rect', { x: 0.06, y: 0.62, w: 0.26, h: 0.09, rotation: 0 }, { fillToken: 'ac', radius: 0.1, anim: defaultAnim('pop', 0.5, 0.5, 'back') }),
    mkText('date-label', '٥ نوفمبر · ٧ مساءً', { x: 0.06, y: 0.62, w: 0.26, h: 0.09, rotation: 0 }, { fontSize: 15, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', fontFamily: 'Vazirmatn', anim: defaultAnim('pop', 0.5, 0.5, 'back') }),
    mkText('cta', 'سجّل مجّانًا ←', { x: 0.06, y: 0.78, w: 0.3, h: 0.06, rotation: 0 }, { fontSize: 19, weight: 'bold', color: '#3867D6', fontFamily: 'Vazirmatn', anim: defaultAnim('fade', 0.6, 0.4, 'easeOut') }),
  ];
}

export const EVENT_AD_SLOTS: TemplateSlot[] = [
  { id: 'slot-eyebrow', label: 'التصنيف', elementId: 'eyebrow', kind: 'text' },
  { id: 'slot-title', label: 'عنوان الدورة', elementId: 'title', kind: 'text' },
  { id: 'slot-instructor', label: 'المدرّب', elementId: 'instructor', kind: 'text' },
  { id: 'slot-date', label: 'التاريخ والوقت', elementId: 'date-label', kind: 'text' },
  { id: 'slot-cta', label: 'زرّ الدعوة', elementId: 'cta', kind: 'text' },
];

/** ١١. عقارٌ وضيافة — خلفيّةٌ كاملة. صورةٌ تملأ اللوحة حافّةً إلى حافّة (لا نصفًا
 * منها كبطاقة المنتج، بل اللوحة كلّها)، وشارةٌ قُطريّةٌ حقيقيّة (شكلُ `path`
 * ثلاثيٌّ، لا مستطيلٌ مُدار) في الزاوية العلويّة، وشريطٌ سفليٌّ معتمٌ يحمل السعر
 * والعنوان — دورُ الصورة هنا «الخلفيّة كلّها»، وهو دورٌ لا يتكرّر في العشرة
 * السابقة. بُني لمقاس ١٩٢٠×١٠٨٠ (الفراغ العرضيّ الذي لم يكن له قالب). */
export function createPropertyListingElements(): DocElement[] {
  const ribbon: ShapeElement = {
    ...(mkShape('ribbon', 'path', { x: 0.82, y: 0, w: 0.18, h: 0.12, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('pop', 0.1, 0.5, 'back') }) as ShapeElement),
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    closed: true,
  };
  return [
    mkImage('photo', { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, { anim: defaultAnim('fade', 0, 0.6, 'easeOut') }),
    ribbon,
    // **`fontSize` ليس بكسلاتٍ مطلقة، وهذا أصلُ كلّ نصٍّ متراكبٍ في القوالب.**
    // عقدُه مكتوبٌ فوق الحقل في `state/elements.ts:466`: «Reference px against
    // a 1080-wide artboard» — بكسلاتٌ **نسبةً إلى لوحٍ عرضُه ١٠٨٠**، فالنصُّ
    // يكبر مع عرض اللوحة بالتصميم. وتسعةُ مواضعَ في المستودع تحترم الاصطلاحَ
    // نفسَه (المعاينةُ والتصديرُ والتشكيلُ والنصُّ على مسارٍ والتبريرُ
    // والتحجيمُ الذكيّ)، ولهذا لا تختلف الشاشةُ عن الملفّ: النظامُ متّسقٌ،
    // والمخطئُ من يقرأ الرقمَ بكسلًا.
    //
    // وعلى هذا اللوح ١٩٢٠×١٠٨٠ تُضرَب كلُّ قيمةٍ في **١٫٧٧٨**. قيسَ حرفيًّا:
    // `fontSize: 68` رسم **١٢٠٫٨٨px** وارتفاعُ سطرِه **١٣٩px**، فابتلع ثلثَ
    // ارتفاع اللوحة بسطرٍ واحدٍ وتراكب مع سطر الموقع تحته. فالأرقامُ أدناه
    // مقسومةٌ على ١٫٧٧٨ — **مكتوبةٌ بالاصطلاح الصحيح، لا تعويضًا عن عطل**.
    //
    // **والقاعدةُ لمن يُضيف قالبًا:** اكتب الحجمَ الذي تريده بالبكسل ثم اقسمه
    // على (عرضِ لوحك ÷ ١٠٨٠). واللوحُ المربّعُ ١٠٨٠×١٠٨٠ وحده يَقبل الرقمَ كما
    // هو — وتلك الصدفةُ هي ما ضلّل القوالبَ غيرَ المربّعة كلَّها.
    mkText('ribbon-label', 'للبيع', { x: 0.855, y: 0.015, w: 0.12, h: 0.05, rotation: 21 }, { fontSize: 14, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', fontFamily: 'Vazirmatn', anim: defaultAnim('pop', 0.1, 0.5, 'back') }),
    mkShape('panel', 'rect', { x: 0, y: 0.78, w: 1, h: 0.22, rotation: 0 }, { fillToken: 'fg', opacity: 82, anim: defaultAnim('slide', 0.2, 0.5, 'easeOut') }),
    mkText('price', '١٬٢٥٠٬٠٠٠ ريال', { x: 0.06, y: 0.8, w: 0.5, h: 0.08, rotation: 0 }, { fontSize: 38, weight: 'bold', color: '#FFFFFF', fontFamily: 'Vazirmatn', anim: defaultAnim('pop', 0.3, 0.5, 'back') }),
    mkText('address', 'فيلا للبيع · حي النرجس، شمال الرياض', { x: 0.06, y: 0.915, w: 0.55, h: 0.055, rotation: 0 }, { fontSize: 15, weight: 'medium', color: '#FFFFFF', fontFamily: 'Vazirmatn', anim: defaultAnim('fade', 0.4, 0.4, 'easeOut') }),
    mkText('agent', 'عقارات الواجهة · تواصل للاستفسار', { x: 0.62, y: 0.83, w: 0.32, h: 0.14, rotation: 0 }, { fontSize: 12, weight: 'medium', color: '#FFFFFF', halign: 'end', valign: 'middle', fontFamily: 'Vazirmatn', anim: defaultAnim('fade', 0.5, 0.4, 'easeOut') }),
  ];
}

export const PROPERTY_LISTING_SLOTS: TemplateSlot[] = [
  { id: 'slot-ribbon-label', label: 'شارة الزاوية', elementId: 'ribbon-label', kind: 'text' },
  { id: 'slot-price', label: 'السعر', elementId: 'price', kind: 'text' },
  { id: 'slot-address', label: 'الموقع', elementId: 'address', kind: 'text' },
  { id: 'slot-agent', label: 'المُعلِن', elementId: 'agent', kind: 'text' },
  { id: 'slot-photo', label: 'صورة العقار', elementId: 'photo', kind: 'image' },
];

/** ١٢. إعلانٌ مؤسّسيٌّ رسميّ — أشرطةُ خطابٍ لا إطار. شريطٌ علويٌّ وشريطٌ سفليٌّ
 * بعرض اللوحة كاملةً (ترويسةُ الخطاب الرسميّ)، بينهما عمودٌ متمركزٌ: عنوانٌ،
 * خطٌّ فاصل، فقرةٌ، ثم تاريخٌ وتوقيعٌ جنبًا إلى جنب — لا إطار محيطٌ كالتهنئة
 * والشهادة؛ الإيقاعُ هنا أشرطةٌ أفقيّةٌ لا حدودٌ متداخلة. بُني لمقاس A4
 * (٣٠٠ نقطة/بوصة، ٢٤٨٠×٣٥٠٨ — الفراغ المطبوع الذي لم يكن له قالب)، وأحجامُ
 * الخطّ بمقاييس نقطيّةٍ حقيقيّة على هذه الدقّة (العنوانُ ~٢٨pt، الفقرةُ ~١٢pt). */
export function createCorporateNoticeElements(): DocElement[] {
  return [
    mkShape('band-top', 'rect', { x: 0, y: 0, w: 1, h: 0.045, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('fade', 0, 0.4, 'linear') }),
    mkShape('logo-chip', 'rect', { x: 0.08, y: 0.012, w: 0.03, h: 0.021, rotation: 0 }, { fillToken: 'bg', radius: 0.2, anim: defaultAnim('pop', 0.1, 0.4, 'back') }),
    mkText('org-name', 'شركة الأفق للاستشارات', { x: 0.13, y: 0.008, w: 0.5, h: 0.03, rotation: 0 }, { fontSize: 44, weight: 'bold', color: '#FFFFFF', valign: 'middle', anim: defaultAnim('fade', 0.15, 0.4, 'easeOut') }),
    mkText('kicker', 'إعلانٌ رسمي', { x: 0.1, y: 0.13, w: 0.8, h: 0.035, rotation: 0 }, { fontSize: 40, weight: 'medium', halign: 'center', anim: defaultAnim('fade', 0.2, 0.4, 'easeOut') }),
    // صندوقُ العنوان مرتفعٌ عمدًا (٠٫١٨ من ارتفاع الصفحة ≈ ٦٣١px على A4) — قياسٌ
    // واقعيٌّ لثلاثة أسطرَ محتملة بخطّ ٨٤px عريض، لا سطرين مفترَضَين بخطّ ١٠٠px
    // كما كانت المحاولة الأولى: ذاك كان يُخرج السطر الثالث خارج الصندوق فيتراكب
    // مع الفقرة تحته — عيبٌ من فئة «حُشِر البوسترُ في مقاسٍ لا يخصّه» نفسها،
    // مقيسًا هنا بلقطة شاشةٍ فعليّةٍ قبل الإصلاح (انظر تقرير التسليم).
    mkText('title', 'تحديث ساعات العمل الرسمية لعام ٢٠٢٧', { x: 0.08, y: 0.18, w: 0.84, h: 0.18, rotation: 0 }, { fontSize: 84, weight: 'bold', halign: 'center', anim: defaultAnim('slide', 0.3, 0.6, 'easeOut') }),
    mkShape('rule', 'rect', { x: 0.35, y: 0.37, w: 0.3, h: 0.003, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('fade', 0.4, 0.4, 'linear') }),
    mkText(
      'body',
      'تُعلن الإدارة عن تطبيق نظام ساعاتٍ جديد، من الثامنة صباحًا حتى الرابعة مساءً، ابتداءً من مطلع الشهر القادم، ضمن خطّة تحسين الإنتاجية وتوازن الحياة المهنية.',
      { x: 0.1, y: 0.4, w: 0.8, h: 0.18, rotation: 0 },
      { fontSize: 46, weight: 'regular', anim: defaultAnim('fade', 0.5, 0.5, 'easeOut') },
    ),
    mkText('date', 'الرياض، ١ محرم ١٤٤٨هـ', { x: 0.1, y: 0.85, w: 0.35, h: 0.03, rotation: 0 }, { fontSize: 34, weight: 'regular', anim: defaultAnim('fade', 0.6, 0.4, 'easeOut') }),
    mkShape('signature-rule', 'rect', { x: 0.55, y: 0.85, w: 0.25, h: 0.003, rotation: 0 }, { fillToken: 'fg', opacity: 60, anim: defaultAnim('fade', 0.65, 0.4, 'linear') }),
    mkText('signature-label', 'المدير التنفيذي', { x: 0.55, y: 0.858, w: 0.25, h: 0.03, rotation: 0 }, { fontSize: 32, weight: 'medium', halign: 'center', anim: defaultAnim('fade', 0.7, 0.4, 'easeOut') }),
    mkShape('band-bottom', 'rect', { x: 0, y: 0.955, w: 1, h: 0.045, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('fade', 0.1, 0.4, 'linear') }),
    mkText('footer-note', 'جميع الحقوق محفوظة © ١٤٤٨هـ', { x: 0.1, y: 0.962, w: 0.8, h: 0.03, rotation: 0 }, { fontSize: 28, weight: 'medium', color: '#FFFFFF', halign: 'center', valign: 'middle', anim: defaultAnim('fade', 0.2, 0.4, 'easeOut') }),
  ];
}

export const CORPORATE_NOTICE_SLOTS: TemplateSlot[] = [
  { id: 'slot-org-name', label: 'اسم الجهة', elementId: 'org-name', kind: 'text' },
  { id: 'slot-title', label: 'عنوان الإعلان', elementId: 'title', kind: 'text' },
  { id: 'slot-body', label: 'نصّ الإعلان', elementId: 'body', kind: 'text' },
  { id: 'slot-date', label: 'التاريخ', elementId: 'date', kind: 'text' },
  { id: 'slot-signature', label: 'التوقيع', elementId: 'signature-label', kind: 'text' },
];

/** ١٣. خطواتٌ مرقَّمة (كيف تفعل) — سلسلةُ دوائرَ يصلها خطٌّ. ثلاثُ دوائرَ
 * مرقَّمةٍ مرصوفةٍ عموديًّا، كلُّ دائرتين متتاليتين يصل بينهما خطٌّ رأسيٌّ قصير —
 * دورُ الشكل هنا رابطٌ بين بنودٍ متسلسلة، لا رقمٌ معزولٌ ولا شريطُ قياسٍ كما في
 * الإنفوجرافيك. */
export function createHowtoStepsElements(): DocElement[] {
  const step = (idx: number, yTop: number, num: string, title: string, desc: string): DocElement[] => [
    mkShape(`circle${idx}`, 'rect', { x: 0.1, y: yTop, w: 0.15, h: 0.12, rotation: 0 }, { fillToken: 'ac', radius: 0.5, anim: defaultAnim('pop', 0.15 + idx * 0.15, 0.5, 'back') }),
    mkText(`num${idx}`, num, { x: 0.1, y: yTop, w: 0.15, h: 0.12, rotation: 0 }, { fontSize: 52, weight: 'bold', color: '#111111', halign: 'center', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('pop', 0.15 + idx * 0.15, 0.5, 'back') }),
    mkText(`step${idx}-title`, title, { x: 0.3, y: yTop + 0.015, w: 0.62, h: 0.05, rotation: 0 }, { fontSize: 30, weight: 'bold', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.25 + idx * 0.15, 0.4, 'easeOut') }),
    mkText(`step${idx}-desc`, desc, { x: 0.3, y: yTop + 0.068, w: 0.62, h: 0.06, rotation: 0 }, { fontSize: 22, fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.3 + idx * 0.15, 0.4, 'easeOut') }),
  ];
  return [
    mkText('title', 'كيف تحضّر قهوة الفلتر؟', { x: 0.08, y: 0.06, w: 0.84, h: 0.1, rotation: 0 }, { fontSize: 44, weight: 'bold', halign: 'center', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0, 0.5, 'easeOut') }),
    ...step(0, 0.21, '١', 'طحن البنّ', 'اطحن ٢٥ غرامًا من حبوب البنّ طحنًا متوسطًا'),
    mkShape('connector0', 'rect', { x: 0.172, y: 0.33, w: 0.012, h: 0.13, rotation: 0 }, { fillToken: 'ac', opacity: 55, anim: defaultAnim('fade', 0.35, 0.3, 'linear') }),
    ...step(1, 0.46, '٢', 'الصبّ البطيء', 'اسكب الماء الساخن ببطء وعلى دفعاتٍ دائريّة'),
    mkShape('connector1', 'rect', { x: 0.172, y: 0.58, w: 0.012, h: 0.13, rotation: 0 }, { fillToken: 'ac', opacity: 55, anim: defaultAnim('fade', 0.5, 0.3, 'linear') }),
    ...step(2, 0.71, '٣', 'الانتظار والتقديم', 'انتظر أربع دقائق ثمّ قدّم القهوة فورًا'),
  ];
}

export const HOWTO_STEPS_SLOTS: TemplateSlot[] = [
  { id: 'slot-title', label: 'العنوان', elementId: 'title', kind: 'text' },
  { id: 'slot-step0-title', label: 'خطوة ١ — العنوان', elementId: 'step0-title', kind: 'text' },
  { id: 'slot-step0-desc', label: 'خطوة ١ — الوصف', elementId: 'step0-desc', kind: 'text' },
  { id: 'slot-step1-title', label: 'خطوة ٢ — العنوان', elementId: 'step1-title', kind: 'text' },
  { id: 'slot-step1-desc', label: 'خطوة ٢ — الوصف', elementId: 'step1-desc', kind: 'text' },
  { id: 'slot-step2-title', label: 'خطوة ٣ — العنوان', elementId: 'step2-title', kind: 'text' },
  { id: 'slot-step2-desc', label: 'خطوة ٣ — الوصف', elementId: 'step2-desc', kind: 'text' },
];

/** ١٤. قبل وبعد — نصفانِ متقابلانِ بخاتمٍ على الدَّرز. صورتان تتقاسمان اللوحة
 * ٥٠/٥٠ كبطاقة المنتج، لكن الدورَ مختلفٌ تمامًا: كلتاهما صورةٌ (لا نصٌّ مقابل
 * صورة)، وخاتمٌ دائريٌّ يتمركز على خطّ القَسمة نفسه، مستعارًا من استعارة شريط
 * التمرير في تطبيقات المقارنة. */
export function createBeforeAfterElements(): DocElement[] {
  return [
    mkImage('photo-before', { x: 0, y: 0, w: 0.5, h: 1, rotation: 0 }, { anim: defaultAnim('fade', 0, 0.5, 'easeOut') }),
    mkImage('photo-after', { x: 0.5, y: 0, w: 0.5, h: 1, rotation: 0 }, { anim: defaultAnim('fade', 0.1, 0.5, 'easeOut') }),
    mkShape('seam', 'rect', { x: 0.492, y: 0, w: 0.016, h: 1, rotation: 0 }, { fillToken: 'bg', anim: defaultAnim('fade', 0.2, 0.4, 'linear') }),
    mkShape('before-chip', 'rect', { x: 0.04, y: 0.05, w: 0.26, h: 0.08, rotation: 0 }, { fillToken: 'fg', opacity: 80, radius: 0.5, anim: defaultAnim('pop', 0.15, 0.5, 'back') }),
    mkText('before-label', 'قبل', { x: 0.04, y: 0.05, w: 0.26, h: 0.08, rotation: 0 }, { fontSize: 30, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', fontFamily: 'Vazirmatn', anim: defaultAnim('pop', 0.15, 0.5, 'back') }),
    mkShape('after-chip', 'rect', { x: 0.7, y: 0.05, w: 0.26, h: 0.08, rotation: 0 }, { fillToken: 'ac', radius: 0.5, anim: defaultAnim('pop', 0.2, 0.5, 'back') }),
    mkText('after-label', 'بعد', { x: 0.7, y: 0.05, w: 0.26, h: 0.08, rotation: 0 }, { fontSize: 30, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', fontFamily: 'Vazirmatn', anim: defaultAnim('pop', 0.2, 0.5, 'back') }),
    mkShape('badge', 'ellipse', { x: 0.41, y: 0.41, w: 0.18, h: 0.18, rotation: 0 }, { fillToken: 'ac', anim: defaultAnim('pop', 0.3, 0.6, 'back') }),
    mkText('badge-value', '٣٠ يومًا', { x: 0.41, y: 0.41, w: 0.18, h: 0.18, rotation: 0 }, { fontSize: 24, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', fontFamily: 'Vazirmatn', anim: defaultAnim('pop', 0.3, 0.6, 'back') }),
  ];
}

export const BEFORE_AFTER_SLOTS: TemplateSlot[] = [
  { id: 'slot-before-label', label: 'تسمية "قبل"', elementId: 'before-label', kind: 'text' },
  { id: 'slot-after-label', label: 'تسمية "بعد"', elementId: 'after-label', kind: 'text' },
  { id: 'slot-badge-value', label: 'نصّ الخاتم', elementId: 'badge-value', kind: 'text' },
  { id: 'slot-photo-before', label: 'صورة قبل', elementId: 'photo-before', kind: 'image' },
  { id: 'slot-photo-after', label: 'صورة بعد', elementId: 'photo-after', kind: 'image' },
];

/** ١٥. إعلانُ تطبيق — أيقونةٌ وتقييمٌ وبطاقةُ شاشةٍ مائلة. أيقونةٌ دائريّةُ
 * الزوايا أعلى اليسار، تقييمٌ نجميٌّ، ثم بطاقةٌ مستطيلةٌ مُدارةٌ بزاويةٍ صغيرة
 * (محاكاةُ لقطة شاشة طافية، بخطوطِ واجهةٍ داخليّةٍ مُقلَّدة) تتراكب أسفل الوسط —
 * الدورانُ الصغير على بطاقةٍ كبيرةٍ لا على ختمٍ صغير هو ما يجعل هذا التراكب
 * مختلفًا عن طبقات إعلان الدورة. */
export function createAppAdElements(): DocElement[] {
  return [
    mkShape('icon', 'rect', { x: 0.08, y: 0.08, w: 0.2, h: 0.1125, rotation: 0 }, { fillToken: 'ac', radius: 0.28, anim: defaultAnim('pop', 0, 0.5, 'back') }),
    mkText('icon-letter', 'و', { x: 0.08, y: 0.08, w: 0.2, h: 0.1125, rotation: 0 }, { fontSize: 88, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('pop', 0, 0.5, 'back') }),
    mkText('app-name', 'تطبيق وقتي', { x: 0.08, y: 0.225, w: 0.7, h: 0.06, rotation: 0 }, { fontSize: 50, weight: 'bold', fontFamily: "'Readex Pro'", anim: defaultAnim('slide', 0.15, 0.6, 'easeOut') }),
    mkText('tagline', 'نظّم يومك بذكاء، في مكانٍ واحد', { x: 0.08, y: 0.295, w: 0.74, h: 0.08, rotation: 0 }, { fontSize: 26, fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.25, 0.5, 'easeOut') }),
    mkText('rating', '★★★★★ ٤٫٩ من ٥', { x: 0.08, y: 0.385, w: 0.6, h: 0.04, rotation: 0 }, { fontSize: 26, weight: 'medium', fontFamily: "'Readex Pro'", anim: defaultAnim('fade', 0.35, 0.4, 'easeOut') }),
    mkShape('screenshot', 'rect', { x: 0.18, y: 0.48, w: 0.64, h: 0.38, rotation: -6 }, { fillToken: 'bg', radius: 0.06, anim: defaultAnim('slide', 0.3, 0.6, 'easeOut') }),
    mkShape('screenshot-bar', 'rect', { x: 0.22, y: 0.5, w: 0.56, h: 0.025, rotation: -6 }, { fillToken: 'fg', opacity: 15, anim: defaultAnim('fade', 0.4, 0.4, 'linear') }),
    mkShape('screenshot-line1', 'rect', { x: 0.22, y: 0.58, w: 0.5, h: 0.02, rotation: -6 }, { fillToken: 'fg', opacity: 20, anim: defaultAnim('fade', 0.45, 0.4, 'linear') }),
    mkShape('screenshot-line2', 'rect', { x: 0.22, y: 0.63, w: 0.4, h: 0.02, rotation: -6 }, { fillToken: 'fg', opacity: 20, anim: defaultAnim('fade', 0.5, 0.4, 'linear') }),
    mkShape('screenshot-accent', 'rect', { x: 0.22, y: 0.7, w: 0.3, h: 0.05, rotation: -6 }, { fillToken: 'ac', radius: 0.3, anim: defaultAnim('pop', 0.55, 0.5, 'back') }),
    mkShape('cta', 'rect', { x: 0.08, y: 0.88, w: 0.5, h: 0.08, rotation: 0 }, { fillToken: 'ac', radius: 0.5, anim: defaultAnim('pop', 0.6, 0.5, 'back') }),
    mkText('cta-label', 'نزّل الآن', { x: 0.08, y: 0.88, w: 0.5, h: 0.08, rotation: 0 }, { fontSize: 30, weight: 'bold', color: '#FFFFFF', halign: 'center', valign: 'middle', fontFamily: "'Readex Pro'", anim: defaultAnim('pop', 0.6, 0.5, 'back') }),
  ];
}

export const APP_AD_SLOTS: TemplateSlot[] = [
  { id: 'slot-app-name', label: 'اسم التطبيق', elementId: 'app-name', kind: 'text' },
  { id: 'slot-tagline', label: 'الوصف التسويقي', elementId: 'tagline', kind: 'text' },
  { id: 'slot-rating', label: 'التقييم', elementId: 'rating', kind: 'text' },
  { id: 'slot-cta', label: 'زرّ الدعوة', elementId: 'cta-label', kind: 'text' },
  { id: 'slot-icon-letter', label: 'حرف الأيقونة', elementId: 'icon-letter', kind: 'text' },
];

/** تصنيفُ القالب — المُبدِّل الجديد فوق شريط القوالب في شاشة البداية (طلب
 * المالك، ٢٢ أكتوبر ٢٠٢٦: رسمةٌ بخطّ يده فيها مبدّلٌ فوق القوالب، مثالُه
 * الحرفيّ «عروضات خصم»). خمسَ عشرةَ فئةً حقيقية (عشرٌ أصليّة وخمسٌ أُضيفت مع
 * القوالب الخمسة الجديدة في هذا التاريخ نفسه)، لا فئة «عام» تَلتقط الباقي —
 * كلُّ قالبٍ من الستّة عشر يقع في واحدةٍ منها بالضبط، فالمبدِّل مُرشِّحٌ حقيقي
 * لا واجهةٌ تتظاهر بالتصفية بينما كلُّ شيءٍ يسقط في نفس السلّة. */
export type TemplateCategory =
  | 'offers'
  | 'quotes'
  | 'hiring'
  | 'events'
  | 'greetings'
  | 'products'
  | 'stats'
  | 'menus'
  | 'certificates'
  | 'courses'
  | 'realestate'
  | 'corporate'
  | 'howto'
  | 'beforeafter'
  | 'appad';

/** أسماءُ الفئات بالعربي والإنجليزي مباشرةً — نفسُ نمط `PLATFORM_GROUPS` في
 * `src/data/constants.ts`، لا مفاتيحَ جديدة في `Dictionary`: هذه تسمياتُ تصنيفٍ
 * ثابتة، لا نصوصَ واجهةٍ تتفرّع سلوكًا. الخمسُ الأخيرة أُضيفت مع القوالب الخمسة
 * الجديدة — مُذيَّلةٌ هنا لا مُدرجةٌ وسط المصفوف، نفس قاعدة `SIZES`/`PALETTES`. */
export const TEMPLATE_CATEGORIES: { id: TemplateCategory; ar: string; en: string }[] = [
  { id: 'offers', ar: 'عروض وخصومات', en: 'Offers & discounts' },
  { id: 'quotes', ar: 'اقتباسات', en: 'Quotes' },
  { id: 'hiring', ar: 'توظيف', en: 'Hiring' },
  { id: 'events', ar: 'فعاليّات', en: 'Events' },
  { id: 'greetings', ar: 'تهنئة', en: 'Greetings' },
  { id: 'products', ar: 'منتجات', en: 'Products' },
  { id: 'stats', ar: 'إحصائيّات', en: 'Stats' },
  { id: 'menus', ar: 'قوائم طعام', en: 'Menus' },
  { id: 'certificates', ar: 'شهادات', en: 'Certificates' },
  { id: 'courses', ar: 'دورات', en: 'Courses' },
  { id: 'realestate', ar: 'عقار وضيافة', en: 'Real estate & hospitality' },
  { id: 'corporate', ar: 'إعلانٌ مؤسّسي', en: 'Corporate notice' },
  { id: 'howto', ar: 'خطوات', en: 'How-to steps' },
  { id: 'beforeafter', ar: 'قبل وبعد', en: 'Before & after' },
  { id: 'appad', ar: 'إعلان تطبيق', en: 'App ad' },
];

/** قالب جاهز مدمج في التطبيق (لا يأتي من مكتبة المستخدم المحفوظة).
 *
 * `anim` و`selectOnOpen` موجودان لأن فتح قالب يجب أن يسلّم المصمّم مستندًا
 * **جاهزًا للعمل عليه فورًا**: العنوان محدَّد، وحركة الدخول مضبوطة — لا مستندًا
 * صحيحًا لكنه بلا تحديد ولا حركة. */
export interface StarterTemplate {
  id: string;
  /** مفتاح الاسم في `Dictionary` — القوالب المدمجة تُترجَم كبقية الواجهة.
   * `t7`..`t16` هي العشرة المضافة في ٢٢ أكتوبر ٢٠٢٦ — انظر التعليق على
   * `STARTER_TEMPLATES` أدناه. */
  nameKey: 't1' | 't2' | 't3' | 't4' | 't5' | 't6' | 't7' | 't8' | 't9' | 't10' | 't11' | 't12' | 't13' | 't14' | 't15' | 't16';
  /** تصنيفُ مبدِّل القوالب — أُضيف ٢٢ أكتوبر ٢٠٢٦ مع إعادة تصميم شاشة البداية. */
  category: TemplateCategory;
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

/** القوالب المدمجة المعروضة على شاشة البداية. `demo-poster` وحده من القوالب
 * الأصليّة باقٍ كما هو بالحرف — لا تُمسّ هويّتُه (`id`/`elements`/`slots`/
 * `nameKey: 't1'`) لأن `qa/helpers/boot.mjs` يَعتمد عليه بعينه في نحو ثلاثين
 * مواصفة. الخمسةُ التي كانت تشاركه معرّفاتٍ أخرى (`quote`/`hiring`/`product`/
 * `reel`/`tweet`) **حُذفت** ٢٢ أكتوبر ٢٠٢٦: كلّها كانت تنادي
 * `createDemoPosterElements` نفسَها بلوحةٍ مختلفة فقط، لا تنويعًا بنيويًّا
 * حقيقيًّا — ولا مواصفةَ واحدةً كانت تستعمل معرّفاتها (تحقَّقٌ قبل الحذف). محلّها
 * خمسةُ قوالبَ جديدة (`property-listing` حتى `app-ad`، باستعادة مفاتيح الاسم
 * `t2`..`t6`). والعشرةُ الباقية (`offer-split` حتى `event-ad`، ٢٢ أكتوبر ٢٠٢٦)
 * هي التنويع الحقيقي الذي كان مفقودًا أصلًا: كلُّ واحدةٍ من الخمسةَ عشرَ (غير
 * `demo-poster`) دالّةُ بناءٍ مستقلّة ببنية تخطيطٍ مختلفة ومقاسها الخاصّ — انظر
 * التعليق فوق كلّ دالّةٍ منها أعلى هذا الملفّ. */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  { id: 'demo-poster', nameKey: 't1', category: 'offers', paletteIdx: 0, sizeIdx: 0, anim: 'slide', decorAccent: true, selectOnOpen: 'head', elements: createDemoPosterElements, slots: DEMO_POSTER_SLOTS },
  { id: 'property-listing', nameKey: 't2', category: 'realestate', paletteIdx: 3, sizeIdx: 8, anim: 'fade', decorAccent: false, selectOnOpen: 'price', elements: createPropertyListingElements, slots: PROPERTY_LISTING_SLOTS },
  { id: 'corporate-notice', nameKey: 't3', category: 'corporate', paletteIdx: 9, sizeIdx: 12, anim: 'fade', decorAccent: false, selectOnOpen: 'title', elements: createCorporateNoticeElements, slots: CORPORATE_NOTICE_SLOTS },
  { id: 'howto-steps', nameKey: 't4', category: 'howto', paletteIdx: 5, sizeIdx: 6, anim: 'pop', decorAccent: false, selectOnOpen: 'title', elements: createHowtoStepsElements, slots: HOWTO_STEPS_SLOTS },
  { id: 'before-after', nameKey: 't5', category: 'beforeafter', paletteIdx: 1, sizeIdx: 0, anim: 'slide', decorAccent: false, selectOnOpen: 'badge-value', elements: createBeforeAfterElements, slots: BEFORE_AFTER_SLOTS },
  { id: 'app-ad', nameKey: 't6', category: 'appad', paletteIdx: 4, sizeIdx: 4, anim: 'pop', decorAccent: false, selectOnOpen: 'app-name', elements: createAppAdElements, slots: APP_AD_SLOTS },
  { id: 'offer-split', nameKey: 't7', category: 'offers', paletteIdx: 4, sizeIdx: 6, anim: 'slide', decorAccent: false, selectOnOpen: 'headline', elements: createOfferSplitElements, slots: OFFER_SPLIT_SLOTS },
  { id: 'quote-spotlight', nameKey: 't8', category: 'quotes', paletteIdx: 1, sizeIdx: 0, anim: 'fade', decorAccent: false, selectOnOpen: 'quote', elements: createQuoteSpotlightElements, slots: QUOTE_SPOTLIGHT_SLOTS },
  { id: 'hiring-grid', nameKey: 't9', category: 'hiring', paletteIdx: 3, sizeIdx: 3, anim: 'slide', decorAccent: false, selectOnOpen: 'title', elements: createHiringGridElements, slots: HIRING_GRID_SLOTS },
  { id: 'event-ticket', nameKey: 't10', category: 'events', paletteIdx: 2, sizeIdx: 4, anim: 'pop', decorAccent: false, selectOnOpen: 'title', elements: createEventTicketElements, slots: EVENT_TICKET_SLOTS },
  { id: 'occasion-card', nameKey: 't11', category: 'greetings', paletteIdx: 7, sizeIdx: 0, anim: 'fade', decorAccent: false, selectOnOpen: 'greeting', elements: createOccasionCardElements, slots: OCCASION_CARD_SLOTS },
  { id: 'product-card', nameKey: 't12', category: 'products', paletteIdx: 6, sizeIdx: 1, anim: 'slide', decorAccent: false, selectOnOpen: 'name', elements: createProductCardElements, slots: PRODUCT_CARD_SLOTS },
  { id: 'stat-infographic', nameKey: 't13', category: 'stats', paletteIdx: 5, sizeIdx: 6, anim: 'pop', decorAccent: false, selectOnOpen: 'big-stat', elements: createStatInfographicElements, slots: STAT_INFOGRAPHIC_SLOTS },
  { id: 'menu-list', nameKey: 't14', category: 'menus', paletteIdx: 8, sizeIdx: 4, anim: 'fade', decorAccent: false, selectOnOpen: 'header', elements: createMenuListElements, slots: MENU_LIST_SLOTS },
  { id: 'certificate', nameKey: 't15', category: 'certificates', paletteIdx: 0, sizeIdx: 1, anim: 'fade', decorAccent: false, selectOnOpen: 'name', elements: createCertificateElements, slots: CERTIFICATE_SLOTS },
  { id: 'event-ad', nameKey: 't16', category: 'courses', paletteIdx: 9, sizeIdx: 9, anim: 'pop', decorAccent: false, selectOnOpen: 'title', elements: createEventAdElements, slots: EVENT_AD_SLOTS },
];
