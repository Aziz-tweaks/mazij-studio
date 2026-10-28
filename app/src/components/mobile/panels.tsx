import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AiEngine } from '../../lib/agentClient';
import { loadApiKey, saveApiKey } from '../../lib/aiKeyStore';
import { LLM_PROVIDERS, loadModel, saveModel, testKey, type LlmProvider } from '../../lib/llmAgent';
import { useStudio } from '../../state/StudioContext';
import type { DocElement, TextElement } from '../../state/elements';
import type { AnimPreset } from '../../state/elements';
import { PALETTES } from '../../data/constants';
import { BASIC_TEXT_PRESETS, STYLED_TEXT_PRESETS, TEXT_PRESETS, type TextPreset } from '../../lib/textPresets';
import { SHAPE_SECTIONS, tilePathD } from '../../lib/shapeFactory';
import { FX_CATALOG, fxCss, overlayCss, resolveFx, type FxCategory, type FxKind } from '../../lib/effects';
import { elementDisplayName } from '../../lib/layerNames';
import { Glyph, MI, Seg, SectionTitle, Slider, Swatches, Empty } from './ui';
import { useM } from './strings';

/** محتوى ألواح الجوال. كلُّ لوحٍ مكتوبٌ للإصبع من الصفر — بطاقاتٌ كبيرة ومنزلقاتٌ تُمسَك
 * من أيّ نقطة — ويستدعي أفعالَ `StudioContext` نفسَها التي يستدعيها سطحُ المكتب، فلا
 * منطقَ ثانٍ. والسحبُ على أيّ منزلقٍ خطوةُ تراجعٍ واحدة (`beginElementEdit` ←
 * `liveUpdateElements` ← `commitElementEdit`). */

const pad: CSSProperties = { padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 };

export function useLive() {
  const { actions } = useStudio();
  return {
    start: (label?: string) => actions.beginElementEdit(label),
    set: (id: string, patch: (e: DocElement) => Partial<DocElement>) =>
      actions.liveUpdateElements((els) => els.map((e) => (e.id === id ? ({ ...e, ...patch(e) } as DocElement) : e))),
    end: () => actions.commitElementEdit(),
  };
}

export function usePaletteColors(): string[] {
  const { state } = useStudio();
  const pal = PALETTES[state.postPalette] ?? PALETTES[0];
  return Array.from(new Set([pal.fg, pal.ac, pal.bg, ...(pal.ac2 ? [pal.ac2] : [])].map((c) => c.toUpperCase())));
}

// ═════════════════════════ ألواحُ الإضافة ═════════════════════════

export function TextPanel({ onDone }: { onDone: () => void }) {
  const { actions } = useStudio();
  const M = useM();
  const basic: Record<string, string> = { heading: M.s_heading, subheading: M.s_sub, body: M.s_body };
  const add = (id: TextPreset) => {
    actions.addTextPreset(id);
    onDone();
  };
  return (
    <div data-testid="text-library" style={pad}>
      <div className="m-group">
        {BASIC_TEXT_PRESETS.map((id) => {
          const d = TEXT_PRESETS[id];
          return (
            <button key={id} data-text-preset={id} className="m-row m-press" onClick={() => add(id)} style={{ minHeight: id === 'heading' ? 64 : id === 'subheading' ? 56 : 50, fontFamily: `'${d.fontFamily}', sans-serif`, fontWeight: id === 'heading' ? 800 : id === 'subheading' ? 600 : 400, fontSize: id === 'heading' ? 24 : id === 'subheading' ? 18 : 15 }}>
              <span style={{ flex: 1 }}>{basic[id]}</span>
              <Glyph d={MI.plus} size={18} style={{ color: 'var(--m-text3)' }} />
            </button>
          );
        })}
      </div>
      <div>
        <SectionTitle>{M.s_styles}</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {STYLED_TEXT_PRESETS.map((id) => {
            const d = TEXT_PRESETS[id];
            return (
              <button
                key={id}
                data-text-preset={id}
                className="m-press"
                onClick={() => add(id)}
                style={{ height: 96, border: 0, borderRadius: 16, background: STYLE_BG[id] ?? 'var(--m-elev2)', color: STYLE_FG[id] ?? 'var(--m-text)', fontFamily: `'${d.fontFamily}', sans-serif`, fontWeight: d.weight === 'bold' ? 800 : 500, fontSize: d.fontSize > 110 ? 26 : 19, letterSpacing: d.tracking ? 1 : 0, lineHeight: 1.2, padding: 10 }}
              >
                {d.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
const STYLE_BG: Partial<Record<TextPreset, string>> = { offer: '#2B2140', soon: '#111111', opening: '#0E3B36', new: '#EDEEF0' };
const STYLE_FG: Partial<Record<TextPreset, string>> = { offer: '#FFFFFF', soon: '#FFD15C', opening: '#F1E9C9', new: '#111111' };

export function ShapesPanel({ onDone }: { onDone: () => void }) {
  const { actions, dict: L } = useStudio();
  return (
    <div data-testid="shapes-library" style={pad}>
      {SHAPE_SECTIONS.map((section) => {
        const tiles = section.tiles.filter((t) => t.status !== 'soon');
        if (!tiles.length) return null;
        return (
          <section key={section.titleKey}>
            <SectionTitle>{L[section.titleKey as keyof typeof L] as string}</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {tiles.map((tile) => {
                const label = L[tile.labelKey as keyof typeof L] as string;
                return (
                  <button
                    key={tile.id}
                    data-shape-tile={tile.id}
                    aria-label={label}
                    className="m-press"
                    onClick={() => {
                      actions.placeShapeFromLibrary(tile.recipe);
                      onDone();
                    }}
                    style={{ aspectRatio: '1', border: 0, borderRadius: 16, background: 'var(--m-elev2)', padding: 16, display: 'grid', placeItems: 'center', color: 'var(--m-text)' }}
                  >
                    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }} aria-hidden="true">
                      <path d={tilePathD(tile.recipe)} fill={tile.recipe.kind === 'line' ? 'none' : 'currentColor'} stroke={tile.recipe.kind === 'line' ? 'currentColor' : 'none'} strokeWidth={tile.recipe.kind === 'line' ? 8 : 0} strokeLinecap="round" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function FxPanel({ onDone }: { onDone: () => void }) {
  const { state, actions, dict: L } = useStudio();
  const M = useM();
  const cats: { id: FxCategory; label: string }[] = [
    { id: 'filter', label: L.fx_cat_filter },
    { id: 'effect', label: L.fx_cat_effect },
    { id: 'transition', label: L.fx_cat_transition },
  ];
  return (
    <div data-testid="fx-library" style={pad}>
      <p className="m-caption" style={{ margin: 0 }}>{M.s_fx_hint}</p>
      {cats.map((c) => (
        <section key={c.id}>
          <SectionTitle>{c.label}</SectionTitle>
          <div className="m-hscroll" style={{ gap: 10, margin: '0 -16px', padding: '0 16px' }}>
            {FX_CATALOG.filter((f) => f.cat === c.id).map((f) => (
              <FxThumb
                key={f.id}
                kind={f.id}
                label={state.lang === 'ar' ? f.ar : f.en}
                onPick={() => {
                  actions.insertFx(f.id);
                  onDone();
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function FxThumb({ kind, label, onPick, selected, size = 92 }: { kind: FxKind; label: string; onPick: () => void; selected?: boolean; size?: number }) {
  const r = resolveFx(kind, 1, kind === 'pulse' ? 0.3 : 0.11);
  const css = fxCss(r);
  return (
    <button data-testid={`fx-card-${kind}`} aria-pressed={selected} className="m-press" onClick={onPick} style={{ flex: 'none', width: size, display: 'flex', flexDirection: 'column', gap: 6, padding: 0, border: 0, background: 'transparent', color: 'var(--m-text)' }}>
      <div style={{ position: 'relative', width: size, height: size, borderRadius: 16, overflow: 'hidden', boxShadow: selected ? '0 0 0 2px var(--m-elev), 0 0 0 4px var(--m-accent)' : 'inset 0 0 0 1px var(--m-hair)' }}>
        <div style={{ position: 'absolute', inset: 0, filter: css.filter, transform: css.transform }}>
          <SampleScene />
        </div>
        {r.overlays.map((o, i) => (
          <div key={i} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...overlayCss(o) }} />
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{label}</span>
    </button>
  );
}

function SampleScene() {
  const abs: CSSProperties = { position: 'absolute' };
  return (
    <>
      <div style={{ ...abs, inset: 0, background: 'linear-gradient(180deg, #2f7fd6 0%, #8ec9f5 55%, #f7c88b 100%)' }} />
      <div style={{ ...abs, left: '58%', top: '18%', width: '26%', aspectRatio: '1', borderRadius: '50%', background: '#ffd34d', boxShadow: '0 0 12px #ffb84d' }} />
      <div style={{ ...abs, left: '-20%', top: '58%', width: '90%', height: '70%', borderRadius: '50%', background: '#2f9a5a' }} />
      <div style={{ ...abs, left: '35%', top: '66%', width: '90%', height: '70%', borderRadius: '50%', background: '#1f6b3f' }} />
      <div style={{ ...abs, left: '18%', top: '46%', width: '12%', height: '18%', background: '#d9473b', borderRadius: 2 }} />
    </>
  );
}

/** منتقي ملفٍّ أصليّ: في iOS يفتح «الصور» و«الكاميرا» و«الملفات» من ورقة النظام نفسها. */
export function pickFile(accept: string, onFile: (f: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onFile(f);
    input.remove();
  };
  document.body.appendChild(input);
  input.click();
}

export function AudioPanel() {
  const { state, actions, dict: L } = useStudio();
  const M = useM();
  const audios = state.elements.filter((e) => e.type === 'audio');
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <div data-testid="audio-library" style={pad}>
      <button data-testid="audio-add" className="m-btn m-btn-primary m-btn-block m-press" onClick={() => pickFile('audio/*,.mp3,.m4a,.wav,.aac', (f) => void actions.insertAudioFromFile(f))}>
        <Glyph d={MI.plus} size={20} sw={2} />
        {M.s_audio_add}
      </button>
      <p className="m-caption" style={{ margin: '-8px 2px 0' }}>{M.s_audio_hint}</p>
      {state.audioError && <p data-testid="audio-error" style={{ margin: 0, color: 'var(--m-danger)', fontSize: 13 }}>{state.audioError}</p>}
      {audios.length === 0 ? (
        <Empty icon={MI.audio} title={M.s_audio_none} />
      ) : (
        <div className="m-group">
          {audios.map((a) => (
            <button key={a.id} data-testid={`audio-item-${a.id}`} className="m-row m-press" onClick={() => actions.selectElement(a.id)} aria-pressed={state.selectedIds.includes(a.id)}>
              <Glyph d={MI.audio} size={20} style={{ color: 'var(--m-accent-text)' }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{elementDisplayName(a, L)}</span>
              <span dir="ltr" style={{ color: 'var(--m-text2)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmt(a.anim.duration)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BackgroundPanel() {
  const { state, actions } = useStudio();
  const M = useM();
  const pal = PALETTES[state.postPalette] ?? PALETTES[0];
  return (
    <div data-testid="bg-panel" style={pad}>
      <div>
        <SectionTitle>{M.s_palettes}</SectionTitle>
        <div className="m-hscroll" style={{ gap: 10, margin: '0 -16px', padding: '0 16px' }}>
          {PALETTES.map((p, i) => (
            <button
              key={i}
              data-testid={`palette-${i}`}
              aria-pressed={state.postPalette === i}
              className="m-press"
              onClick={() => actions.setPostPalette(i)}
              style={{ flex: 'none', width: 76, height: 76, border: 0, borderRadius: 18, background: p.bg, position: 'relative', overflow: 'hidden', boxShadow: state.postPalette === i ? '0 0 0 2px var(--m-elev), 0 0 0 4px var(--m-text)' : 'inset 0 0 0 1px rgba(255,255,255,.12)' }}
            >
              <span style={{ position: 'absolute', insetInlineStart: 12, top: 14, width: 34, height: 8, borderRadius: 4, background: p.fg }} />
              <span style={{ position: 'absolute', insetInlineStart: 12, top: 28, width: 22, height: 6, borderRadius: 3, background: p.fg, opacity: 0.6 }} />
              <span style={{ position: 'absolute', insetInlineEnd: -10, bottom: -10, width: 40, height: 40, borderRadius: '50%', background: p.ac }} />
            </button>
          ))}
        </div>
        <button className="m-btn m-press" style={{ marginTop: 12, minHeight: 40, fontSize: 14 }} onClick={actions.applyPaletteToAll}>
          {M.s_palettes_apply}
        </button>
      </div>
      <div>
        <SectionTitle>{M.s_bg_color}</SectionTitle>
        <Swatches testid="bg-swatches" value={pal.bg} docColors={[pal.bg, pal.fg, pal.ac].map((c) => c.toUpperCase())} onPick={(c) => c && actions.setBackgroundColor(c)} />
      </div>
    </div>
  );
}

export function MizoPanel() {
  const { state, actions } = useStudio();
  const M = useM();
  const ar = state.lang === 'ar';
  const listRef = useRef<HTMLDivElement>(null);
  const engine = state.aiEngine === 'openai' || state.aiEngine === 'anthropic' ? state.aiEngine : 'local';
  const provider = engine === 'local' ? null : LLM_PROVIDERS[engine];
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!provider) return;
    let dead = false;
    setHasKey(null);
    void loadApiKey(provider.keyId).then((k) => !dead && setHasKey(!!k));
    return () => {
      dead = true;
    };
  }, [provider]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.aiMsgs.length, state.aiTyping]);

  const needsKey = !!provider && (hasKey === false || editing);
  return (
    <div data-testid="mizo-panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', padding: '0 16px 10px' }}>
        <Seg
          testid="mizo-engine"
          value={engine}
          options={[
            { id: 'local', label: M.mz_local, testid: 'mizo-engine-local' },
            { id: 'openai', label: 'ChatGPT', testid: 'mizo-engine-openai' },
            { id: 'anthropic', label: 'Claude', testid: 'mizo-engine-anthropic' },
          ]}
          onChange={(id) => {
            setEditing(false);
            actions.setAiEngine(id as AiEngine);
          }}
        />
      </div>

      {needsKey && engine !== 'local' ? (
        <KeyForm provider={engine} onSaved={() => { setHasKey(true); setEditing(false); }} onCancel={hasKey ? () => setEditing(false) : undefined} />
      ) : (
        <>
          <div ref={listRef} className="m-scroll" style={{ flex: 1, minHeight: 0, padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!state.aiMsgs.length && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--m-accent-soft)', color: 'var(--m-accent-text)' }}>
                  <Glyph d={MI.mizo} size={18} />
                </span>
                <div style={{ padding: '10px 14px', borderRadius: 16, borderStartStartRadius: 6, background: 'var(--m-elev2)', fontSize: 15 }}>
                  {provider ? M.mz_welcome_llm(provider.label) : M.s_mizo_welcome}
                </div>
              </div>
            )}
            {state.aiMsgs.map((m, i) => (
              <div key={i} className="m-fade-in" style={{ alignSelf: m.role === 'u' ? 'flex-start' : 'flex-end', maxWidth: '85%', padding: '10px 14px', borderRadius: 18, background: m.role === 'u' ? 'var(--m-accent)' : 'var(--m-elev2)', color: m.role === 'u' ? '#fff' : 'var(--m-text)', fontSize: 15, whiteSpace: 'pre-wrap' }}>
                {m.text}
              </div>
            ))}
            {state.aiTyping && (
              <div data-testid="mizo-typing" style={{ alignSelf: 'flex-end', padding: '10px 14px', borderRadius: 18, background: 'var(--m-elev2)', color: 'var(--m-text2)' }}>
                {provider ? M.mz_working(provider.label) : '…'}
              </div>
            )}
          </div>
          {provider && hasKey && (
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px 8px' }}>
              <span className="m-caption" style={{ flex: 1 }}>{M.mz_key_saved(provider.label)}</span>
              <button data-testid="mizo-key-edit" className="m-chip m-press" style={{ height: 30, fontSize: 12.5 }} onClick={() => setEditing(true)}>
                {M.mz_key_change}
              </button>
            </div>
          )}
          <div className="m-hscroll" style={{ flex: 'none', gap: 8, padding: '0 16px 10px' }}>
            {M.s_mizo_tries.map((t) => (
              <button key={t} className="m-chip m-press" disabled={state.aiTyping} onClick={() => actions.sendAi(t)}>
                {t}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (state.aiInput.trim()) actions.sendAi(state.aiInput);
            }}
            style={{ flex: 'none', display: 'flex', gap: 8, padding: '0 16px 8px' }}
          >
            <input data-testid="mizo-input" className="m-field" value={state.aiInput} onChange={(e) => actions.setAiInput(e.target.value)} placeholder={M.s_mizo_ph} enterKeyHint="send" style={{ borderRadius: 999 }} />
            {state.aiTyping ? (
              <button type="button" data-testid="mizo-stop" aria-label={M.mz_stop} className="m-icon-btn m-press" onClick={actions.cancelAi} style={{ width: 48, height: 48, background: 'var(--m-elev3)', color: 'var(--m-text)' }}>
                <Glyph d="M6 6h8v8H6z" size={18} fill />
              </button>
            ) : (
              <button type="submit" data-testid="mizo-send" aria-label="إرسال" className="m-icon-btn m-press" disabled={!state.aiInput.trim()} style={{ width: 48, height: 48, background: 'var(--m-accent)', color: '#fff' }}>
                <Glyph d={MI.send} size={20} style={{ transform: ar ? 'scaleX(-1)' : undefined }} />
              </button>
            )}
          </form>
        </>
      )}
    </div>
  );
}

/** لصقُ المفتاح: يُفحَص بطلبٍ صغير قبل الحفظ، ويُحفظ في الجهاز وحده. */
function KeyForm({ provider, onSaved, onCancel }: { provider: LlmProvider; onSaved: () => void; onCancel?: () => void }) {
  const { state } = useStudio();
  const M = useM();
  const info = LLM_PROVIDERS[provider];
  const [key, setKey] = useState('');
  const [model, setModel] = useState(() => loadModel(provider));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const k = key.trim();
    if (!k) return;
    setBusy(true);
    setErr(null);
    try {
      await testKey(provider, k, state.lang);
      await saveApiKey(info.keyId, k);
      saveModel(provider, model || info.defaultModel);
      onSaved();
    } catch (e) {
      setErr(e instanceof TypeError ? M.mz_offline : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="mizo-key-form" className="m-scroll" style={{ flex: 1, minHeight: 0, padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 16, background: 'var(--m-elev2)' }}>
        <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--m-accent-soft)', color: 'var(--m-accent-text)' }}>
          <Glyph d={MI.lock} size={18} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 700 }}>{M.mz_key_title(info.label)}</span>
          <span className="m-caption" style={{ fontSize: 13 }}>{M.mz_key_body(info.label)}</span>
        </div>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="m-section-title">{M.mz_key_label}</span>
        <input data-testid="mizo-key-input" className="m-field" dir="ltr" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={`${info.keyPrefix}…`} value={key} onChange={(e) => setKey(e.target.value)} />
        <span dir="ltr" className="m-caption" style={{ textAlign: state.lang === 'ar' ? 'right' : 'left' }}>
          {info.keyUrl}
        </span>
      </label>
      {err && <div data-testid="mizo-key-error" style={{ padding: 12, borderRadius: 14, background: 'rgba(255,107,107,.12)', color: 'var(--m-danger)', fontSize: 14 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        {onCancel && (
          <button className="m-btn m-press" onClick={onCancel} style={{ flex: 1 }}>
            {M.mz_cancel}
          </button>
        )}
        <button data-testid="mizo-key-save" className="m-btn m-btn-primary m-press" disabled={busy || !key.trim()} onClick={() => void save()} style={{ flex: 2 }}>
          {busy ? M.mz_checking : M.mz_save}
        </button>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        <span className="m-section-title">{M.mz_model}</span>
        <input data-testid="mizo-model-input" className="m-field" dir="ltr" autoCapitalize="off" spellCheck={false} value={model} onChange={(e) => setModel(e.target.value)} />
      </label>
    </div>
  );
}

export function typeIcon(t: DocElement['type']): string {
  return t === 'text' ? MI.text : t === 'shape' ? MI.shapes : t === 'image' ? MI.image : t === 'video' ? MI.video : t === 'audio' ? MI.audio : t === 'fx' ? MI.fx : t === 'lottie' ? MI.sticker : MI.layers;
}

export function LayersPanel() {
  const { state, actions, dict: L } = useStudio();
  const M = useM();
  const list = [...state.elements].reverse();
  if (!list.length) return <Empty icon={MI.layers} title={M.s_layers_empty} body={M.s_layers_empty_body} />;
  return (
    <div data-testid="layers-list" style={{ padding: '4px 12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {list.map((el) => {
        const on = state.selectedIds.includes(el.id);
        return (
          <div key={el.id} data-testid={`layer-row-${el.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 14, background: on ? 'var(--m-accent-soft)' : 'transparent', opacity: el.visible ? 1 : 0.5 }}>
            <button className="m-row m-press" onClick={() => actions.selectElement(el.id)} style={{ flex: 1, minWidth: 0, minHeight: 50, padding: '0 10px', background: 'transparent' }}>
              <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--m-elev2)', color: on ? 'var(--m-accent-text)' : 'var(--m-text2)' }}>
                <Glyph d={typeIcon(el.type)} size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: on ? 700 : 500, fontFamily: el.type === 'text' ? (el as TextElement).fontFamily : undefined }}>{elementDisplayName(el, L)}</span>
            </button>
            <button className="m-icon-btn m-press" aria-label="lock" onClick={() => actions.toggleLocked(el.id)} style={{ color: el.locked ? 'var(--m-text)' : 'var(--m-text3)' }}>
              <Glyph d={el.locked ? MI.lock : MI.unlock} size={19} />
            </button>
            <button className="m-icon-btn m-press" aria-label="visible" onClick={() => actions.toggleVisible(el.id)} style={{ color: el.visible ? 'var(--m-text2)' : 'var(--m-text3)' }}>
              <Glyph d={el.visible ? MI.eye : MI.eyeOff} size={19} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════ ألواحُ العنصر المحدَّد ═════════════════════════

function Body({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid} style={pad}>
      {children}
    </div>
  );
}

export function FontPanel({ el }: { el: TextElement }) {
  const { state, actions } = useStudio();
  const fonts = state.fonts.filter((f) => f.status === 'ready');
  return (
    <div data-testid="font-panel" style={{ padding: '0 12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {fonts.map((f) => {
        const on = el.fontFamily === f.family;
        return (
          <button key={f.id} className="m-row m-press" aria-pressed={on} onClick={() => actions.setElementFont(el.id, f.family)} style={{ borderRadius: 14, minHeight: 56, background: on ? 'var(--m-accent-soft)' : 'transparent' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 10, fontFamily: f.family }}>
              <span style={{ fontSize: 22 }}>أبجد</span>
              <span style={{ fontSize: 14, color: 'var(--m-text2)' }}>{f.name}</span>
            </span>
            {on && <Glyph d={MI.check} size={20} sw={2.2} style={{ color: 'var(--m-accent-text)' }} />}
          </button>
        );
      })}
    </div>
  );
}

export function ColorPanel({ el }: { el: DocElement }) {
  const { state, actions } = useStudio();
  const colors = usePaletteColors();
  const pal = PALETTES[state.postPalette] ?? PALETTES[0];
  const value = el.type === 'text' ? (el.color ?? pal.fg) : el.type === 'shape' ? (el.fill ?? pal.ac) : null;
  return (
    <Body testid="color-panel">
      <Swatches
        value={value}
        docColors={colors}
        onPick={(c) => {
          if (!c) return;
          if (el.type === 'text') actions.setElementColor(el.id, c);
          else if (el.type === 'shape') actions.setShapeFill(el.id, c);
        }}
      />
    </Body>
  );
}

export function SizePanel({ el }: { el: TextElement }) {
  const live = useLive();
  const M = useM();
  const { state } = useStudio();
  const presets = [24, 36, 48, 64, 96, 140];
  const { actions } = useStudio();
  return (
    <Body testid="size-panel">
      <Slider
        testid="font-size-slider"
        label={M.s_size}
        display={`${Math.round(el.fontSize)}`}
        value={el.fontSize}
        min={8}
        max={300}
        step={1}
        rtl={state.lang === 'ar'}
        onStart={() => live.start()}
        onChange={(v) => live.set(el.id, () => ({ fontSize: v }) as Partial<DocElement>)}
        onEnd={live.end}
      />
      <div className="m-hscroll" style={{ gap: 8 }}>
        {presets.map((p) => (
          <button key={p} className="m-chip m-press" aria-pressed={Math.round(el.fontSize) === p} onClick={() => actions.setElementFontSize(el.id, p)} dir="ltr">
            {p}
          </button>
        ))}
      </div>
    </Body>
  );
}

export function OpacityPanel({ el }: { el: DocElement }) {
  const live = useLive();
  const M = useM();
  const { state } = useStudio();
  const v = el.opacity ?? 100;
  return (
    <Body testid="opacity-panel">
      <Slider
        testid="opacity-slider"
        label={M.s_opacity}
        display={`${Math.round(v)}%`}
        value={v}
        min={0}
        max={100}
        step={1}
        rtl={state.lang === 'ar'}
        onStart={() => live.start()}
        onChange={(n) => live.set(el.id, () => ({ opacity: n }))}
        onEnd={live.end}
      />
    </Body>
  );
}

export function MotionPanel({ el }: { el: DocElement }) {
  const { actions } = useStudio();
  const M = useM();
  const opts: Array<{ id: AnimPreset; label: string; demo: string }> = [
    { id: 'none', label: M.m_none, demo: 'none' },
    { id: 'fade', label: M.m_fade, demo: 'm-demo-fade' },
    { id: 'slide', label: M.m_slide, demo: 'm-demo-slide' },
    { id: 'pop', label: M.m_pop, demo: 'm-demo-pop' },
  ];
  return (
    <Body testid="motion-panel">
      <style>{`@keyframes m-demo-fade{0%,20%{opacity:0}60%,100%{opacity:1}}@keyframes m-demo-slide{0%,20%{opacity:0;transform:translateY(14px)}60%,100%{opacity:1;transform:none}}@keyframes m-demo-pop{0%,20%{opacity:0;transform:scale(.5)}55%{opacity:1;transform:scale(1.08)}70%,100%{transform:scale(1)}}`}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {opts.map((o) => {
          const on = el.anim.preset === o.id;
          return (
            <button key={o.id} data-testid={`motion-${o.id}`} aria-pressed={on} className="m-press" onClick={() => actions.setElementAnimPreset(el.id, o.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 0, border: 0, background: 'transparent', color: 'var(--m-text)' }}>
              <span style={{ width: '100%', aspectRatio: '1', borderRadius: 16, background: 'var(--m-elev2)', display: 'grid', placeItems: 'center', boxShadow: on ? '0 0 0 2px var(--m-elev), 0 0 0 4px var(--m-accent)' : undefined }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--m-accent)', animation: o.demo === 'none' ? undefined : `${o.demo} 1.6s var(--m-ease) infinite` }} />
              </span>
              <span style={{ fontSize: 13, fontWeight: on ? 700 : 500 }}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </Body>
  );
}

export function ArrangePanel({ el }: { el: DocElement }) {
  const { actions } = useStudio();
  const M = useM();
  const al = (edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom', d: string, label: string) => (
    <button key={edge} aria-label={label} className="m-btn m-press" onClick={() => actions.alignSelected(edge)} style={{ minHeight: 52, padding: 0 }}>
      <Glyph d={d} size={22} />
    </button>
  );
  return (
    <Body testid="arrange-panel">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button data-testid="arrange-forward" className="m-btn m-press" onClick={() => actions.bringForward([el.id])}>
          <Glyph d="M10 15V5M6 9l4-4 4 4" size={20} />
          {M.s_forward}
        </button>
        <button data-testid="arrange-backward" className="m-btn m-press" onClick={() => actions.sendBackward([el.id])}>
          <Glyph d="M10 5v10M6 11l4 4 4-4" size={20} />
          {M.s_backward}
        </button>
      </div>
      <div>
        <SectionTitle>{M.s_align_page}</SectionTitle>
        <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {al('left', 'M4 3v14M7 7h8M7 13h5', 'left')}
          {al('center', 'M10 3v14M5 7h10M7 13h6', 'center')}
          {al('right', 'M16 3v14M5 7h8M8 13h5', 'right')}
          {al('top', 'M3 4h14M7 7v8M13 7v5', 'top')}
          {al('middle', 'M3 10h14M7 5v10M13 7v6', 'middle')}
          {al('bottom', 'M3 16h14M7 5v8M13 8v5', 'bottom')}
        </div>
      </div>
    </Body>
  );
}

export function StrokePanel({ el }: { el: DocElement & { type: 'shape' } }) {
  const { actions } = useStudio();
  const M = useM();
  const colors = usePaletteColors();
  const widths = [0, 2, 4, 8, 12, 20];
  return (
    <Body testid="stroke-panel">
      <Seg
        value={el.stroke ? el.strokeWidth : 0}
        options={widths.map((w) => ({ id: w, label: w === 0 ? M.s_stroke_none : <span dir="ltr">{w}</span> }))}
        onChange={(w) => {
          if (w === 0) actions.setShapeStroke(el.id, null);
          else {
            if (!el.stroke) actions.setShapeStroke(el.id, colors[0] ?? '#FFFFFF');
            actions.setShapeStrokeWidth(el.id, w);
          }
        }}
      />
      <Swatches
        value={el.stroke}
        docColors={colors}
        onPick={(c) => {
          if (!c) return;
          actions.setShapeStroke(el.id, c);
          if (!el.strokeWidth) actions.setShapeStrokeWidth(el.id, 4);
        }}
      />
    </Body>
  );
}

export function CornersPanel({ el }: { el: DocElement & { type: 'shape' | 'image' } }) {
  const live = useLive();
  const M = useM();
  const { state } = useStudio();
  return (
    <Body testid="corners-panel">
      <Slider
        testid="corners-slider"
        label={M.s_corners}
        display={`${Math.round(el.radius * 200)}%`}
        value={el.radius}
        min={0}
        max={0.5}
        step={0.005}
        rtl={state.lang === 'ar'}
        onStart={() => live.start()}
        onChange={(r) => live.set(el.id, () => ({ radius: r }) as Partial<DocElement>)}
        onEnd={live.end}
      />
    </Body>
  );
}

export function VolumePanel({ el }: { el: DocElement & { type: 'audio' | 'video' } }) {
  const { state, actions } = useStudio();
  const M = useM();
  return (
    <Body testid="volume-panel">
      <Slider
        testid="volume-slider"
        label={M.s_volume}
        display={el.muted ? '—' : `${Math.round(el.volume * 100)}%`}
        value={el.volume}
        min={0}
        max={1}
        step={0.01}
        rtl={state.lang === 'ar'}
        onStart={() => actions.beginElementEdit()}
        onChange={(v) => actions.liveSetAudioVolume(el.id, v)}
        onEnd={actions.commitElementEdit}
      />
      <button className="m-btn m-press" aria-pressed={el.muted} onClick={() => actions.setAudioMuted(el.id, !el.muted)} style={{ alignSelf: 'flex-start', background: el.muted ? 'var(--m-accent-soft)' : undefined, color: el.muted ? 'var(--m-accent-text)' : undefined }}>
        <Glyph d={el.muted ? MI.mute : MI.volume} size={20} />
        {M.s_mute}
      </button>
    </Body>
  );
}

export function FxKindPanel({ el }: { el: DocElement & { type: 'fx' } }) {
  const { state, actions, dict: L } = useStudio();
  const cats: { id: FxCategory; label: string }[] = [
    { id: 'filter', label: L.fx_cat_filter },
    { id: 'effect', label: L.fx_cat_effect },
    { id: 'transition', label: L.fx_cat_transition },
  ];
  return (
    <Body testid="fx-kind-panel">
      {cats.map((c) => (
        <section key={c.id}>
          <SectionTitle>{c.label}</SectionTitle>
          <div className="m-hscroll" style={{ gap: 10, margin: '0 -16px', padding: '4px 16px' }}>
            {FX_CATALOG.filter((f) => f.cat === c.id).map((f) => (
              <FxThumb key={f.id} kind={f.id} size={76} selected={el.fx === f.id} label={state.lang === 'ar' ? f.ar : f.en} onPick={() => actions.setFxProps(el.id, { fx: f.id })} />
            ))}
          </div>
        </section>
      ))}
    </Body>
  );
}

export function FxAmountPanel({ el, fade }: { el: DocElement & { type: 'fx' }; fade?: boolean }) {
  const { state, actions } = useStudio();
  const M = useM();
  const rtl = state.lang === 'ar';
  const maxFade = Math.max(0.1, el.anim.duration / 2);
  return (
    <Body testid={fade ? 'fx-fade-panel' : 'fx-amount-panel'}>
      {!fade && (
        <Slider testid="fx-amount-slider" label={M.s_fx_amount} display={`${Math.round(el.amount * 100)}%`} value={el.amount} min={0} max={1} rtl={rtl} onStart={() => actions.beginElementEdit()} onChange={(v) => actions.liveSetFxProps(el.id, { amount: v })} onEnd={actions.commitElementEdit} />
      )}
      {fade && (
        <>
          <Slider testid="fx-fadein-slider" label={M.s_fx_fade_in} display={`${el.fadeIn.toFixed(1)}s`} value={el.fadeIn} min={0} max={maxFade} step={0.05} rtl={rtl} onStart={() => actions.beginElementEdit()} onChange={(v) => actions.liveSetFxProps(el.id, { fadeIn: v })} onEnd={actions.commitElementEdit} />
          <Slider testid="fx-fadeout-slider" label={M.s_fx_fade_out} display={`${el.fadeOut.toFixed(1)}s`} value={el.fadeOut} min={0} max={maxFade} step={0.05} rtl={rtl} onStart={() => actions.beginElementEdit()} onChange={(v) => actions.liveSetFxProps(el.id, { fadeOut: v })} onEnd={actions.commitElementEdit} />
        </>
      )}
    </Body>
  );
}
