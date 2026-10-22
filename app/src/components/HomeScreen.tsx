import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ICONS, PALETTES, PLATFORM_GROUPS, SIZES, START_FORMATS, dimsOf, glyphStyle, nameOf, sizeAt, sizeIdxOf, type Palette, type SizePreset } from '../data/constants';
import { STARTER_TEMPLATES } from '../lib/starterTemplates';
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
 * ========================================================================== */

type MediumFilter = 'all' | 'still' | 'timed';

const ROW_H = 40; // خطوة الصفّ المقيسة في منتقي الأداة الشائعة — `re-canva-flows.md` §1.4.

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
        color: timed ? 'var(--accent)' : 'var(--muted)',
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
export function ArtboardThumb({ size, palette, elements, decorAccent, lang, w, h, radius = 5 }: { size: SizePreset; palette: Palette; elements: DocElement[]; decorAccent: boolean; lang: Lang; w: number; h: number; radius?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const key = JSON.stringify([size.id, size.w, size.h, palette.bg, palette.ac, elements, decorAccent, lang]);

  useEffect(() => {
    let dead = false;
    let objUrl: string | null = null;
    // مقياسٌ يكفي صندوقَ المصغّرة على شاشةٍ مضاعفةِ الكثافة فقط، بنفس حساب
    // `ExportDialog.tsx` حرفيًّا — لا دقّةُ تصديرٍ كاملة لسطحٍ بهذا الصغر.
    const scale = Math.min(1, (Math.max(w, h) * 2) / Math.max(size.w, size.h));
    renderArtboardPng({ size, palette, elements, transparent: false, scale, lang, decorAccent })
      .then((blob) => {
        if (dead) return;
        objUrl = URL.createObjectURL(blob);
        setUrl(objUrl);
      })
      .catch(() => {
        if (!dead) setUrl(null);
      });
    return () => {
      dead = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <span style={{ width: w, height: h, flex: 'none', borderRadius: radius, background: palette.bg, position: 'relative', overflow: 'hidden', display: 'block' }}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
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

  /** اسمُ المنصّة لمعرّف مقاس — من `PLATFORM_GROUPS` نفسِها التي تجمّع أهدافَ
   * التصدير في `ExportDialog.tsx`، لا جدولٌ ثانٍ. */
  const platformNameOf = (id: string): string | null => {
    const g = PLATFORM_GROUPS.find((g) => g.sizeIds.includes(id));
    return g ? (state.lang === 'ar' ? g.ar : g.en) : null;
  };

  /** عنوانُ مجموعةٍ فوق أوّل صفٍّ من كلّ بُعدٍ **يتكرّر** في `rows` الحاليّة —
   * القائمةُ نفسُها والعددُ نفسُه لم يتغيّرا (كلُّ صفٍّ يبقى عنصره وزرّه
   * و`data-testid`ه بالحرف، فلا ينكسر ما ينقر `format-row-ig-reel` أو
   * `format-row-snap` أو `format-row-tt` بعينه، ولا ما يَعُدّ عناصر
   * `format-row-*` ليُثبت أن التصفية مُرشِّحٌ لا بوّابة §1.4). العنوانُ طبقةُ
   * عرضٍ فوق الصفوف القائمة، لا بديلٌ عنها: «١٠٨٠×١٩٢٠» مرّةً واحدة، وأسماءُ
   * المنصّات التي تتشارك البُعد قريبةً منها — وهو طلبُ المالك حرفًا، محقَّقًا
   * بلا حذف صفّ. */
  const dimGroupHeaderAt = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.z.w}x${r.z.h}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const headers = new Map<number, { dims: string; platforms: string }>();
    rows.forEach((r, i) => {
      const k = `${r.z.w}x${r.z.h}`;
      if ((counts.get(k) ?? 0) <= 1 || seen.has(k)) return;
      seen.add(k);
      const members = rows.filter((x) => `${x.z.w}x${x.z.h}` === k);
      const platforms = Array.from(new Set(members.map((m) => platformNameOf(m.z.id)).filter((p): p is string => !!p)));
      headers.set(i, { dims: dimsOf(r.z), platforms: platforms.join(' · ') });
    });
    return headers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state.lang]);

  // تفاصيل بطاقة المتابعة من **الحالة الحيّة**، لا من لقطةٍ تُؤخَذ عند الإقلاع:
  // البطاقة تصف المشروع الذي سيفتحه النقر عليها فعلًا. ولقطةٌ مجمّدة كانت تكذب
  // بالضبط في الحالة الشائعة: من يبدأ مشروعًا جديدًا ثم يرجع إلى الشاشة كان يقرأ
  // وصف المشروع السابق على بطاقةٍ تفتح المشروع الجديد.
  const openSize = sizeAt(state.sizeIdx, state.customW, state.customH);
  const openElementCount = state.elements.length;
  const openArtboardCount = state.artboards.length;

  const mediumTabs: Array<{ id: MediumFilter; label: string }> = [
    { id: 'all', label: L.h_medium_all },
    { id: 'still', label: L.h_medium_still },
    { id: 'timed', label: L.h_medium_timed },
  ];

  return (
    <div data-testid="start-screen" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '40px 48px 60px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
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

        {/* ===== الفعل الأساسي المهيمن: ابدأ من فراغ =====
            مهيمنٌ بالمساحة عن قصد، كزر «إنشاء مشروع» في محرّر الفيديو الشائع. وبإطارٍ منقّط،
            كبطاقة «Start From Scratch» في إكسبرس. نقرةٌ واحدة، بلا أي قرار: يفتح
            فارغًا بالمقاس الحالي — وأبعاده مكتوبة على البطاقة فلا تكون مفاجأة.

            ولاحِظ أنه ليس فرعًا منافسًا للقائمة أسفله: **كل** صفّ في تلك القائمة
            يفتح فارغًا أيضًا، لأن المستند الافتتاحي صار فارغًا فعلًا. فالفرق أن
            هذه البطاقة لا تطلب حتى اختيار وجهة. ومن هنا جاء أن القوالب — وحدها —
            هي ما يُحضر محتوى، وهي مفصولةٌ في قسمها أسفل الشاشة (محرّر الفيديو الشائع §1.6:
            المشروع الفارغ والقوالب وجهتان منفصلتان تمامًا، لا تُخلَطان). */}
        <button
          data-testid="start-blank"
          data-size-id={sizeAt(state.sizeIdx, state.customW, state.customH).id}
          onClick={() => (state.sizeIdx < 0 ? actions.startBlankCustom(state.customW, state.customH) : actions.startBlank(state.sizeIdx))}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            // ١٤٠px هو ارتفاع زر «إنشاء مشروع» المقيس في محرّر الفيديو الشائع (§1.1). والارتفاع
            // مقصودٌ لا تجميلي: مساحة هذه البطاقة (٨٦٠×١٤٠ ≈ 120,400px²) تتجاوز
            // مساحة صفوف القوالب الستّة مجتمعةً (≈102,240px²) — وهي نفس الحجّة
            // التي تجعل فعل محرّر الفيديو الشائع الأساسي لا لبسَ فيه (159,600 مقابل 95,316).
            minHeight: 140,
            padding: '0 22px',
            border: '2px dashed var(--accent)',
            borderRadius: 'var(--r)',
            background: 'var(--surface)',
            color: 'var(--text)',
            textAlign: 'start',
          }}
        >
          <span style={{ width: 46, height: 46, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '50%', background: 'var(--accentSoft)', color: 'var(--accent)' }}>
            <Icon size={22} strokeWidth={2} path="M10 4v12M4 10h12" />
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 800, fontSize: 19 }}>{L.h_blank}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{L.h_blank_hint}</span>
          </span>
          <span dir="ltr" style={{ flex: 'none', fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{dimsOf(sizeAt(state.sizeIdx, state.customW, state.customH))}</span>
        </button>

        {/* ===== المُنتقي: بحث ← مقاس مخصص مثبَّت ← مُرشِّح ← قائمة واحدة ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            ref={searchRef}
            data-testid="format-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L.h_search_ph}
            style={{ height: 44, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, outline: 0, boxShadow: 'var(--shadow)' }}
          />

          {/* «مقاس مخصص» مثبَّتٌ تحت البحث مباشرةً وفوق القائمة — لا مدفونًا في
              ذيلها. هذا موضعه المقيس في الأداة الشائعة (§1.4، البند ٢): مخرج الخبير على
              مرمى نظرة، ولا يكلّف المبتدئ شيئًا. ولا يختفي مع المُرشِّح ولا مع
              البحث، فهو ليس صفًّا من القائمة. */}
          <div
            data-testid="custom-size-row"
            style={{ display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)' }}
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
                    background: on ? 'var(--surface)' : 'transparent',
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
              «مقترح» وصفوفٌ مرتّبة (§1.4، البند ٣). */}
          <div className="mz-label" style={{ marginTop: 6 }}>{L.h_suggested}</div>

          {rows.length === 0 ? (
            // سطرٌ صريح داخل القائمة، لا لوحٌ فارغ — كما تفعل الأداة الشائعة بنصّها
            // «No results found for …» (§1.4، البند ١).
            <div data-testid="format-no-results" style={{ padding: '14px 12px', fontSize: 13, color: 'var(--muted)' }}>{L.h_no_results(query)}</div>
          ) : (
            <div data-testid="format-list" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', overflow: 'hidden' }}>
              {rows.map((r, i) => {
                const header = dimGroupHeaderAt.get(i);
                return (
                <div key={r.z.id} style={{ display: 'contents' }}>
                {header && (
                  // عنوانُ عرضٍ فوق الصفّ، لا صفٌّ جديد: لا `data-testid="format-row-…"`
                  // فلا يُحتسَب في عدّادات `format-row-*` ولا يُنقَر كهدف.
                  <div
                    data-testid={`format-group-${header.dims.replace(/\s|×/g, 'x')}`}
                    style={{ padding: '10px 12px 2px', borderTop: i === 0 ? 0 : '1px solid var(--line)', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'baseline', gap: 8 }}
                  >
                    <span dir="ltr" style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{header.dims}</span>
                    {header.platforms && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{header.platforms}</span>}
                  </div>
                )}
                <button
                  data-testid={`format-row-${r.z.id}`}
                  data-medium={r.z.kind}
                  data-w={r.z.w}
                  data-h={r.z.h}
                  onClick={() => actions.startBlank(r.idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    height: ROW_H,
                    flex: 'none',
                    padding: '0 12px',
                    border: 0,
                    borderTop: i === 0 || header ? 0 : '1px solid var(--line)',
                    background: 'transparent',
                    color: 'var(--text)',
                    textAlign: 'start',
                  }}
                >
                  {/* الأيقونة الصدارية تحمل نسبة الأبعاد الحقيقية للمقاس — فهي
                      تؤدّي عملَ التصنيف الذي كانت ستؤدّيه العناوين (§1.4). */}
                  <span style={{ width: 20, height: 20, flex: 'none', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
                    <span style={glyphStyle(r.z, 15)} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(r.z, state.lang)}</span>
                  <MediumBadge kind={r.z.kind} label={r.z.kind === 'timed' ? L.h_timed : L.h_still} />
                  {/* الأبعادُ تُحذَف من الصفّ حين تظهر فوقه في عنوان المجموعة —
                      لا تتكرّر مرّتين على ارتفاع ٤٠px. */}
                  {!header && <span dir="ltr" style={{ flex: 'none', fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 76, textAlign: 'end' }}>{dimsOf(r.z)}</span>}
                </button>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== القوالب: الوجهة الوحيدة التي تُحضر محتوى جاهزًا =====
            مفصولةٌ عن كل ما سبق وآخرُ الشاشة. وهنا يسكن البوستر التجريبي الآن: كان هو
            المستند الافتتاحي، فصار قالبًا يُطلَب. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mz-label">{L.templates}</div>
          {/* صفوفٌ مُدمَجة بمصغّرة صغيرة، لا شبكةُ بطاقاتٍ كبيرة بمعاينات ٤:٣.
              سببان:
              (١) الهيمنة البصرية: الشاشة يجب أن يكون فيها **فعل أساسي واحد
                  مهيمن** (محرّر الفيديو الشائع §1.1)، وهو «ابدأ من فراغ». وستُّ بطاقاتٍ ملوّنة
                  كبيرة كانت تثقل أسفل الشاشة حتى تطغى على المسار الفارغ — أي
                  إعادةُ العيب الأصلي بصورةٍ أخرى: المحتوى الجاهز يتصدّر.
              (٢) الصدق: الستّة كلها بنيةُ البوستر التجريبي نفسها بلوحةٍ ومقاسٍ مختلفين،
                  فمعاينةٌ ضخمة لكلٍّ منها تُوهم بتنويعٍ غير موجود. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
            {STARTER_TEMPLATES.map((tp) => {
              const pal = PALETTES[tp.paletteIdx];
              const size = SIZES[tp.sizeIdx];
              return (
                <button
                  key={tp.id}
                  data-testid={`starter-${tp.id}`}
                  data-size-id={size.id}
                  onClick={() => actions.startFromStarter(tp.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, height: ROW_H, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface)', textAlign: 'start', color: 'var(--text)' }}
                >
                  <ArtboardThumb size={size} palette={pal} elements={tp.elements()} decorAccent={tp.decorAccent} lang={state.lang} w={34} h={26} />
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{L[tp.nameKey]}</span>
                  <MediumBadge kind={size.kind} label={size.kind === 'timed' ? L.h_timed : L.h_still} />
                  <span dir="ltr" style={{ flex: 'none', fontSize: 10.5, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{dimsOf(size)}</span>
                </button>
              );
            })}
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
  );
}
