import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { PALETTES, SIZES, dimsOf, nameOf, sizeAt, sizeIdxOf } from '../../data/constants';
import { STARTER_TEMPLATES, TEMPLATE_CATEGORIES } from '../../lib/starterTemplates';
import { useStudio } from '../../state/StudioContext';
import { ArtboardThumb, MediumBadge } from '../HomeScreen';

/** **شاشةُ البداية في الجوال** (٢٨ أكتوبر ٢٠٢٦).
 *
 * شاشةُ سطح المكتب عمودان وشبكةُ مقاسات؛ على عرض ٣٩٠ بكسلًا كانت تُقصّ من الجانبين.
 * هنا عمودٌ واحدٌ يُمرَّر، وكلُّ مجموعةٍ شريطٌ أفقيٌّ يُسحب بالإبهام — بترتيب ما يحتاجه
 * من يفتح التطبيق بالجوال: يكمّل شغله، أو يفتح مشروعًا قديمًا، أو يبدأ بمقاس، أو بقالب. */

const FORMATS = ['ig-story', 'ig-reel', 'tt', 'ig', 'ig-portrait', 'yt-short', 'yt-video', 'x'];
const TPL_W = 132;
const TPL_H = 176;

export function MobileHome() {
  const { state, actions, dict: L } = useStudio();
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

  return (
    <div data-testid="start-screen" data-compact="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(10px + env(safe-area-inset-top)) 16px 6px' }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, #f0a, #fa0 60%, #0bf)', flex: 'none' }} />
        <span style={{ fontWeight: 800, fontSize: 18, flex: 1 }}>مزيج</span>
        <button data-testid="lang-toggle" onClick={actions.toggleLang} style={pill}>{ar ? 'EN' : 'ع'}</button>
      </header>

      <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{L.h_greet}</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 50, padding: '0 6px 0 8px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14 }}>
          <input
            value={state.homePrompt}
            onChange={(e) => actions.setHomePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') actions.startFromPrompt();
            }}
            placeholder={L.h_prompt_ph}
            enterKeyHint="go"
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 0, fontSize: 16, color: 'var(--text)', padding: '0 6px' }}
          />
          <button onClick={actions.startFromPrompt} style={{ height: 38, padding: '0 16px', border: 0, borderRadius: 10, background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 700, fontSize: 14 }}>{L.start}</button>
        </div>

        {state.openDoc === 'open' && (
          <button
            data-testid="resume-project"
            data-element-count={state.elements.length}
            onClick={actions.resumeOpenProject}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--accent)', borderRadius: 16, background: 'var(--accentSoft)', color: 'var(--text)', textAlign: 'start' }}
          >
            <ArtboardThumb size={openSize} palette={PALETTES[state.postPalette] ?? PALETTES[0]} elements={state.elements} decorAccent={state.decorAccent} lang={state.lang} w={56} h={56} radius={10} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{L.h_resume}</span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {nameOf(openSize, state.lang)} · {state.elements.length === 0 ? L.h_resume_blank : L.h_elements(state.elements.length)}
              </span>
            </span>
            <span style={{ height: 38, padding: '0 16px', borderRadius: 10, background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 700, fontSize: 14, display: 'grid', placeItems: 'center' }}>{L.h_resume_cta}</span>
          </button>
        )}
      </div>

      {others.length > 0 && (
        <Section title={L.h_projects} testid="project-library">
          {others.map((p) => {
            const size = sizeAt(p.sizeIdx, p.customW, p.customH);
            return (
              <button key={p.id} data-testid={`project-${p.id}`} onClick={() => void actions.openProject(p.id)} style={{ ...card, width: 150, padding: 12, gap: 6 }}>
                <Ratio w={size.w} h={size.h} box={34} />
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{nameOf(size, state.lang)}</span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {L.h_elements(p.elementCount)}
                  {p.updatedAt > 0 ? ` · ${L.h_project_age(now - p.updatedAt)}` : ''}
                </span>
              </button>
            );
          })}
        </Section>
      )}

      <Section title={L.new_project} testid="mobile-formats">
        {FORMATS.map((id) => {
          const idx = sizeIdxOf(id);
          if (idx < 0) return null;
          const z = SIZES[idx];
          return (
            <button key={id} data-testid={`format-row-${id}`} onClick={() => actions.startBlank(idx)} style={{ ...card, width: 112, alignItems: 'center', padding: '14px 8px 10px', gap: 8 }}>
              <span style={{ height: 52, display: 'grid', placeItems: 'center' }}>
                <Ratio w={z.w} h={z.h} box={52} />
              </span>
              <span style={{ fontWeight: 700, fontSize: 12.5, textAlign: 'center', lineHeight: 1.3 }}>{nameOf(z, state.lang)}</span>
              <MediumBadge kind={z.kind} label={z.kind === 'timed' ? L.h_timed : L.h_still} />
            </button>
          );
        })}
      </Section>

      <Section
        title={L.templates}
        testid="template-strip"
        header={
          <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px 10px', scrollbarWidth: 'none' }}>
            {[{ id: 'all', label: L.h_medium_all }, ...TEMPLATE_CATEGORIES.map((c) => ({ id: c.id as string, label: ar ? c.ar : c.en }))].map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={category === c.id}
                onClick={() => setCategory(c.id)}
                style={{ flex: 'none', height: 32, padding: '0 14px', border: 0, borderRadius: 999, background: category === c.id ? 'var(--accent)' : 'var(--surface2)', color: category === c.id ? 'var(--onAccent)' : 'var(--muted)', fontSize: 13, fontWeight: category === c.id ? 700 : 500, whiteSpace: 'nowrap' }}
              >
                {c.label}
              </button>
            ))}
          </div>
        }
      >
        {templates.map((tp) => {
          const size = SIZES[tp.sizeIdx];
          return (
            <button key={tp.id} data-testid={`starter-${tp.id}`} onClick={() => actions.startFromStarter(tp.id)} style={{ ...card, width: TPL_W, padding: 0, overflow: 'hidden' }}>
              <ArtboardThumb size={size} palette={PALETTES[tp.paletteIdx]} elements={templateElements.get(tp.id) ?? []} decorAccent={tp.decorAccent} lang={state.lang} w={TPL_W} h={TPL_H} radius={0} />
              <span style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'stretch' }}>
                <span style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{L[tp.nameKey]}</span>
                <span dir="ltr" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{dimsOf(size)}</span>
              </span>
            </button>
          );
        })}
      </Section>
    </div>
  );
}

function Section({ title, testid, header, children }: { title: string; testid: string; header?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ padding: '0 16px 10px', fontSize: 16, fontWeight: 800 }}>{title}</div>
      {header}
      <div data-testid={testid} style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 4px', scrollSnapType: 'x proximity', scrollbarWidth: 'none' }}>
        {children}
      </div>
    </section>
  );
}

/** مستطيلٌ بنسبة المقاس — يُقرأ منه شكلُ اللوحة قبل اسمها. */
function Ratio({ w, h, box }: { w: number; h: number; box: number }) {
  const k = box / Math.max(w, h);
  return <span style={{ display: 'block', width: Math.max(10, w * k), height: Math.max(10, h * k), borderRadius: 5, border: '2px solid var(--accent)', background: 'var(--accentSoft)' }} />;
}

const pill: CSSProperties = { height: 32, minWidth: 40, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 700 };
const card: CSSProperties = { flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', color: 'var(--text)', textAlign: 'start', scrollSnapAlign: 'start' };
