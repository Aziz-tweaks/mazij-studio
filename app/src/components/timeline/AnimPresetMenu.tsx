import type { AnimPreset } from '../../state/elements';
import { useStudio } from '../../state/StudioContext';

const PRESETS: AnimPreset[] = ['none', 'fade', 'slide', 'pop'];

/** حركة الدخول للطبقة المحدَّدة، في رأس الخط الزمني.
 *
 * لماذا هنا وليس في لوحة الخصائص: الأنماط الجاهزة كانت موجودة في `PropsTab` لكن
 * مشروطةً بـ`el.id === 'head'` — وهو معرّفٌ لا يوجد إلا في البوستر التجريبي الجاهز. فأي
 * عنصر يُنشئه المستخدم (معرّفه `text-<طابع زمني>`) لم يكن له **أي** مدخل إلى حركة
 * دخول إطلاقًا، في حين أن تلميح الخط الزمني نفسه كان يُحيل المستخدم إلى لوحة
 * التصميم ليجد فيها ما ليس فيها. والموضع الصحيح — كما قيس في محرّر فيديو شائع
 * (`re-capcut-flows.md` §3.7/§3.8) — هو سطحٌ **مربوط بالتحديد** لا بنوع العنصر:
 * `Animation` تبويبٌ ثابت عبر كل الأنواع لأن الحركة خاصيّة عامّة لا نوعية.
 *
 * ويبقى اللوح غير فارغ أبدًا (§3.7): بلا تحديدٍ يُقرأ تلميحٌ يقول ما يلزم فعله،
 * وليس فراغًا ولا زرًّا معطَّلًا بلا سبب. */
export function AnimPresetMenu() {
  const { state, actions, dict: L } = useStudio();
  const el = state.elements.find((e) => e.id === state.sel) ?? null;

  if (!el) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.tl_simple_hint}</span>;

  return (
    <div data-testid="anim-preset-menu" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.entrance}</span>
      <div style={{ display: 'flex', padding: 2, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
        {PRESETS.map((p) => {
          const active = el.anim.preset === p;
          return (
            <button
              key={p}
              data-testid={`anim-preset-${p}`}
              data-active={active}
              onClick={() => actions.setElementAnimPreset(el.id, p)}
              style={{
                height: 22,
                padding: '0 9px',
                border: 0,
                borderRadius: 'calc(var(--rs) - 2px)',
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--muted)',
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                boxShadow: active ? '0 1px 2px rgba(0,0,0,.1)' : 'none',
              }}
            >
              {L[`anim_${p}` as const]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
