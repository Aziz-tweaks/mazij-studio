import { useState } from 'react';
import { Icon } from './Icon';
import { useStudio } from '../state/StudioContext';
import { interpretAndRun } from '../lib/commandInterpreter';
import type { McpCtx } from '../lib/mcpTools';

/** Roadmap #24-ب's settings surface: a plain text box that runs a sentence
 * through `commandInterpreter.ts` against the *live* document — same action
 * layer as the MCP server dialog (McpServerDialog.tsx), just driven by typed
 * Arabic/English instead of a remote `tools/call`. Each run is a one-shot
 * click, so closing over this render's `state`/`actions` (unlike the MCP
 * bridge's long-lived refs) is safe: there's no stale-closure window between a
 * click and the tool call it triggers. */
export function CommandInterpreterDialog() {
  const { state, actions, dict: L } = useStudio();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);

  if (!state.cmdInterpreterOpen) return null;

  const ctx: McpCtx = { getState: () => state, actions };

  const run = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const result = await interpretAndRun(text, ctx);
      setOutcome({ ok: result.understood, message: state.lang === 'ar' ? result.messageAr : result.messageEn });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="cmd-interpreter-dialog" onClick={actions.closeCmdInterpreter} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--overlay)', display: 'grid', placeItems: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>{L.nl_cmd_title}</h2>
          <button data-testid="close-cmd-interpreter-btn" onClick={actions.closeCmdInterpreter} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
            <Icon size={16} path="M5 5l10 10M15 5L5 15" />
          </button>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{L.nl_cmd_hint}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            data-testid="cmd-interpreter-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run();
            }}
            placeholder={L.nl_cmd_ph}
            style={{ flex: 1, height: 38, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}
          />
          <button
            data-testid="cmd-interpreter-run-btn"
            onClick={run}
            disabled={busy || !text.trim()}
            style={{ height: 38, padding: '0 16px', border: 0, borderRadius: 'var(--rs)', background: 'var(--accentSoft)', color: 'var(--accentText)', fontSize: 13, fontWeight: 600, opacity: busy ? 0.7 : 1 }}
          >
            {L.nl_cmd_run}
          </button>
        </div>

        {outcome && (
          <div
            data-testid={outcome.ok ? 'cmd-interpreter-success' : 'cmd-interpreter-failure'}
            style={{ fontSize: 12.5, color: outcome.ok ? 'var(--accentText)' : 'var(--danger)', padding: '8px 10px', border: '1px dashed var(--line)', borderRadius: 'var(--rs)', lineHeight: 1.6 }}
          >
            {outcome.message}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.nl_cmd_examples}</div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{L.nl_cmd_local_badge}</div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' }}>{L.nl_cmd_llm_limit}</div>
      </div>
    </div>
  );
}
