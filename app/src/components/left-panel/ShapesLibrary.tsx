import { SHAPE_SECTIONS, tilePathD, type LibraryTile } from '../../lib/shapeFactory';
import { useStudio } from '../../state/StudioContext';

/** عدد الأعمدة في شبكة الأشكال.
 *
 * **أربعة، والسبب قياسيّ لا ذوقيّ.** لوح الأداة الشائعة 348 بكسل وبطاقة الشكل فيه
 * **56×56 بخطوة 64** (`re-canva-flows.md` §2.2). ولوح مزيج أضيق:
 * `clamp(272px, 30vw, 320px)` — فأرضيّته 272، ويبقى بعد الحدّ والحشو ≈250 بكسل.
 * على 250 بكسل:
 *
 * - **أربعة أعمدة** ← `(250 − 3×8) / 4 = 56.5` بكسل للبطاقة، أي **مقاس بطاقة الأداة الشائعة
 *   نفسه تقريبًا بالبكسل**، داخل لوح أضيق بـ78 بكسل.
 * - ثلاثة أعمدة ← 78 بكسل للبطاقة، وهو ليس مقاس بطاقة الشكل عند الأداة الشائعة بل مقاس
 *   بطاقة **الإطارات** (80×80). والأداة الشائعة كبّرت تلك عن قصد: صورة الإطار يجب أن تُقرأ
 *   كـ«حاوية»، أمّا الشكل فيكفيه أن يُقرأ كصيغة (§2.3). فثلاثة أعمدة كانت ستُقلّد
 *   الرقم الخطأ من الوثيقة نفسها.
 *
 * ومكسب ثانٍ: بأربعة أعمدة يصير قسم «الأشكال الأساسية» (أربع بطاقات) **صفًّا واحدًا
 * بالضبط**، وتظهر المكتبة كلّها بلا تمرير — وهو أقرب إلى ما قيس على محرّر فيديو شائع (ثماني
 * بطاقات، صفّ واحد، بلا بحث ولا تمرير ولا فئات فرعية، `re-capcut-flows.md` §2.4)
 * من دوّارة الأداة الشائعة الأفقيّة التي تُخبّئ بقيّة القسم خلف «عرض الكل». وفي لوح بهذا
 * العرض، دوّارة أفقيّة بخمس بطاقات لم تكن لتتّسع أصلًا. */
const COLUMNS = 4;

export function ShapesLibrary() {
  const { state, actions, dict: L } = useStudio();

  return (
    <div style={{ padding: '10px 10px 14px' }}>
      {/* سطر واحد يشرح الإيماءتين. الإيماءتان على سطحين مختلفين (بطاقة/لوحة) فلا
          تتنافسان — انظر تعليق `placeShapeFromLibrary` في `StudioContext.tsx`. */}
      <div style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--muted)', marginBottom: 10 }}>{L.shp_how}</div>

      {SHAPE_SECTIONS.map((section) => (
        <section key={section.titleKey} style={{ marginBottom: 14 }}>
          {/* عنوان القسم `div` لا `button` عن قصد: اختبارات قائمة تنقر
              `button` بنصّ «أشكال» ليصل إلى زرّ شريط الأدوات، فأي زرّ جديد يحمل
              نصًّا مشابهًا كان سيجعل ذلك المُحدِّد ملتبسًا ويُسقط أربع مجموعات. */}
          <div className="mz-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
            {L[section.titleKey as keyof typeof L] as string}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gap: 8 }}>
            {section.tiles.map((tile) => (
              <ShapeTile
                key={tile.id}
                tile={tile}
                armed={state.shapeDrawKind === tile.recipe.kind && (tile.recipe.n === undefined || state.shapeDrawN === tile.recipe.n)}
                label={L[tile.labelKey as keyof typeof L] as string}
                soonLabel={L.soon}
                onPlace={() => actions.placeShapeFromLibrary(tile.recipe)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface ShapeTileProps {
  tile: LibraryTile;
  armed: boolean;
  label: string;
  soonLabel: string;
  onPlace: () => void;
}

function ShapeTile({ tile, armed, label, soonLabel, onPlace }: ShapeTileProps) {
  const soon = tile.status === 'soon';
  return (
    <button
      type="button"
      data-shape-tile={tile.id}
      data-shape-status={tile.status}
      disabled={soon}
      aria-disabled={soon || undefined}
      // الاسم المقروء يُحمَل في `aria-label`/`title` لا في نصّ الزرّ: بطاقة الأداة الشائعة
      // «صيغة مسطّحة صلبة» بلا لون ولا حدّ ولا تسمية مرئيّة — تنقل الهندسة وحدها
      // (`re-canva-flows.md` §2.2) — ويبقى الاسم مع ذلك متاحًا لقارئ الشاشة
      // وللتلميح، فلا تُشترى البساطة البصريّة من حساب الوصوليّة.
      aria-label={soon ? `${label} — ${soonLabel}` : label}
      title={soon ? `${label} — ${soonLabel}` : label}
      onClick={soon ? undefined : onPlace}
      style={{
        position: 'relative',
        aspectRatio: '1',
        display: 'grid',
        placeItems: 'center',
        padding: 6,
        border: `1px solid ${armed && !soon ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 'var(--rs)',
        background: armed && !soon ? 'var(--accentSoft)' : 'var(--surface2)',
        cursor: soon ? 'not-allowed' : 'pointer',
      }}
    >
      {/* صيغة البطاقة المعطَّلة تُخفَت بشدّة لتترك «قريبًا» مقروءة فوقها: وسمٌ
          باهت فوق شكل كامل القتامة كان يُقرأ زخرفةً لا حالة — وقاعدة المشروع أن
          المعطَّل يُقرأ معطَّلًا من نظرة واحدة. */}
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block', opacity: soon ? 0.15 : 1 }} aria-hidden="true">
        <path
          d={tilePathD(tile.recipe)}
          // الخطّ (مسار مفتوح) يُرسَم بحدٍّ لا بتعبئة، وإلا ظهر الخطّ بطاقةً فارغة.
          fill={tile.recipe.kind === 'line' ? 'none' : 'currentColor'}
          stroke={tile.recipe.kind === 'line' ? 'currentColor' : 'none'}
          strokeWidth={tile.recipe.kind === 'line' ? 8 : 0}
          strokeLinecap="round"
          style={{ color: armed && !soon ? 'var(--accentText)' : 'var(--text)' }}
        />
      </svg>
      {soon && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--muted)',
          }}
        >
          {soonLabel}
        </span>
      )}
    </button>
  );
}
