import { MCP_BRIDGE_PORT } from '../data/constants';
import { MCP_TOOLS, type McpCtx } from './mcpTools';

/** Roadmap #20: the frontend half of the Rust↔webview bridge. Deliberately plain
 * `fetch` long-polling against the Rust server's bridge endpoints
 * (`/bridge/attach`, `/bridge/next`, `/bridge/reply`, `/bridge/detach`) rather than
 * Tauri's own IPC — see `src-tauri/src/mcp.rs` for why (same code path works
 * whether this page is the real Tauri window or a plain browser tab, which is
 * exactly what lets `qa/mcp-server.spec.mjs` prove it for real without driving a
 * native WKWebView).
 *
 * Security shape of these requests, after the reproduced CSRF documented in
 * `mcp.rs`: every call carries the bearer token minted for the current listening
 * period, and every call is deliberately a CORS **simple** request — token in the
 * query string instead of an `Authorization` header, `text/plain` instead of
 * `application/json` — so that none of them needs a preflight. That is what lets
 * the Rust side answer `OPTIONS` with 405 for everybody and never negotiate CORS
 * with anyone. The bridge routes are also the *only* ones that tolerate an
 * `Origin` header at all (and only the app's own); the MCP client surface,
 * `/mcp` included, answers 403 to any request that carries one. */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let generation = 0;

function toolCatalog() {
  return MCP_TOOLS.map((t) => ({
    name: t.name,
    description: `${t.descriptionAr} / ${t.descriptionEn}`,
    inputSchema: t.inputSchema,
  }));
}

/** The token travels as a query parameter purely to keep these CORS-simple; it
 * never leaves 127.0.0.1 and nothing on either side logs a URL. */
function bridgeUrl(port: number, path: string, token: string): string {
  return `http://127.0.0.1:${port}${path}?token=${encodeURIComponent(token)}`;
}

/** Comfortably over the Rust side's own 8s `/bridge/next` deadline, so a normal
 * empty long poll always wins the race and only a wedged one is cut. */
const POLL_TIMEOUT_MS = 12_000;
/** Short on purpose: these are small POSTs over loopback that normally complete in
 * single-digit milliseconds, and this bound is what sets how long "I just enabled
 * the bridge" takes to actually become usable when the first attempt lands on a
 * poisoned pooled socket. Measured end to end on the packaged app: attached ~3s
 * after the switch in the worst case, immediately in the common one. */
const POST_TIMEOUT_MS = 2_500;

/** Every bridge request is bounded, with no exceptions.
 *
 * Not defensive padding — a reproduced hang. `mcp_stop` destroys the listener, but
 * `tiny_http`'s per-connection tasks can still be holding sockets the webview has
 * pooled; a request WebKit sends down one of those after the next `mcp_start` is
 * parsed by a task whose consumer is gone, so it is never answered and the `fetch`
 * never settles. The poll loop then parks forever on a single request and the
 * bridge is silently deaf: a socket is listening, the dialog shows a token, and
 * the server sits at `enabled:false` with an empty catalog. Observed on the
 * packaged app as "enable works, disable→enable does not". A request that cannot
 * outlive its own deadline cannot cause that, and the abort makes WebKit discard
 * the poisoned connection so the retry gets a clean one. */
async function bridgeFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: abort.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** `text/plain` with a JSON body on purpose — see the note above. The Rust side
 * parses the body as JSON regardless of the declared type. */
function simplePost(port: number, path: string, token: string, body: unknown): Promise<Response> {
  return bridgeFetch(
    bridgeUrl(port, path, token),
    { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) },
    POST_TIMEOUT_MS,
  );
}

interface BridgeCall {
  id: string;
  tool: string;
  arguments?: Record<string, unknown>;
}

async function runLoop(port: number, token: string, myGen: number, ctx: McpCtx) {
  // Attachment is owned by the loop and retried until the server acknowledges it,
  // rather than being done once before the loop starts. A one-shot attach whose
  // failure is swallowed is how disable→enable came out of the packaged app as a
  // bridge that was listening, tokenised and connected — and deaf (`enabled:false`,
  // empty catalog, forever). Between the deadline in `bridgeFetch` and this retry,
  // every way that first POST can be lost is now recoverable.
  let attached = false;

  while (generation === myGen) {
    if (!attached) {
      try {
        const res = await simplePost(port, '/bridge/attach', token, { tools: toolCatalog() });
        if (res.status === 401 || res.status === 403) return;
        attached = res.ok;
      } catch {
        attached = false;
      }
      if (!attached) {
        await sleep(400);
        continue;
      }
    }

    let call: BridgeCall | null = null;
    try {
      const res = await bridgeFetch(bridgeUrl(port, '/bridge/next', token), { method: 'GET' }, POLL_TIMEOUT_MS);
      if (res.status === 204) continue;
      if (res.status === 401 || res.status === 403) {
        // Our token is no longer the one this listener accepts (it was restarted
        // under us, so a *newer* token exists). Stop rather than hammer a surface
        // that is correctly refusing us — the switch has to be flipped again to
        // mint a token we are allowed to use.
        return;
      }
      if (!res.ok) {
        await sleep(1000);
        continue;
      }
      call = (await res.json()) as BridgeCall;
    } catch {
      // Rust server not reachable (bridge just switched off, or the long poll was
      // cut) — the loop only expresses *intent*; it keeps retrying quietly instead
      // of surfacing a scary error for something this transient. Re-attaching on
      // the way back is the point: a listener we lost contact with may well be a
      // new one that has never heard of us.
      attached = false;
      await sleep(1500);
      continue;
    }
    if (generation !== myGen) return;

    let replyBody: Record<string, unknown>;
    const tool = MCP_TOOLS.find((t) => t.name === call.tool);
    try {
      if (!tool) throw new Error(`unknown tool "${call.tool}"`);
      // أداةٌ لا تنتهي أبدًا كانت تُصمت الجسرَ كلَّه إلى الأبد (الحلقةُ واقفةٌ عندها). فلكلّ
      // أداةٍ سقف — أطولُ من مهلة الخادم نفسِه لها (`tool_wait_secs` في mcp.rs) — ثم تُكمل الحلقة.
      const limitMs = call.tool === 'export_run' ? 3_700_000 : call.tool === 'batch' ? 900_000 : 180_000;
      const result = await Promise.race([
        tool.run(call.arguments ?? {}, ctx),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`tool "${call.tool}" did not finish in time`)), limitMs)),
      ]);
      replyBody = { id: call.id, result };
    } catch (err) {
      replyBody = { id: call.id, error: err instanceof Error ? err.message : String(err) };
    }
    try {
      await simplePost(port, '/bridge/reply', token, replyBody);
    } catch {
      // The Rust side is already past its own wait timeout by the time this would
      // matter; nothing more to do for this call.
    }
  }
}

/** `token` is required: there is no unauthenticated mode to fall back to. It comes
 * from `startMcpServer()` in `mcpServerControl.ts` (the `mcp_start` command's
 * return value in the real app). */
export function startMcpBridge(ctx: McpCtx, token: string, port: number = MCP_BRIDGE_PORT): void {
  generation += 1;
  // `/bridge/attach` is one call rather than `/enable` followed by
  // `/register-tools`: there must be no window in which the bridge is accepting
  // `tools/call` with an empty catalog. The loop performs it and keeps performing
  // it until it is acknowledged — see the note in `runLoop`.
  void runLoop(port, token, generation, ctx);
}

export function stopMcpBridge(token: string, port: number = MCP_BRIDGE_PORT): void {
  generation += 1;
  // Best-effort courtesy: in the real app `mcp_stop` is about to destroy the whole
  // listener anyway, which clears attachment and forgets the token. This matters
  // for the Tauri-less QA path, where the process keeps listening.
  simplePost(port, '/bridge/detach', token, {}).catch(() => {});
}
