import { useEffect, useRef } from 'react';
import type { AiEngine } from '../../lib/agentClient';
import { Icon } from '../Icon';
import { useStudio } from '../../state/StudioContext';
import type { Dictionary } from '../../i18n/strings';

const SUGGESTIONS: Array<keyof Dictionary> = ['sug1', 'sug2', 'sug3', 'sug4'];

export function AiTab() {
  const { state, actions, dict: L, dir } = useStudio();

  // الاكتشاف يشغّل `claude --version` و`codex --version`؛ مرّةً واحدة لكلّ جلسة تكفي.
  useEffect(() => {
    if (state.aiAgents === null) actions.detectAiAgents();
  }, [state.aiAgents, actions]);

  const engines: Array<{ id: AiEngine; label: string; available: boolean; title?: string }> = [
    // أثناء الاكتشاف تظهر الشريحتان معطّلتين في مكانهما، لا تُضافان لاحقًا: إضافتُهما
    // بعد ثانيتين كانت تزيح بقيّة الشرائح تحت المؤشّر، فتقع النقرةُ على غير ما قُصد.
    ...(state.aiAgents ?? [
      { id: 'claude' as const, label: 'Claude', path: null, version: null },
      { id: 'codex' as const, label: 'Codex', path: null, version: null },
    ]).map((a) => ({ id: a.id, label: a.label, available: !!a.path, title: a.path ? a.version ?? a.path : state.aiAgents === null ? '…' : L.ai_missing })),
    { id: 'custom', label: L.ai_eng_custom, available: true },
    { id: 'local', label: L.ai_eng_local, available: true },
  ];
  const note = state.aiEngine === 'local' ? L.ai_note : state.aiEngine === 'custom' ? L.ai_note_custom : L.ai_note_agent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
        {/* لا عنوانَ «مِزو» ثانٍ هنا: رأسُ لوح الإضافة يحمل الاسم ووجهه (`ContentPanel.tsx`) —
            كان الاسم يُكتَب مرّتين فوق بعض (جولة الاستخدام). */}
        <div data-testid="ai-engines" role="radiogroup" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 3, borderRadius: 'var(--rs)', background: 'var(--surface2)' }}>
          {engines.map((e) => {
            const on = state.aiEngine === e.id;
            return (
              <button
                key={e.id}
                role="radio"
                aria-checked={on}
                data-testid={`ai-engine-${e.id}`}
                disabled={!e.available || state.aiTyping}
                title={e.title}
                onClick={() => actions.setAiEngine(e.id)}
                style={{
                  flex: '1 1 auto',
                  height: 26,
                  padding: '0 10px',
                  border: 0,
                  borderRadius: 'calc(var(--rs) - 2px)',
                  background: on ? 'var(--seg)' : 'transparent',
                  boxShadow: on ? '0 1px 2px rgba(0,0,0,.12)' : 'none',
                  color: !e.available ? 'var(--muted2, var(--muted))' : on ? 'var(--text)' : 'var(--muted)',
                  fontWeight: on ? 700 : 500,
                  fontSize: 11.5,
                  opacity: e.available ? 1 : 0.5,
                  cursor: e.available ? 'pointer' : 'not-allowed',
                }}
              >
                {e.label}
              </button>
            );
          })}
        </div>
        {state.aiEngine === 'custom' && (
          <input
            data-testid="ai-custom-cmd"
            dir="ltr"
            value={state.aiCustomCmd}
            onChange={(e) => actions.setAiCustomCmd(e.target.value)}
            placeholder={L.ai_custom_ph}
            style={{ height: 30, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', outline: 0, fontSize: 11.5, fontFamily: 'ui-monospace, Menlo, monospace' }}
          />
        )}
        <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{note}</span>
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
          {state.aiTyping && state.aiEngine !== 'local' ? (
            <button data-testid="ai-stop" onClick={actions.cancelAi} title={L.ai_stop} style={{ width: 36, height: 36, border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--text)', display: 'grid', placeItems: 'center' }}>
              <span style={{ width: 11, height: 11, borderRadius: 2, background: 'currentColor' }} />
            </button>
          ) : (
            <button data-testid="ai-send" onClick={() => actions.sendAi(state.aiInput)} disabled={state.aiTyping} style={{ width: 36, height: 36, border: 0, borderRadius: 'var(--rs)', background: 'var(--accent)', color: 'var(--onAccent)', display: 'grid', placeItems: 'center' }}>
              <Icon size={16} path="M3 10L17 3l-4 14-3-6-7-1z" style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageList() {
  const { state, dict: L } = useStudio();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.aiMsgs.length, state.aiTyping]);

  return (
    <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!state.aiMsgs.length && <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7, padding: '4px 2px' }}>{state.aiEngine === 'local' ? L.ai_welcome : L.ai_welcome_agent}</div>}
      {state.aiMsgs.map((m, i) => {
        const isUser = m.role === 'u';
        return (
          <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '88%', padding: '9px 12px', borderRadius: 14, background: isUser ? 'var(--accent)' : 'var(--surface2)', color: isUser ? 'var(--onAccent)' : 'var(--text)', fontSize: 12.5, lineHeight: 1.65 }}>
              {m.text}
            </div>
          </div>
        );
      })}
      {state.aiTyping && (
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', borderRadius: 14, background: 'var(--surface2)' }}>
            <Dot delay={0} />
            <Dot delay={0.2} />
            <Dot delay={0.4} />
            {state.aiEngine !== 'local' && <span style={{ fontSize: 11.5, color: 'var(--muted)', marginInlineStart: 6 }}>{L.ai_working}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', animation: `mz-pulse 1s ease ${delay}s infinite` }} />;
}

export function MizoAvatar({ size }: { size: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', position: 'relative', display: 'block' }}>
      <span style={{ position: 'absolute', left: size * 0.29, top: size * 0.38, width: size * 0.11, height: size * 0.11, borderRadius: '50%', background: 'var(--onAccent)' }} />
      <span style={{ position: 'absolute', right: size * 0.29, top: size * 0.38, width: size * 0.11, height: size * 0.11, borderRadius: '50%', background: 'var(--onAccent)' }} />
      <span style={{ position: 'absolute', left: size * 0.36, right: size * 0.36, top: size * 0.53, height: size * 0.14, borderBottom: `${Math.max(1.5, size * 0.055)}px solid var(--onAccent)`, borderRadius: '0 0 12px 12px' }} />
    </span>
  );
}
