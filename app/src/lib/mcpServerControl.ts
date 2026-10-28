import { hasDesktopSidecars as inTauri } from './tauriEnv';
import { MCP_BRIDGE_PORT } from '../data/constants';

/** Roadmap #20 security fix — the *listener's* lifetime, as opposed to the
 * bridge's polling loop (that is `mcpBridge.ts`).
 *
 * `src-tauri/src/lib.rs::run()` used to call `mcp::spawn()` unconditionally, so the
 * socket on 127.0.0.1:7420 existed from launch to quit no matter what the MCP
 * dialog said, with no authentication on it. That was reproduced against the
 * packaged app with curl — `lsof -iTCP:7420` LISTEN while the UI read "off", and
 * `POST /enable` with a `text/plain` body (a CORS simple request, so no preflight)
 * succeeding from an arbitrary `Origin`. The socket is therefore no longer a
 * process-lifetime fact: it is created by the `mcp_start` command when the user
 * flips the switch and destroyed by `mcp_stop` when they flip it back, and
 * `mcp_start` hands back the bearer token minted for that one listening period. */

export interface McpStartInfo {
  port: number;
  token: string;
}

declare global {
  interface Window {
    /** QA escape hatch, Tauri-less pages only — see `startMcpServer` below. */
    __MAZIJ_MCP_TOKEN__?: string;
  }
}

/** Opens the listener and returns the credential for it.
 *
 * Outside Tauri there is no `mcp_start` to invoke: the page is either the Vite dev
 * server in a plain browser or the Playwright tab in `qa/mcp-server.spec.mjs`, and
 * in both cases the Rust server is the standalone `mcp_server` binary started by
 * someone else. That someone also owns the token, and passes it to this page on
 * `window.__MAZIJ_MCP_TOKEN__` — which models the real flow (the user reads the
 * token out of the dialog and pastes it into their MCP client) without any code
 * path that would print or persist a credential. If it is absent we fail loudly
 * rather than fall back to an unauthenticated bridge; "it quietly worked without a
 * token" is the bug being fixed. */
export async function startMcpServer(): Promise<McpStartInfo> {
  if (inTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<McpStartInfo>('mcp_start');
  }
  const token = window.__MAZIJ_MCP_TOKEN__;
  if (!token) {
    throw new Error(
      'This page is not running inside Mazij Studio, so it cannot open the MCP listener. ' +
        'Start src-tauri/target/debug/mcp_server with MAZIJ_MCP_TOKEN set and expose the same ' +
        'value as window.__MAZIJ_MCP_TOKEN__.',
    );
  }
  return { port: MCP_BRIDGE_PORT, token };
}

/** Closes the listener for real — `mcp::stop()` unblocks the accept loop, joins it
 * and drops the `Server`, so `lsof -nP -iTCP:7420` prints nothing afterwards. A
 * no-op outside Tauri, where this page does not own the process that bound it. */
export async function stopMcpServer(): Promise<void> {
  if (!inTauri) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('mcp_stop');
}

/** Asks Rust whether a socket actually exists, rather than trusting our own flag.
 * Returns `null` outside Tauri, where the answer is not ours to give. */
export async function isMcpListening(): Promise<boolean | null> {
  if (!inTauri) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<boolean>('mcp_is_listening');
}
