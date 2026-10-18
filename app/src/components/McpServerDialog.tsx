import { useState } from 'react';
import { Icon } from './Icon';
import { useStudio } from '../state/StudioContext';
import { MCP_BRIDGE_PORT } from '../data/constants';

/** Roadmap #20's settings surface: the explicit opt-in switch for the Rust-side MCP
 * bridge (src-tauri/src/mcp.rs) — off by default on every launch. See
 * docs/CONTROLS.md phase 15 for the threat model.
 *
 * This dialog previously *lied*, and it was proven to lie with curl: `lib.rs::run()`
 * bound 127.0.0.1:7420 at launch no matter what, so this surface rendered
 * "off"/`mcp_status_off` while `lsof -iTCP:7420` showed a LISTEN socket that
 * answered `tools/list` and `/enable` to anyone — including, via a `text/plain`
 * POST (a CORS simple request, hence no preflight), to any web page the user
 * happened to have open. So the copy here is now written to be *checkable*: it
 * names the port, says plainly whether anything is listening, and tells the user
 * the exact `lsof` command that will confirm it. The switch itself is causal now —
 * it runs `mcp_start`/`mcp_stop` — and the token it mints is displayed for pasting
 * into an MCP client, because without the token nothing can talk to the bridge. */
export function McpServerDialog() {
  const { state, actions, dict: L } = useStudio();
  const [copied, setCopied] = useState(false);
  if (!state.mcpOpen) return null;

  const listening = state.mcpServerEnabled && state.mcpToken !== null;

  const copyToken = async () => {
    if (!state.mcpToken) return;
    try {
      await navigator.clipboard.writeText(state.mcpToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied — the token is right there on screen to select
      // by hand, which is a better outcome than an error dialog over a copy button.
    }
  };

  return (
    <div data-testid="mcp-dialog" onClick={actions.closeMcp} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--overlay)', display: 'grid', placeItems: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'calc(var(--r) + 2px)', boxShadow: '0 30px 80px rgba(0,0,0,.35)', padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>{L.mcp_title}</h2>
          <button data-testid="close-mcp-btn" onClick={actions.closeMcp} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 'var(--rs)', background: 'transparent', color: 'var(--muted)' }}>
            <Icon size={16} path="M5 5l10 10M15 5L5 15" />
          </button>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{L.mcp_hint}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{L.mcp_enable}</span>
          <span data-testid="mcp-status" style={{ fontSize: 11.5, color: state.mcpServerEnabled ? 'var(--accent)' : 'var(--muted)' }}>
            {state.mcpServerEnabled ? L.mcp_status_on : L.mcp_status_off}
          </span>
          <button
            data-testid="mcp-toggle-btn"
            role="switch"
            aria-checked={state.mcpServerEnabled}
            onClick={() => actions.setMcpServerEnabled(!state.mcpServerEnabled)}
            style={{
              width: 44,
              height: 26,
              borderRadius: 13,
              border: '1px solid var(--line)',
              background: state.mcpServerEnabled ? 'var(--accent)' : 'var(--muted2, var(--line))',
              position: 'relative',
              flex: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                insetInlineStart: state.mcpServerEnabled ? 20 : 2,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                transition: 'inset-inline-start .15s',
              }}
            />
          </button>
        </div>

        {/* The honest socket statement. Not "off by default" — *whether a port is
            open right now*, which is the thing the old copy got wrong. */}
        <div
          data-testid="mcp-listen-state"
          style={{ fontSize: 11.5, color: listening ? 'var(--accent)' : 'var(--muted)', lineHeight: 1.6 }}
        >
          {listening ? L.mcp_listening : L.mcp_not_listening}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--muted)' }} dir="ltr">
          {L.mcp_port_label}: 127.0.0.1:{MCP_BRIDGE_PORT}
        </div>

        {state.mcpError && (
          <div data-testid="mcp-error" style={{ fontSize: 11.5, color: 'var(--danger, #e5484d)', lineHeight: 1.6 }}>
            {L.mcp_error_label}: {state.mcpError}
          </div>
        )}

        {state.mcpServerEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--rs)' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{L.mcp_token_label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code
                data-testid="mcp-token"
                dir="ltr"
                style={{ flex: 1, fontSize: 11, wordBreak: 'break-all', userSelect: 'all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--fg, inherit)' }}
              >
                {state.mcpToken ?? L.mcp_token_waiting}
              </code>
              {state.mcpToken && (
                <button
                  data-testid="mcp-copy-token-btn"
                  onClick={copyToken}
                  style={{ flex: 'none', fontSize: 11, padding: '5px 10px', borderRadius: 'var(--rs)', border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)' }}
                >
                  {copied ? L.mcp_copied : L.mcp_copy}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{L.mcp_token_hint}</div>
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, padding: '8px 10px', border: '1px dashed var(--line)', borderRadius: 'var(--rs)' }}>{L.mcp_threat}</div>
      </div>
    </div>
  );
}
