import { consumeSuppressedClick, startTileDrag } from '../../lib/libraryDrag';
import type { CSSProperties } from 'react';
import { useStudio } from '../../state/StudioContext';
import { FX_CATALOG, fxCss, overlayCss, resolveFx, type FxCategory, type FxSpec } from '../../lib/effects';
import { particleBurst } from '../../lib/particles';
import { sizeAt } from '../../data/constants';
import { MotionStylesSection } from './MotionStylesSection';

/** لوح «تأثيرات» (٢٨ أكتوبر ٢٠٢٦) — كان «قريبًا» منذ بُني شريطُ الإضافة.
 *
 * ثلاثةُ أقسام: فلاتر، مؤثّرات، انتقالات. **ضغطةٌ واحدة على البطاقة** تضع طبقةَ المؤثّر
 * عند المؤشّر فوق كلّ الطبقات وتحدّدها، فيظهر أثرُها على اللوحة فورًا وتظهر خصائصُها في
 * لوح التصميم. والمعاينةُ على البطاقة هي المؤثّرُ نفسُه (`resolveFx` ثم `fxCss`) على
 * مشهدٍ صغيرٍ مرسومٍ بالـCSS — فما تراه على البطاقة هو ما سيحدث، لا صورةٌ دعائيّة. */
export function FxLibrary() {
  const { state, actions, dict: L } = useStudio();
  const cats: { id: FxCategory; label: string }[] = [
    { id: 'filter', label: L.fx_cat_filter },
    { id: 'effect', label: L.fx_cat_effect },
    { id: 'transition', label: L.fx_cat_transition },
  ];
  return (
    <div data-testid="fx-library" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <MotionStylesSection />
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.7, color: 'var(--muted)' }}>{L.fx_lib_hint}</p>
      {cats.map((c) => (
        <section key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="mz-label">{c.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {FX_CATALOG.filter((f) => f.cat === c.id).map((f) => (
              <FxCard key={f.id} spec={f} label={state.lang === 'ar' ? f.ar : f.en} onPick={(drop) => actions.insertFx(f.id, drop?.start)} />
            ))}
          </div>
        </section>
      ))}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="mz-label">{L.fx_cat_particles}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <button
            data-testid="fx-card-particle-burst"
            className="mz-tile"
            title={L.fx_particle_burst}
            onClick={() => {
              // دوائرُ حقيقيّةٌ مجمّعة من وسط اللوحة عند المؤشّر — انظر `lib/particles.ts`.
              const pg = sizeAt(state.sizeIdx, state.customW, state.customH);
              const els = particleBurst({ cx: pg.w / 2, cy: pg.h / 2, start: state.t, seed: Math.round(state.t * 1000) + state.elements.length }, pg);
              actions.commitElements((cur) => [...cur, ...els], L.undo_fx_add);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 0, border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', background: '#fff' }}>
              {Array.from({ length: 14 }, (_, i) => {
                const a = (i / 14) * Math.PI * 2;
                const r = 26 + (i % 3) * 9;
                const d = 5 + (i % 4) * 2;
                return (
                  <span
                    key={i}
                    style={{ position: 'absolute', left: `calc(50% + ${Math.cos(a) * r}% - ${d / 2}px)`, top: `calc(50% + ${Math.sin(a) * r}% - ${d / 2}px)`, width: d, height: d, borderRadius: '50%', background: ['#ff5ea8', '#ff9a3c', '#8b5cf6', '#3b82f6'][i % 4] }}
                  />
                );
              })}
            </div>
            <span style={{ fontSize: 11, lineHeight: 1.3, textAlign: 'center' }}>{L.fx_particle_burst}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function FxCard({ spec, label, onPick }: { spec: FxSpec; label: string; onPick: (drop?: { start?: number }) => void }) {
  // لقطةٌ ثابتةٌ بقوّةٍ كاملة؛ والمؤثّراتُ الحيّة (اهتزاز، نبض) عند لحظةٍ تُظهر أثرها.
  const r = resolveFx(spec.id, 1, spec.id === 'pulse' ? 0.3 : 0.11);
  const css = fxCss(r);
  return (
    <button
      data-testid={`fx-card-${spec.id}`}
      className="mz-tile"
      onClick={() => {
        if (consumeSuppressedClick()) return;
        onPick();
      }}
      // سحبُ البطاقة إلى المسارات يضع المؤثّرَ عند زمن الإفلات (كما في محرّر فيديو شائع)؛ والإفلاتُ على اللوحة = عند المؤشّر.
      onPointerDown={(e) => startTileDrag(e, '<div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(180deg,#2f7fd6,#f7c88b)"></div>', (drop) => onPick(drop.start !== undefined ? { start: drop.start } : undefined))}
      title={label}
      style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 0, border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', containerType: 'inline-size' }}>
        <div style={{ position: 'absolute', inset: 0, filter: css.filter, transform: css.transform }}>
          <SampleScene />
        </div>
        {r.overlays.map((o, i) => (
          <div key={i} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...overlayCss(o) }} />
        ))}
      </div>
      <span style={{ fontSize: 11, lineHeight: 1.3, textAlign: 'center' }}>{label}</span>
    </button>
  );
}

/** مشهدٌ صغير بلا أصول: سماءٌ وشمسٌ وتلّتان — ألوانٌ مشبعة ودرجاتٌ فاتحة وداكنة، فيظهر
 * عليه أثرُ كلّ فلترٍ لونيٍّ بوضوح. */
function SampleScene() {
  const abs: CSSProperties = { position: 'absolute' };
  return (
    <>
      <div style={{ ...abs, inset: 0, background: 'linear-gradient(180deg, #2f7fd6 0%, #8ec9f5 55%, #f7c88b 100%)' }} />
      <div style={{ ...abs, left: '58%', top: '18%', width: '26%', aspectRatio: '1', borderRadius: '50%', background: '#ffd34d', boxShadow: '0 0 12px #ffb84d' }} />
      <div style={{ ...abs, left: '-20%', top: '58%', width: '90%', height: '70%', borderRadius: '50%', background: '#2f9a5a' }} />
      <div style={{ ...abs, left: '35%', top: '66%', width: '90%', height: '70%', borderRadius: '50%', background: '#1f6b3f' }} />
      <div style={{ ...abs, left: '18%', top: '46%', width: '12%', height: '18%', background: '#d9473b', borderRadius: '2px' }} />
    </>
  );
}
