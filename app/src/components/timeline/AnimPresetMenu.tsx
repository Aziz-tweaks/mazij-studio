import type { AnimPreset } from '../../state/elements';
import { ANIM_PRESETS, hasCustomAnimation, motionTracks } from '../../state/elements';
import { useStudio } from '../../state/StudioContext';

const PRESETS: AnimPreset[] = ANIM_PRESETS;

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

  /** **الحرسُ معلَنٌ على السطح لا مكتومٌ في النموذج.**
   *
   * `withPreset` تُعيد بناءَ `tracks` كلّها من زوج `keyframes` القديم، فمسارُ `x`
   * أو `rotation` بُني باليد كان يُباد بنقرةٍ واحدةٍ بلا تحذير. والنموذجُ يَرفض
   * الآن (انظر `withPreset` في `StudioContext.tsx`)، **ورفضٌ صامتٌ زرٌّ ميت** —
   * فالأزرارُ معطَّلةٌ وتلميحُها يقول السببَ وما يُزيله. وهي القاعدةُ نفسُها التي
   * تَجعل المؤشّرةَ `not-allowed` على حافّةِ مقطعٍ مقفول: الممنوعُ يقول ذلك
   * **قبل** أن تحاوله. */
  // و«الظهور» خارجَ السؤال: توقيتُ الكلمات لا يمسّه النمط (`withPreset`)، فلا يحجبه.
  const blocked = hasCustomAnimation(motionTracks(el.anim.tracks), el.anim.preset);

  return (
    <div data-testid="anim-preset-menu" data-preset-blocked={blocked ? 'true' : 'false'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.entrance}</span>
      <div style={{ display: 'flex', padding: 2, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
        {PRESETS.map((p) => {
          const active = el.anim.preset === p;
          return (
            <button
              key={p}
              data-testid={`anim-preset-${p}`}
              data-active={active}
              disabled={blocked}
              title={blocked ? L.preset_blocked : undefined}
              onClick={() => actions.setElementAnimPreset(el.id, p)}
              style={{
                height: 22,
                padding: '0 9px',
                border: 0,
                borderRadius: 'calc(var(--rs) - 2px)',
                background: active ? 'var(--seg)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--muted)',
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                boxShadow: active ? '0 1px 2px rgba(0,0,0,.1)' : 'none',
                opacity: blocked ? 0.4 : 1,
                cursor: blocked ? 'not-allowed' : 'pointer',
              }}
            >
              {L[`anim_${p}` as const]}
            </button>
          );
        })}
      </div>
      {/* **مدّة الدخول لكلّ عنصر** (٣٠ أكتوبر): كانت حاضرةً للنصوص وحدها (منزلقٌ في لوح النص)، فالشكلُ
          والمجموعةُ يدخلان دائمًا في ٠٫٦ ث — خريطةٌ تقفز في عُشرَي ثانية كانت تزحف ثلاثةَ أضعاف ذلك. */}
      {el.anim.preset !== 'none' && !blocked && (
        <div data-testid="anim-entrance-duration" style={{ display: 'flex', padding: 2, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2 }}>
          {[0.2, 0.4, 0.6, 1].map((sec) => {
            const tr = motionTracks(el.anim.tracks);
            const ends = Object.values(tr).flatMap((k) => (k ?? []).map((f) => f.time - (el.anim.sourceIn ?? 0)));
            const cur = ends.length ? Math.max(...ends) : 0.6;
            const on = Math.abs(cur - Math.min(sec, el.anim.duration)) < 0.02;
            return (
              <button
                key={sec}
                data-testid={`anim-entrance-${sec}`}
                onClick={() => actions.setEntranceDuration(el.id, sec)}
                style={{ height: 22, padding: '0 7px', border: 0, borderRadius: 'calc(var(--rs) - 2px)', background: on ? 'var(--seg)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', fontSize: 11, fontWeight: on ? 600 : 500, fontVariantNumeric: 'tabular-nums' }}
              >
                {`${sec}${L.sec_short}`}
              </button>
            );
          })}
        </div>
      )}
      {/* **حركة الخروج** (٣٠ أكتوبر): كلُّ عنصرٍ كان يختفي بقطعٍ حادٍّ عند نهاية مقطعه. */}
      <div data-testid="anim-exit" style={{ display: 'flex', flexWrap: 'wrap', padding: 2, background: 'var(--surface2)', borderRadius: 'var(--rs)', gap: 2, alignItems: 'center' }}>
        {(['none', 'fade', 'focus', 'shrink', 'grow', 'up'] as const).map((k) => {
          const on = (el.anim.exit?.kind ?? 'none') === k;
          return (
            <button
              key={k}
              data-testid={`anim-exit-${k}`}
              title={L.exit_anim}
              onClick={() => actions.setExitAnim(el.id, k === 'none' ? null : { kind: k, seconds: el.anim.exit?.seconds ?? 0.3 })}
              style={{ height: 22, padding: '0 7px', border: 0, borderRadius: 'calc(var(--rs) - 2px)', background: on ? 'var(--seg)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', fontSize: 11, fontWeight: on ? 600 : 500 }}
            >
              {L[`exit_${k}` as const]}
            </button>
          );
        })}
        {el.anim.exit && [0.2, 0.3, 0.5].map((sec) => {
          const on = Math.abs((el.anim.exit?.seconds ?? 0) - sec) < 0.01;
          return (
            <button
              key={`x${sec}`}
              data-testid={`anim-exit-sec-${sec}`}
              onClick={() => el.anim.exit && actions.setExitAnim(el.id, { kind: el.anim.exit.kind, seconds: sec })}
              style={{ height: 22, padding: '0 7px', border: 0, borderRadius: 'calc(var(--rs) - 2px)', background: on ? 'var(--seg)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', fontSize: 11, fontWeight: on ? 600 : 500, fontVariantNumeric: 'tabular-nums' }}
            >
              {`${sec}${L.sec_short}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
