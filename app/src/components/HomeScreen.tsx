import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ICONS, PALETTES, SIZES, START_FORMATS, dimsOf, glyphStyle, nameOf, sizeAt, sizeIdxOf, type Palette, type SizePreset } from '../data/constants';
import { STARTER_TEMPLATES, TEMPLATE_CATEGORIES, type TemplateCategory } from '../lib/starterTemplates';
import { renderArtboardPng } from '../lib/exportArtboard';
import { useStudio } from '../state/StudioContext';
import type { DocElement } from '../state/elements';
import type { Lang } from '../i18n/strings';

/* ============================================================================
 * شاشة البداية — «يفتح على سؤال، لا على مستند»
 *
 * ثلاثة نماذج مقيسة على ثلاثة برامج، وثلاثة أجوبة متناقضة لسؤالٍ واحد. هذا ما
 * أُخذ وما رُفض، وليُقرأ هذا التعليق قبل تعديل ترتيب هذه الشاشة:
 *
 * ١) **الأداة الشائعة** (`re-canva-flows.md` §1.4–§1.5): تفتح على سؤال — حقل بحث مُركَّز
 *    تلقائيًا، «تخصيص الحجم» مثبَّتٌ تحته مباشرة، ثم قائمة **واحدة مسطّحة مرتّبة**
 *    (~٤٥ صفًّا بخطوة ٤٠px تحت عنوان واحد «مقترح»)، **وصفوف الفيديو مُشرَّبة بين
 *    الصور كصفوفٍ عادية** في المواضع ٤ و١١ و١٦ و١٨ — لا قسمَ فيديو منفصلًا، ولا
 *    سؤال «صورة أم فيديو» إطلاقًا. النوع يُقرأ من الاسم والأيقونة فقط.
 * ٢) **المزوّد الكبير إكسبرس** (`re-illustrator-flows.md` §1.5): لا تسأل شيئًا، لكنها تفتح
 *    على مستند **فارغ** ٤٠٠×٦٠٠ — و«ابدأ من فراغ» أول بطاقة في الشريط **بإطار
 *    منقّط** يميّزها عن كل قالبٍ جانبها.
 * ٣) **محرّر الفيديو الشائع** (`re-capcut-flows.md` §1.2 و§1.5): **لا تسأل عن النسبة إطلاقًا**.
 *    المشروع يبدأ `Original/Adapted/30fps` ويتكيّف مع أول وسيطٍ يُستورَد، والنسبة
 *    تُغيَّر لاحقًا من شريط المشغّل ومن إعدادات المشروع. وشاشة البيت فيها **فعل
 *    أساسي واحد مُهيمن**: زر «إنشاء مشروع» ١١٤٠×١٤٠ — أكبر من البطاقات الأربع
 *    مجتمعةً (159,600px² مقابل 95,316px²).
 *
 * **ما أُخذ.** بنية الأداة الشائعة: قائمة واحدة مسطّحة مرتّبة، والفيديو مُشرَّبٌ فيها
 * كصفوفٍ عادية، والبحث مُركَّزٌ تلقائيًا، و«مقاس مخصص» مثبَّتٌ تحته. ومن إكسبرس:
 * «ابدأ من فراغ» أولًا بإطارٍ منقّط. ومن محرّر الفيديو الشائع: فعلٌ أساسيٌّ واحد مهيمن بصريًا،
 * وقابلية التراجع عن الاختيار.
 *
 * **ما رُفض، وهو الأهم: لم نجعل «صورة أم فيديو» بوّابةً من زرّين.** طلب المالك
 * السؤال صراحةً، فله جوابٌ صريح — لكن ليس كبوّابة. السبب أن البرامج الثلاثة كلها
 * تتجنّب البوّابة، وكلٌّ بطريقته، والبوّابة هي أقلّ الخيارات قابليةً للتراجع:
 * قرارٌ يجب أن يصيبه قبل أن يرى الصيغ أصلًا، ثم يُعيد البدء إن أخطأ. وفوق ذلك
 * فالبوّابة سؤالٌ زائد: «ريل إنستقرام» **هو** الجواب على السؤالين معًا — يختار
 * وجهةً، فتأتي الطبيعة (ثابت/مُوقَّت) معها مجانًا.
 *
 * فالجواب هنا **مُرشِّح لا بوّابة**: شريط (الكل · صورة · فيديو) فوق القائمة،
 * افتراضه «الكل»، يضيّقها ولا يحجبها. ومعه — وهذا شرطٌ لا تنازل عنه — **كل صفّ
 * يحمل طبيعته بنفسه**: أيقونة فيلم/صورة ونصّ «فيديو»/«صورة» وأبعاده، فلا يحتاج
 * المصمّم أن يستنتج من الاسم ولا أن يتذكّر مُرشِّحًا فعّله.
 *
 * وقابلية التراجع مضمونة فعليًا لا وعدًا: المقاس يُغيَّر داخل المحرّر من
 * `ArtboardSizeMenu`، و`SizePreset.kind` مشتقٌّ من المقاس — فتبديل المقاس يقلب
 * الطبيعة، بلا بدءٍ من جديد. هذا هو درس محرّر الفيديو الشائع مُطبَّقًا.
 *
 * ---------------------------------------------------------------------------
 * **نقضٌ صريحٌ بتاريخ ٢٢ أكتوبر ٢٠٢٦** لقرار قسم «القوالب» وحده (لا لبقيّة ما
 * فوق): قرارُ ١٨ أكتوبر كان صفوفًا مُدمَجة بمصغّرة صغيرة، بحجّتين: (أ) الهيمنة
 * البصرية لصالح «ابدأ من فراغ»، و(ب) أن الستّة قوالب كانت كلّها بنية البوستر
 * التجريبي نفسها بلوحةٍ مختلفة، فمعاينةٌ ضخمة كانت ستُوهم بتنويعٍ غير موجود.
 *
 * الحجّة (ب) سقطت فعليًّا: صار في المكتبة عشرةُ قوالبَ (`offer-split` حتى
 * `event-ad`، ٢٢ أكتوبر) ببنى تخطيطٍ مختلفة فعلًا — لا نسخةٌ من بوستر «رواق»
 * بأرقامٍ مختلفة. فالمعاينة الضخمة الآن تُوهم بتنويعٍ **موجود**، لا مزيَّف.
 * والمالك طلب صراحةً اليوم (رسمةٌ بخطّ يده) قوالبَ كبيرة في شريطٍ يُمرَّر
 * سَحبًا، مع مبدِّل تصنيفٍ فوقها، ومقاساتٍ تحتها كلٌّ بمثالٍ بنسبته الحقيقية.
 *
 * الحجّة (أ) بقيت، لكن حلّها تغيَّر: الهيمنةُ الآن **بالارتفاع والتمييز** لا
 * بالمساحة المطلقة — «ابدأ من فراغ» عمودٌ طويلٌ بإطارٍ منقّط يمتدّ بكامل ارتفاع
 * الشبكة المجاورة له (`alignItems: 'stretch'`)، تمامًا كرسمة المالك. فالنقض
 * يخصّ **طريقة** الهيمنة لا **وجودها**.
 * ========================================================================== */

type MediumFilter = 'all' | 'still' | 'timed';
type CategoryFilter = 'all' | TemplateCategory;

/** عرضُ بطاقة القالب في الشريط الأفقي المُمرَّر — كبيرةٌ قصدًا (قرار ٢٢ أكتوبر):
 * أكبر من أربعة أمثال مساحة الصفّ القديم (٤٠px ارتفاعًا)، لأن معاينةً حقيقية
 * تحتاج بكسلاتٍ فعلية لتُقرأ، لا شريط أيقونةٍ. */
const TEMPLATE_CARD_W = 180;
const TEMPLATE_THUMB_H = 144;

/** أقصى بُعدٍ لمربّع نسبة المقاس أسفل الشاشة — كبيرٌ بما يكفي ليُقرأ شكله
 * فعلًا (البند ٣ في طلب المالك)، لا أيقونةً ١٥px كما كانت.
 *
 * رُفع من ٥٦ إلى ٧٢ في ٢٣ أكتوبر: بعد تجميعِ المقاسات بالبُعد صارت البطاقاتُ ثمانيًا
 * لا ثلاثةَ عشرَ، فاتّسع عرضُ كلِّ واحدةٍ وصار المربّعُ الصغيرُ يَسبح في فراغها. */
const SIZE_GLYPH_M = 96;

/** هل يطابق المقاس نصّ البحث؟ يطابق الاسم العربي والإنجليزي والمعرّف والأبعاد،
 * لأن المصمّم قد يكتب «ستوري» أو «reel» أو «1920» وكلّها نوايا صحيحة. */
function matches(z: SizePreset, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return (
    z.ar.toLowerCase().includes(needle) ||
    z.en.toLowerCase().includes(needle) ||
    z.id.toLowerCase().includes(needle) ||
    `${z.w}`.includes(needle) ||
    `${z.h}`.includes(needle) ||
    `${z.w}x${z.h}`.includes(needle.replace(/[×\s]/g, 'x'))
  );
}

/** شارة الطبيعة — تظهر على **كل** صفّ، لا على المُوقَّت وحده: «صورة» معلومةٌ
 * بقدر «فيديو»، وإظهار إحداهما فقط يجعل الأخرى استنتاجًا من الغياب. */
function MediumBadge({ kind, label }: { kind: 'still' | 'timed'; label: string }) {
  const timed = kind === 'timed';
  return (
    <span
      data-medium={kind}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 20,
        padding: '0 7px',
        flex: 'none',
        borderRadius: 999,
        background: timed ? 'var(--accentSoft)' : 'var(--surface2)',
        color: timed ? 'var(--accentText)' : 'var(--muted)',
        fontSize: 10.5,
        fontWeight: 600,
      }}
    >
      <Icon size={11} path={timed ? ICONS.video : ICONS.image} />
      {label}
    </span>
  );
}

/** مصغّرةٌ حقيقية — نفسُ مسار `renderArtboardPng` الذي يكتب الملفّ النهائي
 * ويُغذّي معاينةَ `ExportDialog.tsx` الحيّة بعينه، لا رسمًا موازيًا. البطاقتان
 * اللتان تستهلكانها (صفُّ القوالب، وبطاقةُ المتابعة) كانت كلٌّ منهما تُظهر صندوقَ
 * لونٍ زخرفيًّا ثابتًا — دائرةٌ في الزاوية لا تمثّل محتوى العنصر الحقيقي. والآن
 * كلُّ بطاقةٍ تعرض ما سيُفتَح/يُستأنَف فعلًا، بأبعادها الصغيرة نفسها (لا تُغيَّر
 * المقاساتُ ولا الهيمنةُ البصريّة المقصودة في §القوالب أدناه).
 *
 * **وعند التعذّر لا يُخترَع شيء** (نفسُ عقد `ExportDialog`): يبقى لون اللوحة
 * وحده — لا تصميمٌ كاذب — وهو ما تَراه أثناء التصيير أيضًا، لا حالةَ فشلٍ
 * مختلفة. */
/** مثالُ المقاس في بطاقة البُعد — «كلٌّ بمثالٍ كبير» كما في رسمة المالك. كان
 * مستطيلًا رماديًّا فارغًا بنسبة المقاس فقط (جولة ٢٤ أكتوبر ٢٠٢٦). الآن: إن كان
 * بين القوالب قالبٌ بهذا البُعد فمعاينتُه الحقيقيّة، وإلا فتخطيطٌ تمثيليّ — عنوانٌ
 * وأسطرٌ ومساحةُ صورة — يقرأ منه المصمّم كيف يُملأ هذا الإطار. الصندوق الخارجيّ
 * يحمل `data-ratio-glyph` ونسبتَه الحقيقيّة كما كان، فيبقى ما يقيسه
 * `qa/start-screen.spec.mjs` هو نفسه. */
function SizeExample({ z, lang }: { z: SizePreset; lang: Lang }) {
  const box = glyphStyle(z, SIZE_GLYPH_M);
  const w = Number.parseFloat(String(box.width));
  const h = Number.parseFloat(String(box.height));
  const tp = STARTER_TEMPLATES.find((t) => SIZES[t.sizeIdx].w === z.w && SIZES[t.sizeIdx].h === z.h);
  // مرّةً لكلّ قالب: الباني يولّد معرّفاتِ مفاتيحَ جديدة في كلّ نداء، فبدون هذا
  // تُعاد المصغّرة مع كلّ إعادة تصيير للشاشة.
  const elements = useMemo(() => tp?.elements() ?? [], [tp]);
  const wide = z.w / z.h > 1.2;
  return (
    <span data-ratio-glyph="1" style={{ ...box, border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden', position: 'relative', background: 'var(--surface2)', boxSizing: 'border-box' }}>
      {tp ? (
        <ArtboardThumb size={SIZES[tp.sizeIdx]} palette={PALETTES[tp.paletteIdx]} elements={elements} decorAccent={tp.decorAccent} lang={lang} w={w - 2} h={h - 2} radius={0} fit="cover" />
      ) : (
        <span aria-hidden style={{ position: 'absolute', inset: '12%', display: 'flex', flexDirection: wide ? 'row' : 'column', gap: '8%' }}>
          <span style={{ flex: wide ? '0 0 42%' : '0 0 46%', borderRadius: 3, background: 'var(--accentSoft)' }} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
            <span style={{ height: 5, width: '80%', borderRadius: 3, background: 'var(--accent)' }} />
            <span style={{ height: 3, width: '100%', borderRadius: 2, background: 'var(--line)' }} />
            <span style={{ height: 3, width: '65%', borderRadius: 2, background: 'var(--line)' }} />
          </span>
        </span>
      )}
    </span>
  );
}

export function ArtboardThumb({ size, palette, elements, decorAccent, lang, w, h, radius = 5, fit = 'contain' }: { size: SizePreset; palette: Palette; elements: DocElement[]; decorAccent: boolean; lang: Lang; w: number; h: number; radius?: number; fit?: 'contain' | 'cover' }) {
  const [url, setUrl] = useState<string | null>(null);
  const key = JSON.stringify([size.id, size.w, size.h, palette.bg, palette.ac, elements, decorAccent, lang]);

  // الرابطُ السابق لا يُلغى إلا بعد أن يحلّ محلّه الجديد: إلغاؤه في تنظيف المؤثّر
  // كان يترك `<img>` يشير إلى blob ميّت للحظة، فيسجّل المتصفّح ERR_FILE_NOT_FOUND.
  const shownRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (shownRef.current) URL.revokeObjectURL(shownRef.current);
  }, []);
  useEffect(() => {
    let dead = false;
    let objUrl: string | null = null;
    // مقياسٌ يكفي صندوقَ المصغّرة على شاشةٍ مضاعفةِ الكثافة فقط، بنفس حساب
    // `ExportDialog.tsx` حرفيًّا — لا دقّةُ تصديرٍ كاملة لسطحٍ بهذا الصغر.
    const scale = Math.min(1, (Math.max(w, h) * 2) / Math.max(size.w, size.h));
    renderArtboardPng({ size, palette, elements, transparent: false, scale, lang, decorAccent, placeholders: 'block' })
      .then((blob) => {
        if (dead) return;
        objUrl = URL.createObjectURL(blob);
        const prev = shownRef.current;
        shownRef.current = objUrl;
        setUrl(objUrl);
        if (prev) window.setTimeout(() => URL.revokeObjectURL(prev), 1000);
      })
      .catch(() => {
        if (!dead) setUrl(null);
      });
    return () => {
      dead = true;
      // رابطٌ وُلد بعد أن تقرّر الاستغناء عنه لم يُعرض قطّ، فيُلغى فورًا.
      if (objUrl && objUrl !== shownRef.current) URL.revokeObjectURL(objUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    // `contain` افتراضيًّا: بطاقةُ القالب كانت `cover` فتقصّ التصميم — «إعلان رسمي»
    // (A4) يظهر بلا عنوانه، و«عقار» (١٠٨٠×١٩٢٠) شريطًا أبيض من وسطه. المصمّم
    // يختار القالب بما يراه، فالمعاينة تُريه التصميمَ كاملًا على أرضيّةٍ محايدة.
    <span style={{ width: w, height: h, flex: 'none', borderRadius: radius, background: fit === 'cover' ? palette.bg : 'var(--surface2)', position: 'relative', overflow: 'hidden', display: 'block' }}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', filter: fit === 'contain' ? 'drop-shadow(0 1px 3px rgba(0,0,0,.18))' : 'none' }} />}
    </span>
  );
}

export function HomeScreen() {
  const { state, actions, dict: L } = useStudio();
  const [query, setQuery] = useState('');
  // مُرشِّحُ شاشة البداية، وهو **كمّيةٌ أخرى** غير `DocSnapshot.medium`: هذا حالةُ
  // عرضٍ محليّةٌ تُضيّق قائمةً واحدة، وذاك صفةُ مستندٍ تُحفَظ ويتفرّع عليها ثلاثةُ
  // أسطح. والاسمُ مُفرَّقٌ صراحةً كي لا يَخلِط بينهما قارئٌ ولا `grep`.
  const [mediumFilter, setMediumFilter] = useState<MediumFilter>('all');
  // مُرشِّحُ القوالب — طلبُ المالك الصريح اليوم: «مبدّل فوق [القوالب] مثلًا
  // عروضات خصم ومن ذا النوع». كمّيةٌ ثالثةٌ مستقلّة عن `mediumFilter` (الذي
  // يُصفّي المقاسات لا القوالب) وعن `DocSnapshot.medium` — ثلاثُ تصفياتٍ، كلٌّ
  // على محورٍ مختلف تمامًا، فلا تتقاطع أسماؤها عمدًا.
  const [templateCategory, setTemplateCategory] = useState<CategoryFilter>('all');
  const [customW, setCustomW] = useState(state.customW);
  const [customH, setCustomH] = useState(state.customH);
  const searchRef = useRef<HTMLInputElement>(null);

  // البحث هو الأداة الأساسية لا القائمة، ولذلك يُركَّز تلقائيًا: في منتقي الأداة الشائعة
  // حقل البحث هو `document.activeElement` لحظة الفتح (`re-canva-flows.md` §1.4).
  // فمن يعرف ما يريد يكتبه فورًا، ومن لا يعرف يقرأ القائمة — ولا أحد يدفع ثمن
  // الآخر.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  /** القائمة المسطّحة المرتّبة: ترتيب `START_FORMATS` (لا ترتيب `SIZES`، فذاك
   * مقيَّد بثبات الفهرس)، مُرشَّحةً بالنصّ والطبيعة. */
  const rows = useMemo(
    () =>
      START_FORMATS.map((id) => ({ idx: sizeIdxOf(id), z: SIZES[sizeIdxOf(id)] }))
        .filter((r) => r.idx >= 0 && r.z)
        .filter((r) => (mediumFilter === 'all' ? true : r.z.kind === mediumFilter))
        .filter((r) => matches(r.z, query)),
    [query, mediumFilter],
  );

  /** **المقاساتُ مجموعةً بالبُعد، لا صفًّا لكلِّ منصّة.**
   *
   * شكوى المالك الحرفيّة: «المقاسات فيه أشياء كثير نفس المقاس… تجمعها، تخلّي
   * المقاس واضح، وتحته توضّح إنه للمنصّات الفلانيّة». وهو محقّ عدديًّا: **ستٌّ من
   * الثلاثةَ عشرَ** مواصفةً أبعادُها `1080×1920` بالحرف (تيك توك · ستوري إنستقرام ·
   * ريل · شورت يوتيوب · سناب شات · حالة واتساب)، فكانت الشبكةُ تعرض **ستَّ بطاقاتٍ
   * متطابقةَ الشكل** يختلف فيها الاسمُ وحدَه — وهو تكرارٌ يُثقل القراءةَ ولا يُضيف
   * خيارًا، لأنّ اللوحَ الناتجَ واحدٌ في الحالات الستّ.
   *
   * فالعنوانُ صار **البُعدَ** (`١٠٨٠ × ١٩٢٠`)، والمنصّاتُ صارت رقائقَ تحته.
   *
   * **ولم تُدمَج الرقائقُ في زرٍّ واحد، وهذا هو القرارُ المهمّ هنا.** فالمواصفاتُ
   * المتشاركةُ في البُعد **لا تتشارك `kind`**: `ig-story` صورةٌ و`ig-reel` فيديو
   * وبُعدُهما واحد، و`kind` يحدّد وجودَ الخطّ الزمنيّ في المشروع. فدمجُها في زرٍّ
   * واحدٍ كان سيُجبرني على اختيارٍ نيابةً عن المصمّم بين لوحٍ ثابتٍ ولوحٍ مُوقَّت —
   * اختيارٌ لا يملكه الكود. فكلُّ رقاقةٍ تبقى زرَّها الخاصّ بشارة طبيعتها، وهذا نفسُه
   * جوابُ شقِّ طلبه الآخر: «وخيار جنبها فيديو أو صورة».
   *
   * والترتيبُ ترتيبُ أوّلِ ظهورٍ في `rows` — أي ترتيبُ `START_FORMATS` — فلا يُعيد
   * التجميعُ ترتيبَ شيء.
   */
  const dimGroups = useMemo(() => {
    const byDim = new Map<string, { key: string; w: number; h: number; members: typeof rows }>();
    for (const r of rows) {
      const key = `${r.z.w}x${r.z.h}`;
      const g = byDim.get(key);
      if (g) g.members.push(r);
      else byDim.set(key, { key, w: r.z.w, h: r.z.h, members: [r] });
    }
    return [...byDim.values()];
  }, [rows]);

  /** القوالب المُصفّاة بالتصنيف المختار — «الكل» الافتراضي، فلا يُحجَب
   * `starter-demo-poster` ولا أيّ قالبٍ آخر عن أيّ مواصفةٍ تنقره مباشرةً من دون
   * اختيار تصنيفٍ أولًا (`qa/helpers/boot.mjs` ونحوه). */
  const filteredTemplates = useMemo(() => STARTER_TEMPLATES.filter((tp) => templateCategory === 'all' || tp.category === templateCategory), [templateCategory]);
  // عناصرُ كلّ قالبٍ مرّةً واحدة: الباني يولّد معرّفاتِ مفاتيحَ جديدة في كلّ نداء، فكان
  // كلُّ تصييرٍ للشاشة يعيد رسم المصغّرات الستَّ عشرة من الصفر.
  const templateElements = useMemo(() => new Map(STARTER_TEMPLATES.map((tp) => [tp.id, tp.elements()])), []);

  // تفاصيل بطاقة المتابعة من **الحالة الحيّة**، لا من لقطةٍ تُؤخَذ عند الإقلاع:
  // البطاقة تصف المشروع الذي سيفتحه النقر عليها فعلًا. ولقطةٌ مجمّدة كانت تكذب
  // بالضبط في الحالة الشائعة: من يبدأ مشروعًا جديدًا ثم يرجع إلى الشاشة كان يقرأ
  // وصف المشروع السابق على بطاقةٍ تفتح المشروع الجديد.
  const openSize = sizeAt(state.sizeIdx, state.customW, state.customH);
  const openElementCount = state.elements.length;
  // المكتبةُ تُقرأ كلَّما ظهرت الشاشة: الرجوعُ من المحرّر يُري المشروعَ الذي حُفظ للتوّ.
  useEffect(() => {
    void actions.refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const now = Date.now();
  const others = state.projects.filter((p) => !(state.openDoc === 'open' && p.id === state.projectId));
  const openArtboardCount = state.artboards.length;

  const mediumTabs: Array<{ id: MediumFilter; label: string }> = [
    { id: 'all', label: L.h_medium_all },
    { id: 'still', label: L.h_medium_still },
    { id: 'timed', label: L.h_medium_timed },
  ];

  // تبويباتُ مبدِّل القوالب: «الكل» (تُعيد `L.h_medium_all` نفسها، فلا حاجة
  // لمفتاح ترجمةٍ جديد لنصٍّ موجودٍ أصلًا) ثم العشرة من `TEMPLATE_CATEGORIES`.
  const categoryTabs: Array<{ id: CategoryFilter; label: string }> = [
    { id: 'all', label: L.h_medium_all },
    ...TEMPLATE_CATEGORIES.map((c) => ({ id: c.id as CategoryFilter, label: state.lang === 'ar' ? c.ar : c.en })),
  ];

  return (
    <div data-testid="start-screen" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '40px 48px 60px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-.01em' }}>{L.h_greet}</h1>

        {/* بطاقة المتابعة، فوق كل شيء وقبل المُنتقي. العائد الذي يريد أن يُكمل
            عمله لا يُسأل عن مقاسٍ اختاره في الجلسة السابقة؛ نقرةٌ واحدة تعيده إلى
            مستنده بعينه. وتُعرَض فقط حين يكون هناك مشروعٌ مفتوح فعلًا
            (`openDoc === 'open'`: استُرجع من القرص أو بدأه في هذه الجلسة) — لا
            كصفٍّ دائم يكون فارغًا في أول تشغيل. */}
        {state.openDoc === 'open' && (
          <button
            data-testid="resume-project"
            data-size-id={openSize.id}
            data-element-count={openElementCount}
            onClick={actions.resumeOpenProject}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 14,
              border: '1px solid var(--accent)',
              borderRadius: 'var(--r)',
              background: 'var(--accentSoft)',
              color: 'var(--text)',
              textAlign: 'start',
              boxShadow: 'var(--shadow)',
            }}
          >
            {/* المصغّرة تتبع المستند الحقيقيّ — رسمٌ حقيقيٌّ بـ`renderArtboardPng`
                (`ArtboardThumb` أعلاه)، لا صندوقَ لونٍ ودائرة زخرفيّة ثابتة. وإلا
                لقالت البطاقة «لوحة فاضية» وأرَت مصغّرةً فيها شيء. */}
            <ArtboardThumb size={openSize} palette={PALETTES[state.postPalette] ?? PALETTES[0]} elements={state.elements} decorAccent={state.decorAccent} lang={state.lang} w={52} h={52} radius={10} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{L.h_resume}</span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>{nameOf(openSize, state.lang)}</span>
                <span dir="ltr">{dimsOf(openSize)}</span>
                <MediumBadge kind={openSize.kind} label={openSize.kind === 'timed' ? L.h_timed : L.h_still} />
                <span>{openElementCount === 0 ? L.h_resume_blank : L.h_elements(openElementCount)}</span>
                {openArtboardCount > 1 && (
                  <>
                    <span>·</span>
                    <span>{L.h_artboards(openArtboardCount)}</span>
                  </>
                )}
              </span>
            </span>
            <span style={{ flex: 'none', height: 34, padding: '0 16px', borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 700, fontSize: 13, display: 'grid', placeItems: 'center' }}>{L.h_resume_cta}</span>
          </button>
        )}

        {/* **مشاريعك** — كلُّ مشروعٍ في ملفّه (`persist.ts`)، فالمشروعُ الجديد لا يمسح ما قبله،
            وما قبله يُفتح من هنا بنقرة. المفتوحُ الآن في البطاقة أعلاه، فلا يتكرّر هنا. */}
        {others.length > 0 && (
          <section data-testid="project-library" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{L.h_projects}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {others.map((p) => {
                const size = sizeAt(p.sizeIdx, p.customW, p.customH);
                return (
                  <button
                    key={p.id}
                    data-testid={`project-${p.id}`}
                    onClick={() => void actions.openProject(p.id)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text)', textAlign: 'start' }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{nameOf(size, state.lang)}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span dir="ltr">{dimsOf(size)}</span>
                      <span>{L.h_elements(p.elementCount)}</span>
                      {p.updatedAt > 0 && <span>·</span>}
                      {p.updatedAt > 0 && <span>{L.h_project_age(now - p.updatedAt)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* صندوق نيّة مِزو — موجود أصلًا ويعمل (`startFromPrompt`)، وهو نظير صندوق
            النيّة النصّي في شاشة بيت محرّر الفيديو الشائع (§1.1، المنطقة ٣). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 54, padding: '0 8px 0 10px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--rs) + 6px)', boxShadow: 'var(--shadow)' }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', position: 'relative', display: 'block', flex: 'none' }}>
            <span style={{ position: 'absolute', left: 9, top: 12, width: 3, height: 3, borderRadius: '50%', background: 'var(--onAccent)' }} />
            <span style={{ position: 'absolute', right: 9, top: 12, width: 3, height: 3, borderRadius: '50%', background: 'var(--onAccent)' }} />
            <span style={{ position: 'absolute', left: 11, right: 11, top: 16, height: 5, borderBottom: '1.5px solid var(--onAccent)', borderRadius: '0 0 6px 6px' }} />
          </span>
          <input
            value={state.homePrompt}
            onChange={(e) => actions.setHomePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') actions.startFromPrompt();
            }}
            placeholder={L.h_prompt_ph}
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 0, fontSize: 14 }}
          />
          <button onClick={actions.startFromPrompt} style={{ height: 36, padding: '0 18px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 600, fontSize: 13 }}>{L.start}</button>
        </div>

        {/* ===== العمودُ المهيمن «ابدأ من فراغ» إلى جانب الشبكة =====
            رسمةُ المالك بخطّ يده (٢٢ أكتوبر ٢٠٢٦): عمودٌ طويلٌ يمتدّ بكامل
            ارتفاع الشبكة المجاورة له، لا بطاقةٌ عريضة فوقها. `alignItems:
            'stretch'` هو ما يصنع الامتداد فعليًا: ارتفاع الزرّ يصبح ارتفاع أطول
            عمودٍ في الصفّ (عمود المحتوى)، بلا رقمٍ مكتوبٍ باليد قد ينفصل عنه
            لاحقًا. الهيمنةُ الآن بالارتفاع والتمييز (إطارٌ منقّط، أيقونة، نصٌّ
            أكبر) بدل المساحة المطلقة — انظر النقض المسجَّل في رأس الملف.

            ولاحِظ أنه ليس فرعًا منافسًا لما بجانبه: **كل** قالبٍ وكل مقاسٍ في
            الشبكة يفتح فارغًا أيضًا من حيث المستند؛ الفرق أن هذه البطاقة لا
            تطلب حتى اختيار وجهة — نقرةٌ واحدة بلا أي قرار. */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 16 }}>
          <button
            data-testid="start-blank"
            data-size-id={sizeAt(state.sizeIdx, state.customW, state.customH).id}
            onClick={() => (state.sizeIdx < 0 ? actions.startBlankCustom(state.customW, state.customH) : actions.startBlank(state.sizeIdx))}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              // من الأعلى لا من المنتصف: العمودُ بطول الشبكة كلّها (رسمة المالك)،
              // فكان زرُّه في منتصفه يقع تحت حافّة الشاشة الأولى. يبقى العمود كما
              // رُسم، ويلتصق محتواه بأعلى ما يظهر منه أثناء التمرير.
              justifyContent: 'flex-start',
              flex: '0 0 208px',
              padding: '36px 18px',
              border: '2px dashed var(--accent)',
              borderRadius: 'var(--r)',
              background: 'var(--surface)',
              color: 'var(--text)',
              textAlign: 'center',
            }}
          >
            <span style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
              <span style={{ width: 52, height: 52, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '50%', background: 'var(--accentSoft)', color: 'var(--accentText)' }}>
                <Icon size={24} strokeWidth={2} path="M10 4v12M4 10h12" />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 19 }}>{L.h_blank}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{L.h_blank_hint}</span>
              </span>
              <span dir="ltr" style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{dimsOf(sizeAt(state.sizeIdx, state.customW, state.customH))}</span>
            </span>
          </button>

          <div data-testid="start-content" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* ===== القوالب: بطاقاتٌ كبيرة في شريطٍ أفقيٍّ يُمرَّر سَحبًا =====
                مفصولةٌ عن المقاسات أسفلها. مبدِّلُ التصنيف فوقها طلبٌ صريحٌ من
                المالك اليوم («مبدّل فوق [القوالب] مثلًا عروضات خصم») — انظر
                `TEMPLATE_CATEGORIES` في `starterTemplates.ts`. وهنا يسكن
                البوستر التجريبي: كان المستند الافتتاحي، فصار قالبًا يُطلَب. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="mz-label">{L.templates}</div>

              {/* شريطٌ يُمرَّر سَحبًا، لا صفًّا ثابتًا — نفس اتّجاه `overflowX`
                  الذي تستعمله `medium-filter` لو زاد عدد شرائحها، وهنا مُستغَلٌّ
                  لمحتوى البطاقات نفسه لا لأشرطة التبويب فقط. */}
              {/* الاسمُ «template-categories» لا «template-category-…» عمدًا: لو
                  شارك جذرَ `template-category-{id}` لوقع في عدّادات
                  `[data-testid^="template-category-"]` بالخطأ، كما وقع فعليًا
                  حين جُرِّبت الشاشة قبل هذا الاسم. */}
              <div data-testid="template-categories" role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {categoryTabs.map((c) => {
                  const on = templateCategory === c.id;
                  return (
                    <button
                      key={c.id}
                      role="tab"
                      aria-selected={on}
                      data-testid={`template-category-${c.id}`}
                      onClick={() => setTemplateCategory(c.id)}
                      style={{
                        flex: 'none',
                        whiteSpace: 'nowrap',
                        height: 30,
                        padding: '0 14px',
                        border: 0,
                        borderRadius: 999,
                        background: on ? 'var(--accent)' : 'var(--surface2)',
                        color: on ? 'var(--onAccent)' : 'var(--muted)',
                        fontSize: 12.5,
                        fontWeight: on ? 700 : 500,
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>

              {/* الشريط الأفقي — كلُّ بطاقةٍ تعرض المعاينة الحقيقية عبر
                  `ArtboardThumb` (مسار `renderArtboardPng` نفسه، لا مُصيِّرٌ
                  ثانٍ)، بحجمٍ كبيرٍ يُقرَأ فعلًا لا شريط أيقونةٍ ٣٤×٢٦. كلُّ
                  تصنيفٍ في `TEMPLATE_CATEGORIES` يحمل قالبًا واحدًا على الأقل،
                  فهذا الشريط لا يفرغ أبدًا — ولذلك بلا فرع «لا نتائج». */}
              <div data-testid="template-strip" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
                {filteredTemplates.map((tp) => {
                  const pal = PALETTES[tp.paletteIdx];
                  const size = SIZES[tp.sizeIdx];
                  return (
                    <button
                      key={tp.id}
                      data-testid={`starter-${tp.id}`}
                      data-size-id={size.id}
                      data-category={tp.category}
                      onClick={() => actions.startFromStarter(tp.id)}
                      style={{ display: 'flex', flexDirection: 'column', flex: 'none', width: TEMPLATE_CARD_W, border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--surface)', textAlign: 'start', color: 'var(--text)' }}
                    >
                      <ArtboardThumb size={size} palette={pal} elements={templateElements.get(tp.id) ?? []} decorAccent={tp.decorAccent} lang={state.lang} w={TEMPLATE_CARD_W} h={TEMPLATE_THUMB_H} radius={0} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{L[tp.nameKey]}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MediumBadge kind={size.kind} label={size.kind === 'timed' ? L.h_timed : L.h_still} />
                          <span dir="ltr" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{dimsOf(size)}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ===== المُنتقي: بحث ← مقاس مخصص مثبَّت ← مُرشِّح ← شبكة أمثلةٍ كبيرة ===== */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                ref={searchRef}
                data-testid="format-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={L.h_search_ph}
                style={{ height: 44, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, outline: 0, boxShadow: 'var(--shadow)' }}
              />

              {/* «مقاس مخصص» مثبَّتٌ تحت البحث مباشرةً وفوق القائمة — لا مدفونًا
                  في ذيلها. هذا موضعه المقيس في الأداة الشائعة (§1.4، البند ٢): مخرج
                  الخبير على مرمى نظرة، ولا يكلّف المبتدئ شيئًا. ولا يختفي مع
                  المُرشِّح ولا مع البحث، فهو ليس صفًّا من القائمة. */}
              {/* `flexWrap` لا `nowrap` ثابتًا — صفُّ المقاس المخصّص يحمل أيقونةً
                  وتسميةً وحقلين وزرًّا بعرضٍ أدنى ثابت، وعلى عمودٍ ضيّقٍ (٦٤٠–
                  ٧٠٠px، حيث يضيق عمودُ المحتوى نفسُه لصالح عمود «ابدأ من فراغ»
                  الطويل) كان الزرّ يخرج عن حدود الصفّ بلا تمريرٍ يبلغه — قيسَ:
                  `البند ٥` في `parity-four.spec.mjs` أسقط `home-custom-start`
                  بإحداثياتٍ سالبة. والالتفافُ يبقي كلَّ عنصرٍ داخل عرض العمود
                  مهما ضاق، بسطرٍ ثانٍ عند اللزوم لا بقصٍّ غيرِ مرئي. */}
              <div
                data-testid="custom-size-row"
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, minHeight: 52, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' }}
              >
                <span style={{ width: 22, height: 22, flex: 'none', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
                  <Icon size={16} path={ICONS.resize} />
                </span>
                <span style={{ fontWeight: 600, fontSize: 13, flex: 'none' }}>{L.custom_size}</span>
                {/* زوج الأرقام وحده هو `dir="ltr"` (العرض ثم الارتفاع، وهو ترتيب
                    يُقرأ من اليسار في كل اللغات)، أمّا الزرّ فخارج هذا الزوج ليبقى
                    في ترتيبه المنطقي داخل الصفّ العربي: التسمية ثم الحقلان ثم الفعل.
                    لو بقي داخل الزوج لظهر — بقراءةٍ من اليمين — **قبل** الحقلين
                    اللذين يعمل عليهما. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginInlineStart: 'auto' }} dir="ltr">
                  <input
                    type="number"
                    min={1}
                    value={customW}
                    data-testid="home-custom-w"
                    onChange={(e) => setCustomW(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                    style={{ width: 72, height: 30, border: '1px solid var(--line)', borderRadius: 'calc(var(--rs) - 2px)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, padding: '0 8px' }}
                  />
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>×</span>
                  <input
                    type="number"
                    min={1}
                    value={customH}
                    data-testid="home-custom-h"
                    onChange={(e) => setCustomH(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                    style={{ width: 72, height: 30, border: '1px solid var(--line)', borderRadius: 'calc(var(--rs) - 2px)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, padding: '0 8px' }}
                  />
                </div>
                <button
                  data-testid="home-custom-start"
                  onClick={() => actions.startBlankCustom(customW, customH)}
                  style={{ height: 30, padding: '0 14px', flex: 'none', border: 0, borderRadius: 'calc(var(--rs) - 2px)', background: 'var(--accent)', color: 'var(--onAccent)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  {L.h_custom_start}
                </button>
              </div>

              {/* شريط «صورة أم فيديو» — جوابُ سؤال المالك، مُرشِّحًا لا بوّابةً.
                  انظر التعليق الطويل في رأس الملف. */}
              <div data-testid="medium-filter" role="tablist" style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 'var(--rs)', background: 'var(--surface2)', alignSelf: 'flex-start' }}>
                {mediumTabs.map((t) => {
                  const on = mediumFilter === t.id;
                  return (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={on}
                      data-testid={`medium-tab-${t.id}`}
                      onClick={() => setMediumFilter(t.id)}
                      style={{
                        height: 30,
                        padding: '0 16px',
                        border: 0,
                        borderRadius: 'calc(var(--rs) - 2px)',
                        background: on ? 'var(--seg)' : 'transparent',
                        color: on ? 'var(--text)' : 'var(--muted)',
                        fontSize: 12.5,
                        fontWeight: on ? 700 : 500,
                        boxShadow: on ? '0 1px 2px rgba(0,0,0,.10)' : 'none',
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* العنوان الوحيد في القائمة كلها. الأداة الشائعة حلّت مشكلة التجميع بالترتيب لا
                  بالتصنيف: لا «تسويق» ولا «مناسبات» ولا «مكتبي» — عنوانٌ واحد
                  «مقترح» وبطاقاتٌ مرتّبة (§1.4، البند ٣). */}
              <div className="mz-label" style={{ marginTop: 6 }}>{L.h_suggested}</div>

              {rows.length === 0 ? (
                // سطرٌ صريح داخل القائمة، لا لوحٌ فارغ — كما تفعل الأداة الشائعة بنصّها
                // «No results found for …» (§1.4، البند ١).
                <div data-testid="format-no-results" style={{ padding: '14px 12px', fontSize: 13, color: 'var(--muted)' }}>{L.h_no_results(query)}</div>
              ) : (
                // شبكةُ أمثلةٍ كبيرة، لا عمودًا بارتفاعٍ ثابت ٤٠px (نقضُ ١٨
                // أكتوبر، انظر رأس الملف): كلُّ **بُعدٍ** مستطيلٌ يحمل نسبته
                // الحقيقية (`glyphStyle`، أكبر بأكثر من ٤ أمثال من الأيقونة
                // ١٥px القديمة) ومعه بُعدُه عنوانًا ومنصّاتُه رقائقَ تحته.
                //
                // و`alignItems: 'start'` مقصودة: بدونها تمطّ الشبكةُ كلَّ بطاقةٍ إلى
                // ارتفاع أطولِ بطاقةٍ في صفّها، فتصير بطاقةُ «١٠٨٠×١٠٨٠» ذاتُ
                // الرقاقةِ الواحدة فراغًا أبيضَ بارتفاع بطاقةِ «١٠٨٠×١٩٢٠» ذاتِ
                // الستِّ رقائق. و`minHeight` على البطاقة نفسِها تحفظ الأرضيّة.
                <div data-testid="format-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(236px,1fr))', alignItems: 'start', gap: 12 }}>
                  {dimGroups.map((g) => (
                    <div
                      key={g.key}
                      data-testid={`dim-card-${g.key}`}
                      data-w={g.w}
                      data-h={g.h}
                      data-members={g.members.length}
                      // `minHeight` ١٢٠ أرضيّةٌ مقصودة: البطاقةُ ذاتُ الرقاقةِ الواحدة
                      // (A4 مثلًا) محتواها ٥٥px فكانت ستُرسَم ثُلثَ جارتِها ذاتِ الستّ
                      // رقائق، فتبدو الشبكةُ مهترئة. والرقمُ هو نفسُه حدُّ التأكيد في
                      // `qa/start-screen.spec.mjs` — ثلاثةُ أمثالِ صفِّ ١٨ أكتوبر.
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, minHeight: 120, boxSizing: 'border-box', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)' }}
                    >
                      {/* مربّعُ النسبة — مُعرَّفٌ بـ`data-ratio-glyph` لا بـ`data-testid`
                          عمدًا: أيّ اسمٍ يبدأ بـ«dim-card-» أو «format-row-» كان
                          سيدخل في عدّادات `qa/start-screen.spec.mjs` التي تعدّ
                          البطاقاتَ والمواصفاتِ ذاتها — وقد وقع هذا فعليًا حين جُرِّب
                          `data-testid="format-row-glyph"` في نسخةٍ سابقة. وسِمةٌ
                          مستقلّةٌ أمتنُ من `querySelector('span > span')` الذي كان
                          يصطاد أوّلَ تعشيشٍ في البطاقة أيًّا كان. */}
                      <span style={{ flex: 'none', width: SIZE_GLYPH_M, height: SIZE_GLYPH_M, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <SizeExample z={g.members[0].z} lang={state.lang} />
                      </span>

                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* البُعدُ هو العنوان الآن — بارزًا ومقروءًا، لا سطرًا
                            رماديًّا ١٠٫٥px أسفل اسمِ منصّةٍ واحدةٍ من ستّ. */}
                        <span dir="ltr" style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2, fontVariantNumeric: 'tabular-nums', alignSelf: 'flex-start' }}>
                          {dimsOf(g.members[0].z)}
                        </span>

                        {/* المنصّاتُ تحته — رقائقُ قابلةٌ للنقر، كلٌّ بشارةِ طبيعتها،
                            فيبقى اختيارُ «صورة أم فيديو» بيد المصمّم لا بيد الكود. */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {g.members.map((r) => (
                            <button
                              key={r.z.id}
                              data-testid={`format-row-${r.z.id}`}
                              data-medium={r.z.kind}
                              data-w={r.z.w}
                              data-h={r.z.h}
                              title={`${nameOf(r.z, state.lang)} — ${dimsOf(r.z)}`}
                              onClick={() => actions.startBlank(r.idx)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', height: 28, padding: '0 9px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--surface2)', color: 'var(--text)', fontSize: 11.5, fontWeight: 600 }}
                            >
                              {/* أيقونةُ الطبيعة **هي** شارةُ الطبيعة على الرقاقة،
                                  وتحمل `data-medium` لذلك: الشرطُ القديم «كلُّ صفٍّ
                                  يحمل شارتَه الخاصّة ولا يحتاج المُرشِّحَ ليُفهَم»
                                  باقٍ كما هو، وقد صغُر حجمُ حامله فقط. */}
                              <span data-medium={r.z.kind} style={{ display: 'inline-flex', flex: 'none' }}>
                                <Icon size={11} path={r.z.kind === 'timed' ? ICONS.video : ICONS.image} />
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(r.z, state.lang)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* القاعدة الصارمة: ما لا يعمل يظهر معطّلًا بوسم «قريبًا»، لا حيًّا
                قابلًا للنقر. والمحفوظ على القرص اليوم **مشروع واحد** (خانة حفظ
                تلقائي واحدة في `persist.ts`)، فلا توجد «مشاريع أخيرة» بصيغة
                الجمع — وقائمةٌ كهذه كانت ستكون تاريخًا ملفَّقًا. وقد كانت كذلك
                فعلًا: ثلاثة أسماء وثلاثة أوقات مكتوبة في الكود («قبل ساعتين»،
                «أمس»، «قبل 3 أيام») لا تمثّل أي ملفٍ حقيقي — أُزيلت، وحلّت محلّها
                بطاقة المتابعة أعلى الشاشة، وهي تقرأ المشروع المحفوظ فعلًا. */}
            <div
              data-testid="projects-soon"
              aria-disabled="true"
              style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 12px', border: '1px dashed var(--line)', borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', cursor: 'not-allowed', opacity: 0.75 }}
            >
              <Icon size={15} path={ICONS.folder} />
              <span style={{ fontSize: 12.5, flex: 1 }}>{L.h_projects_soon}</span>
              <span style={{ flex: 'none', height: 20, padding: '0 8px', borderRadius: 999, background: 'var(--surface2)', fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{L.soon}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
