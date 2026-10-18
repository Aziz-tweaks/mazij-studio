import { useRef } from 'react';
import { Icon } from '../Icon';
import { PALETTES } from '../../data/constants';
import type { AiProvider } from '../../state/types';
import { useStudio } from '../../state/StudioContext';
import { AR, type Dictionary } from '../../i18n/strings';

const PROVIDERS: Array<{ id: AiProvider; name: string; mono: string }> = [
  { id: 'claude', name: 'Claude', mono: 'Cl' },
  { id: 'codex', name: 'Codex', mono: 'Cx' },
  { id: 'grok', name: 'Grok', mono: 'Gr' },
];

const PROVIDER_NAME: Record<AiProvider, string> = { claude: 'Claude', codex: 'Codex', grok: 'Grok' };

const SUGGESTIONS: Array<keyof Dictionary> = ['sug1', 'sug2', 'sug3', 'sug4'];

export function AiTab() {
  const { state, actions, dict: L, dir } = useStudio();

  if (!state.aiProvider) {
    return (
      <div style={{ padding: '30px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
        <MizoAvatar size={64} />
        <div style={{ fontWeight: 700, fontSize: 16 }}>{L.ai_name}</div>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.7 }}>{L.ai_welcome}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => actions.pickAiProvider(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', textAlign: 'start' }}
            >
              <span dir="ltr" style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--text)', color: 'var(--surface)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11 }}>{p.mono}</span>
              <span dir="ltr" style={{ flex: 1, fontWeight: 600, textAlign: 'start' }}>{p.name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{L.sign_in}</span>
            </button>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.ai_note}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
        <MizoAvatar size={26} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>{L.ai_name}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>
          {L.connected} <bdi style={{ fontWeight: 600, color: 'var(--text)' }}>{PROVIDER_NAME[state.aiProvider]}</bdi>
        </span>
        <button onClick={actions.changeAiProvider} style={{ height: 24, padding: '0 8px', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)', fontSize: 11 }}>{L.change}</button>
      </div>

      <MessageList />

      <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SUGGESTIONS.map((k) => (
            <button
              key={k}
              onClick={() => actions.sendAi(L[k] as string)}
              style={{ height: 26, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 999, background: 'transparent', color: 'var(--muted)', fontSize: 11 }}
            >
              {L[k] as string}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={state.aiInput}
            onChange={(e) => actions.setAiInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') actions.sendAi(state.aiInput);
            }}
            placeholder={L.ai_ph}
            style={{ flex: 1, minWidth: 0, height: 36, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', outline: 0 }}
          />
          <button onClick={() => actions.sendAi(state.aiInput)} style={{ width: 36, height: 36, border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', display: 'grid', placeItems: 'center' }}>
            <Icon size={16} path="M3 10L17 3l-4 14-3-6-7-1z" style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageList() {
  const { state, actions, dict: L } = useStudio();
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {state.aiMsgs.map((m, i) => {
        const text = m.key ? (L[m.key as keyof Dictionary] as string) : m.text;
        const isUser = m.role === 'u';
        return (
          <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '88%', padding: '9px 12px', borderRadius: 14, background: isUser ? 'var(--accent)' : 'var(--surface2)', color: isUser ? 'var(--onAccent)' : 'var(--text)', fontSize: 12.5, lineHeight: 1.65 }}>
              <div>{text}</div>
              {m.palettes && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {m.palettes.map((ix) => {
                    const pl = PALETTES[ix];
                    return (
                      <button key={ix} onClick={() => actions.setPostPalette(ix)} style={{ display: 'flex', gap: 3, padding: 4, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, background: pl.bg, display: 'block' }} />
                        <span style={{ width: 16, height: 16, borderRadius: 4, background: pl.fg, display: 'block', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
                        <span style={{ width: 16, height: 16, borderRadius: 4, background: pl.ac, display: 'block' }} />
                      </button>
                    );
                  })}
                </div>
              )}
              {m.headline && (
                <div dir="rtl" style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 600, fontFamily: 'Alexandria' }}>{AR.r_headline_text}</span>
                  <button onClick={() => actions.setElementText('head', AR.r_headline_text)} style={{ height: 26, padding: '0 10px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', fontSize: 11, fontWeight: 600 }}>
                    {L.apply}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {state.aiTyping && (
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', gap: 4, padding: '12px 14px', borderRadius: 14, background: 'var(--surface2)' }}>
            <Dot delay={0} />
            <Dot delay={0.2} />
            <Dot delay={0.4} />
          </div>
        </div>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', animation: `mz-pulse 1s ease ${delay}s infinite` }} />;
}

function MizoAvatar({ size }: { size: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', position: 'relative', display: 'block' }}>
      <span style={{ position: 'absolute', left: size * 0.29, top: size * 0.38, width: size * 0.11, height: size * 0.11, borderRadius: '50%', background: 'var(--onAccent)' }} />
      <span style={{ position: 'absolute', right: size * 0.29, top: size * 0.38, width: size * 0.11, height: size * 0.11, borderRadius: '50%', background: 'var(--onAccent)' }} />
      <span style={{ position: 'absolute', left: size * 0.36, right: size * 0.36, top: size * 0.53, height: size * 0.14, borderBottom: `${Math.max(1.5, size * 0.055)}px solid var(--onAccent)`, borderRadius: '0 0 12px 12px' }} />
    </span>
  );
}
