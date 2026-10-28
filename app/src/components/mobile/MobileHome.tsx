import { useEffect, useMemo, useState } from 'react';
import { PALETTES, SIZES, dimsOf, nameOf, sizeAt, sizeIdxOf } from '../../data/constants';
import { STARTER_TEMPLATES, TEMPLATE_CATEGORIES } from '../../lib/starterTemplates';
import { useStudio } from '../../state/StudioContext';
import { ArtboardThumb } from '../HomeScreen';
import { Glyph, MI } from './ui';
import { useM } from './strings';
import './mobile.css';

/** **شاشةُ البداية في الجوال** — أُعيد بناؤها (٢٨ أكتوبر ٢٠٢٦).
 *
 * عمودٌ واحد بترتيب ما يحتاجه من يفتح التطبيق: يكتب لمِزو ما يريد، أو يكمّل شغله، أو
 * يبدأ بمقاس (شبكةٌ ٤×٢ تُرى كلُّها بلا تمرير جانبيّ — كانت شريطًا يُقصّ من الحافّة)، أو
 * بقالبٍ من شبكةٍ عموديّةٍ تُتصفَّح كمعرض. */

const FORMATS = ['ig-story', 'ig-reel', 'tt', 'ig', 'ig-portrait', 'yt-short', 'yt-video', 'x'];

export function MobileHome() {
  const { state, actions, dict: L } = useStudio();
  const M = useM();
  const [category, setCategory] = useState<string>('all');
  useEffect(() => {
    void actions.refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const templateElements = useMemo(() => new Map(STARTER_TEMPLATES.map((tp) => [tp.id, tp.elements()])), []);
  const templates = STARTER_TEMPLATES.filter((tp) => category === 'all' || tp.category === category);
  const openSize = sizeAt(state.sizeIdx, state.customW, state.customH);
  const others = state.projects.filter((p) => !(state.openDoc === 'open' && p.id === state.projectId));
  const now = Date.now();
  const ar = state.lang === 'ar';
  // الآيبادُ عموديًّا أعرض: ثلاثةُ أعمدةٍ للقوالب وصفٌّ واحدٌ للمقاسات الثمانية.
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const wide = vw >= 700;
  const cols = wide ? 3 : 2;
  const colW = Math.floor((vw - 32 - 12 * (cols - 1)) / cols);

  return (
    <div data-testid="start-screen" data-compact="true" className="m-root">
      <div className="m-scroll" style={{ flex: 1, minHeight: 0, paddingBottom: 'calc(32px + var(--m-safe-b))' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(12px + var(--m-safe-t)) 16px 4px' }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 9, background: 'conic-gradient(from 200deg, #7362ff, #ff5aa8, #ffb03d, #3ddcc4, #7362ff)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)' }} />
          <span style={{ fontWeight: 800, fontSize: 19, flex: 1 }}>{M.appName}</span>
          <button data-testid="lang-toggle" className="m-chip m-press" onClick={actions.toggleLang} style={{ height: 34, padding: '0 14px' }}>
            {ar ? 'EN' : 'ع'}
          </button>
        </header>

        <div style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 className="m-large-title">{M.greet}</h1>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              actions.startFromPrompt();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, paddingInlineStart: 16, borderRadius: 18, background: 'var(--m-elev)', boxShadow: 'inset 0 0 0 1px var(--m-hair)' }}
          >
            <Glyph d={MI.mizo} size={20} style={{ color: 'var(--m-accent-text)' }} />
            <input value={state.homePrompt} onChange={(e) => actions.setHomePrompt(e.target.value)} placeholder={M.promptPh} enterKeyHint="go" style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', outline: 0, fontSize: 16, color: 'var(--m-text)' }} />
            <button type="submit" className="m-btn m-btn-primary m-press" style={{ minHeight: 44, borderRadius: 13, padding: '0 16px' }}>
              {M.go}
            </button>
          </form>

          {state.openDoc === 'open' && (
            <button data-testid="resume-project" data-element-count={state.elements.length} className="m-card m-press" onClick={actions.resumeOpenProject} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12 }}>
              <span style={{ width: 72, height: 72, flex: 'none', borderRadius: 12, overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'var(--m-bg)' }}>
                <ArtboardThumb size={openSize} palette={PALETTES[state.postPalette] ?? PALETTES[0]} elements={state.elements} decorAccent={state.decorAccent} lang={state.lang} w={72} h={72} radius={0} />
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{M.continueTitle}</span>
                <span className="m-caption" style={{ fontSize: 13 }}>
                  {nameOf(openSize, state.lang)} · {state.elements.length === 0 ? M.blank : M.elements(state.elements.length)}
                </span>
              </span>
              <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--m-accent)', color: '#fff', flex: 'none' }}>
                <Glyph d={MI.chevron} size={18} sw={2.2} style={{ transform: ar ? 'scaleX(-1)' : undefined }} />
              </span>
            </button>
          )}
        </div>

        <Section title={M.newProject}>
          <div data-testid="mobile-formats" style={{ display: 'grid', gridTemplateColumns: `repeat(${wide ? 8 : 4}, 1fr)`, gap: 10, padding: '0 16px' }}>
            {FORMATS.map((id) => {
              const idx = sizeIdxOf(id);
              if (idx < 0) return null;
              const z = SIZES[idx];
              const k = 34 / Math.max(z.w, z.h);
              return (
                <button key={id} data-testid={`format-row-${id}`} className="m-card m-press" onClick={() => actions.startBlank(idx)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 4px 10px', minHeight: 104 }}>
                  <span style={{ height: 36, display: 'grid', placeItems: 'center', position: 'relative' }}>
                    <span style={{ width: Math.max(14, z.w * k), height: Math.max(14, z.h * k), borderRadius: 5, boxShadow: 'inset 0 0 0 2px var(--m-text2)' }} />
                    {z.kind === 'timed' && (
                      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--m-text2)' }}>
                        <Glyph d={MI.play} size={11} fill />
                      </span>
                    )}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'center', lineHeight: 1.25 }}>{nameOf(z, state.lang)}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {others.length > 0 && (
          <Section title={M.projects}>
            <div data-testid="project-library" className="m-hscroll" style={{ gap: 10, padding: '0 16px' }}>
              {others.map((p) => {
                const size = sizeAt(p.sizeIdx, p.customW, p.customH);
                const k = 40 / Math.max(size.w, size.h);
                return (
                  <button key={p.id} data-testid={`project-${p.id}`} className="m-card m-press" onClick={() => void actions.openProject(p.id)} style={{ flex: 'none', width: 148, display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
                    <span style={{ height: 44, display: 'flex', alignItems: 'center' }}>
                      <span style={{ width: size.w * k, height: size.h * k, borderRadius: 6, background: 'var(--m-accent-soft)', boxShadow: 'inset 0 0 0 1.6px var(--m-accent)' }} />
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{nameOf(size, state.lang)}</span>
                    <span className="m-caption" style={{ marginTop: -6 }}>
                      {M.elements(p.elementCount)}
                      {p.updatedAt > 0 ? ` · ${M.ago(now - p.updatedAt)}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <Section title={M.templates}>
          <div role="tablist" className="m-hscroll" style={{ gap: 8, padding: '0 16px 14px' }}>
            {[{ id: 'all', label: M.all }, ...TEMPLATE_CATEGORIES.map((c) => ({ id: c.id as string, label: ar ? c.ar : c.en }))].map((c) => (
              <button key={c.id} role="tab" aria-selected={category === c.id} className="m-chip m-press" onClick={() => setCategory(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div data-testid="template-strip" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, padding: '0 16px', alignItems: 'start' }}>
            {templates.map((tp) => {
              const size = SIZES[tp.sizeIdx];
              const h = Math.round(Math.min(colW * 1.6, Math.max(colW * 0.7, (colW * size.h) / size.w)));
              return (
                <button key={tp.id} data-testid={`starter-${tp.id}`} className="m-press m-lazy" onClick={() => actions.startFromStarter(tp.id)} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, border: 0, background: 'transparent', color: 'var(--m-text)', textAlign: 'start', containIntrinsicSize: `${colW}px ${h + 48}px` }}>
                  <span style={{ width: colW, height: h, borderRadius: 14, overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'var(--m-elev)', boxShadow: 'inset 0 0 0 1px var(--m-hair)' }}>
                    <ArtboardThumb size={size} palette={PALETTES[tp.paletteIdx]} elements={templateElements.get(tp.id) ?? []} decorAccent={tp.decorAccent} lang={state.lang} w={colW} h={h} radius={0} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingInline: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{L[tp.nameKey]}</span>
                    <span dir="ltr" className="m-caption" style={{ fontSize: 11.5, textAlign: ar ? 'right' : 'left' }}>
                      {dimsOf(size)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2 style={{ margin: 0, padding: '0 16px 12px', fontSize: 20, fontWeight: 800 }}>{title}</h2>
      {children}
    </section>
  );
}
