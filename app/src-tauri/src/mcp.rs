//! Roadmap #20 — Mazij as an MCP server.
//!
//! Transport: a local HTTP server (not stdio), because stdio would require the
//! MCP client to spawn its own process disconnected from the one GUI session that
//! actually holds the live document — there would be nothing for it to bridge to.
//! A server embedded in the already-running Tauri binary, listening on
//! 127.0.0.1 only, lets an external MCP client reach the live app; if the app
//! isn't running — or the user hasn't switched the bridge on — there is simply
//! nothing listening on the port, which is itself the "fail with a clear message"
//! the client sees (connection refused).
//!
//! The Rust↔webview half of the bridge (`/bridge/*`, `/register-tools`) is plain
//! HTTP long-polling rather than Tauri's own IPC, on purpose: it works identically
//! whether the page is the real Tauri window or a plain browser tab pointed at the
//! dev server, which is what lets `qa/mcp-server.spec.mjs` prove the whole chain
//! for real without driving a native WKWebView (not controllable by Playwright on
//! macOS). The actual shipped app wires the exact same server via the `mcp_start`/
//! `mcp_stop` Tauri commands in `lib.rs`; `src/bin/mcp_server.rs` runs the
//! identical module headless for tests.
//!
//! # Security — rewritten after a *reproduced* CSRF, not a hypothetical
//!
//! The first cut of this file bound the socket unconditionally from `lib.rs::run()`,
//! answered `tools/list` to anybody, had no authentication at all, and replied to
//! every request with `Access-Control-Allow-Origin: *`. All three were confirmed
//! exploitable against the packaged app with plain `curl`:
//!
//! * `lsof -iTCP:7420` showed the port LISTEN from the moment the app launched,
//!   while the MCP dialog truthfully reported "off" (the frontend flag defaults to
//!   `false`) — the UI misrepresented a live local control surface as absent.
//! * `POST /mcp {"method":"tools/list"}` returned the whole tool catalog with 200
//!   before any opt-in; the `enabled` flag gated only `tools/call`.
//! * `curl -X POST http://127.0.0.1:7420/enable -H 'Content-Type: text/plain'
//!   -H 'Origin: https://evil.example'` returned `{"enabled":true}` / 200. Because
//!   a `text/plain` POST is a CORS *simple* request it is sent with **no**
//!   preflight, so any page the user happened to be visiting while Mazij was open
//!   could enable the bridge and then drive `tools/call`. CORS stops the attacker
//!   from *reading* the replies, but every interesting tool here (`set_text`,
//!   `undo`, palette and geometry edits, `export_run`) is a *write* — the side
//!   effects land regardless. That is a working cross-site request forgery against
//!   the user's own design document.
//!
//! The three countermeasures, in the order a request meets them:
//!
//! 1. **Nothing is bound until the user opts in.** `start()` is the only thing that
//!    creates the socket and it is called from a Tauri command the MCP dialog
//!    invokes; `stop()` `unblock()`s the accept loop, joins it and drops the
//!    `Server` so the listener fd is really closed. With the switch off,
//!    `lsof -nP -iTCP:7420` prints nothing at all — the UI and reality agree. One
//!    accept thread exists per *listening period*, not per toggle, and `start()`
//!    retries the bind briefly so enable→disable→enable never trips
//!    "address already in use".
//!
//! 2. **A bearer token on every route, including `/status`, `/enable` and `/mcp`.**
//!    Minted fresh (24 bytes of OS randomness) each time the bridge is enabled and
//!    handed back to the frontend so the dialog can show it for the user to paste
//!    into their MCP client. It is never written to a log, never persisted, and
//!    dropped on `stop()`. Anything without it gets a bare 401 before routing. A
//!    forged cross-site request cannot read the token (it is not a cookie and not
//!    reachable from another origin), so this alone defeats the CSRF above; the
//!    next item is defence in depth.
//!
//! 3. **An `Origin` header is fatal on the MCP client surface.** A real local MCP
//!    client speaks raw HTTP and never sends `Origin`; a browser always does. So
//!    `/status`, `/enable`, `/disable` and `/mcp` answer 403 to *any* request
//!    carrying `Origin`, whatever its value and whatever the content type — which
//!    closes the entire forgery class rather than one content-type trick. `OPTIONS`
//!    is answered 405 everywhere: this server deliberately does not negotiate
//!    preflights for anyone.
//!
//!    The one unavoidable exception is the webview bridge surface (`/bridge/*`,
//!    `/register-tools`), whose legitimate peer *is* a browser page (see the
//!    transport note above) and therefore always sends `Origin`. Those routes
//!    accept only the app's own first-party origins (`FIRST_PARTY_ORIGINS`) and
//!    still require the token, and they are shaped as CORS *simple* requests —
//!    token in the query string, `text/plain` bodies — precisely so that no
//!    preflight is needed and `OPTIONS` can stay rejected. They also carry no
//!    document-mutating verb: the mutating path is `tools/call` on `/mcp`, which is
//!    on the strict surface.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{Cursor, Read};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

/// Must match `MCP_BRIDGE_PORT` in `src/data/constants.ts` — a fixed literal on
/// each side rather than a handshake, since it never changes at runtime.
pub const MCP_PORT: u16 = 7420;

/// Hard ceiling on a request body. The largest legitimate one is the webview's
/// tool catalog (tens of KB); anything past this is either a bug or someone trying
/// to make an unauthenticated request allocate.
const MAX_BODY_BYTES: u64 = 4 * 1024 * 1024;

/// Whether an `Origin` may be the Mazij webview itself, as opposed to some page on
/// the internet. Consulted *only* for `/bridge/*` and `/register-tools`; the MCP
/// client surface rejects every `Origin` outright, whatever its value.
///
/// Stated as a rule rather than a literal list on purpose, because a literal list
/// would be a guess that silently breaks the product: Tauri v2 serves the packaged
/// app from the `tauri://localhost` custom protocol on macOS/Linux and from
/// `http(s)://tauri.localhost` on Windows, WebKit may present a custom-protocol
/// document as the opaque `null` origin instead, and `tauri dev` / the Playwright
/// tab in `qa/mcp-server.spec.mjs` come from a Vite dev server whose port is
/// whatever was free. The three accepted shapes are:
///
/// * `null` — an opaque origin. A page on the internet can also manufacture this
///   (a sandboxed iframe), which is why it is accepted *only* here, only with the
///   token, and only for routes that cannot touch the document.
/// * any scheme that is not `http`/`https` — a web page's origin is always one of
///   those two (or `null`), so `tauri://…` cannot be forged by one.
/// * `http(s)://localhost|127.0.0.1|tauri.localhost`, any port — the dev server and
///   the Windows custom-protocol form.
///
/// What this is *not* doing is treating the origin as the security boundary. The
/// bearer token is; this is the second lock, and it is the one that makes
/// `https://evil.example` fail before it is even asked for a credential.
fn is_first_party_origin(origin: &str) -> bool {
    if origin == "null" {
        return true;
    }
    let rest = match origin.split_once("://") {
        Some(("http", rest)) | Some(("https", rest)) => rest,
        // Non-http(s) scheme: a custom protocol, i.e. the app's own webview.
        Some(_) => return true,
        None => return false,
    };
    // `rest` is `host[:port]`, with an IPv6 host in brackets (`[::1]:1420`).
    let host = match rest.strip_prefix('[') {
        Some(v6) => v6.split(']').next().unwrap_or(""),
        None => rest.split(':').next().unwrap_or(""),
    };
    matches!(host, "localhost" | "127.0.0.1" | "::1" | "tauri.localhost")
}

struct PendingCall {
    id: String,
    tool: String,
    arguments: Value,
}

#[derive(Default)]
struct McpState {
    /// The owning Mazij webview has attached and registered its catalog. Distinct
    /// from "a socket exists": the headless QA binary binds without any window
    /// attached, which is exactly the state `tools/call` must refuse.
    enabled: bool,
    /// `None` whenever nothing is listening. Never logged, never persisted.
    token: Option<String>,
    tools: Vec<Value>,
    queue: VecDeque<PendingCall>,
    results: HashMap<String, Result<Value, String>>,
    next_id: u64,
}

struct Shared {
    state: Mutex<McpState>,
    call_added: Condvar,
    result_added: Condvar,
}

static SHARED: OnceLock<Shared> = OnceLock::new();

fn shared() -> &'static Shared {
    SHARED.get_or_init(|| Shared {
        state: Mutex::new(McpState::default()),
        call_added: Condvar::new(),
        result_added: Condvar::new(),
    })
}

/// The live listener, if any. Holding the `Server` is the whole point: it is the
/// only way to `unblock()` the accept loop later, and the only way to guarantee the
/// listening fd is closed (rather than leaked for the process lifetime) when the
/// user switches the bridge back off.
struct Listener {
    server: Arc<Server>,
    accept: JoinHandle<()>,
    port: u16,
}

static LISTENER: Mutex<Option<Listener>> = Mutex::new(None);

/// What `start()` hands back to the frontend: everything the user needs to point an
/// MCP client at this app, and nothing else.
#[derive(Serialize, Clone)]
pub struct StartInfo {
    pub port: u16,
    pub token: String,
}

/// 24 bytes of OS randomness as lowercase hex. `/dev/urandom` on the platforms
/// Mazij ships to; `RandomState` (seeded by the OS per process) is the portable
/// fallback so a missing `/dev/urandom` degrades to a still-unguessable token
/// rather than to a predictable one.
fn mint_token() -> String {
    let mut bytes = [0u8; 24];
    let filled = std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .is_ok();
    if !filled {
        use std::hash::{BuildHasher, Hasher};
        let seed = std::collections::hash_map::RandomState::new();
        let stack_addr = &bytes as *const _ as usize;
        for (i, chunk) in bytes.chunks_mut(8).enumerate() {
            let mut h = seed.build_hasher();
            h.write_u64(i as u64);
            h.write_u128(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0),
            );
            h.write_usize(stack_addr);
            chunk.copy_from_slice(&h.finish().to_le_bytes()[..chunk.len()]);
        }
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Length-independent, non-short-circuiting comparison. The token never travels
/// over a network link here, so a timing oracle is largely theoretical — but the
/// cost of not handing one out is a three-line loop.
fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut diff = (a.len() ^ b.len()) as u8;
    for i in 0..a.len().max(b.len()) {
        diff |= a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0);
    }
    diff == 0
}

/// Binds 127.0.0.1:`port`, mints a token and starts the single accept thread for
/// this listening period. Idempotent: if something is already listening the
/// existing token is returned instead of rebinding, so a double-click on the
/// dialog's switch cannot strand a listener.
///
/// `preset_token` exists only for `src/bin/mcp_server.rs`, which is handed a token
/// by the QA harness through the environment so that nothing ever has to *print*
/// one. The shipped app always passes `None`.
pub fn start(port: u16, preset_token: Option<String>) -> Result<StartInfo, String> {
    let mut guard = LISTENER.lock().unwrap();
    if let Some(existing) = guard.as_ref() {
        // Already listening — hand back the token this listening period already
        // minted rather than rebinding (which would only ever fail) or minting a
        // second one (which would silently invalidate the client the user already
        // configured).
        let mut st = shared().state.lock().unwrap();
        let token = st
            .token
            .get_or_insert_with(|| preset_token.unwrap_or_else(mint_token))
            .clone();
        return Ok(StartInfo { port: existing.port, token });
    }

    // `Server`'s `Drop` closes the listening socket from its own internal accept
    // thread, so a disable→enable in quick succession can momentarily still find
    // the fd open. Retrying for a beat is what makes repeated toggling work
    // without ever surfacing "address already in use" to the user.
    let deadline = Instant::now() + Duration::from_secs(2);
    let server = loop {
        match Server::http(("127.0.0.1", port)) {
            Ok(s) => break s,
            Err(e) => {
                if Instant::now() >= deadline {
                    return Err(format!("failed to bind 127.0.0.1:{port}: {e}"));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    };

    let token = preset_token.unwrap_or_else(mint_token);
    {
        let mut st = shared().state.lock().unwrap();
        // A fresh listening period starts with a fresh everything: no stale tool
        // catalog from the previous one, no queued call nobody is waiting on, and
        // `enabled` false until the webview attaches.
        st.enabled = false;
        st.token = Some(token.clone());
        st.tools.clear();
        st.queue.clear();
        st.results.clear();
    }

    let server = Arc::new(server);
    let accept_server = Arc::clone(&server);
    let accept = std::thread::spawn(move || {
        for request in accept_server.incoming_requests() {
            // Still one thread per request, not per toggle: `/bridge/next` parks
            // for up to 8s and `tools/call` for up to 20s, and `tools/call` only
            // completes *because* a concurrent `/bridge/next` is being served.
            // Handling inline would deadlock the bridge against itself.
            std::thread::spawn(move || handle(request));
        }
        // Reached only via `unblock()` from `stop()`.
    });

    *guard = Some(Listener { server, accept, port });
    Ok(StartInfo { port, token })
}

/// Tears the listener down for real: forgets the token, drops the attached state,
/// unblocks the accept loop, waits for it, then drops the last `Server` reference
/// so the listening fd is closed before this returns. After `stop()`,
/// `lsof -nP -iTCP:7420` prints nothing.
pub fn stop() {
    let listener = LISTENER.lock().unwrap().take();
    {
        let mut st = shared().state.lock().unwrap();
        st.enabled = false;
        st.token = None;
        st.tools.clear();
        st.queue.clear();
        st.results.clear();
    }
    // Wake anything parked in a long poll so it stops holding its connection.
    shared().call_added.notify_all();
    shared().result_added.notify_all();
    if let Some(l) = listener {
        l.server.unblock();
        let _ = l.accept.join();
        // `tiny_http`'s per-connection tasks keep parsing requests off sockets that
        // are still open and pushing them into the server's queue — a queue whose
        // only consumer, the accept loop above, has just exited. Anything already
        // in there would otherwise never be answered at all, leaving the peer's
        // `fetch` hanging forever rather than failing. Answer it, then drop.
        while let Ok(Some(rq)) = l.server.try_recv() {
            let _ = rq.respond(empty_resp(503));
        }
        drop(l.server);
    }
}

/// Whether a socket currently exists. Lets the frontend reconcile its own switch
/// with reality instead of asserting a state it never verified — the exact gap
/// that made the original defect invisible.
pub fn is_listening() -> bool {
    LISTENER.lock().unwrap().is_some()
}

// ---------------------------------------------------------------------------
// Request admission
// ---------------------------------------------------------------------------

/// Which of the two surfaces a path belongs to. See the security note at the top:
/// `Client` is spoken by a real MCP client and must never see a browser;
/// `WebviewBridge` is spoken *by* a browser page by design.
#[derive(PartialEq)]
enum Surface {
    Client,
    WebviewBridge,
}

fn surface_of(path: &str) -> Option<Surface> {
    match path {
        "/status" | "/enable" | "/disable" | "/mcp" => Some(Surface::Client),
        "/bridge/next" | "/bridge/reply" | "/bridge/attach" | "/bridge/detach" | "/register-tools" => {
            Some(Surface::WebviewBridge)
        }
        _ => None,
    }
}

/// `name` is `&'static str` because that is what `tiny_http`'s case-insensitive
/// `HeaderField::equiv` takes; every caller here passes a literal anyway.
fn header_value<'a>(request: &'a Request, name: &'static str) -> Option<&'a str> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv(name))
        .map(|h| h.value.as_str())
}

/// Splits `/bridge/next?token=…` into path and the `token` query parameter. Kept
/// hand-rolled rather than pulling in a URL crate: the only parameter this server
/// has ever taken is the token.
fn split_url(url: &str) -> (&str, Option<&str>) {
    match url.split_once('?') {
        None => (url, None),
        Some((path, query)) => {
            let token = query.split('&').find_map(|pair| pair.strip_prefix("token="));
            (path, token)
        }
    }
}

fn json_resp(code: u16, value: &Value) -> Response<Cursor<Vec<u8>>> {
    let body = serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string());
    Response::from_string(body)
        .with_status_code(StatusCode(code))
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
}

fn empty_resp(code: u16) -> Response<Cursor<Vec<u8>>> {
    Response::from_string(String::new()).with_status_code(StatusCode(code))
}

/// The *only* place an `Access-Control-Allow-Origin` header is ever produced, and
/// only for an origin already checked against `FIRST_PARTY_ORIGINS`. Never `*`:
/// the wildcard is what let `https://evil.example` read this server's replies.
/// `Allow-Methods`/`Allow-Headers` are deliberately absent — those exist to answer
/// preflights, and this server answers none.
fn with_allowed_origin<R: Read>(resp: Response<R>, origin: Option<&str>) -> Response<R> {
    match origin {
        Some(o) => resp
            .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], o.as_bytes()).unwrap())
            .with_header(Header::from_bytes(&b"Vary"[..], &b"Origin"[..]).unwrap()),
        None => resp,
    }
}

fn handle(mut request: Request) {
    let method = request.method().clone();
    let (path, query_token) = {
        let url = request.url();
        let (p, t) = split_url(url);
        (p.to_string(), t.map(|s| s.to_string()))
    };
    let origin = header_value(&request, "Origin").map(|s| s.to_string());
    let auth = header_value(&request, "Authorization").map(|s| s.to_string());

    // Read the body up front, *before* any rejection, and always. This is not
    // tidiness: adding the 401/403 checks below without draining first produced a
    // real, reproducible hang in the packaged app. A rejected POST (the stale
    // `/bridge/detach` the webview fires at the previous listening period) left its
    // body bytes unread in the keep-alive connection, so the next request WebKit
    // sent down that same connection — the new period's `/bridge/attach` — was
    // parsed starting in the middle of the old body and never completed. The bridge
    // then looked healthy (a socket, a token, a connected webview) while the server
    // sat at `enabled:false` with an empty catalog forever. Symptom: enable worked,
    // disable→enable did not.
    let mut body = String::new();
    if method != Method::Get && method != Method::Head {
        // Cap it: an unauthenticated caller must not be able to make this thread
        // allocate without bound before the token is even checked.
        let mut capped = request.as_reader().take(MAX_BODY_BYTES);
        let _ = capped.read_to_string(&mut body);
    }

    // This server negotiates no preflights for anybody. The bridge routes are
    // shaped as CORS simple requests so they never need one, and answering
    // `OPTIONS` was half of what made the forgery a one-liner.
    if method == Method::Options {
        let _ = request.respond(empty_resp(405));
        return;
    }

    let surface = match surface_of(&path) {
        Some(s) => s,
        None => {
            let _ = request.respond(json_resp(404, &json!({"error": "not found"})));
            return;
        }
    };

    // Origin check first, so an unauthenticated browser never even learns whether
    // its token guess was shaped right.
    let allowed_origin: Option<String> = match (&surface, origin.as_deref()) {
        (_, None) => None,
        (Surface::Client, Some(_)) => {
            // A real MCP client never sends `Origin`; a browser always does. 403
            // regardless of value or content type closes the whole CSRF class.
            let _ = request.respond(json_resp(
                403,
                &json!({"error": "requests carrying an Origin header are refused; the Mazij MCP bridge is not a web API"}),
            ));
            return;
        }
        (Surface::WebviewBridge, Some(o)) => {
            if !is_first_party_origin(o) {
                let _ = request.respond(json_resp(403, &json!({"error": "origin not allowed"})));
                return;
            }
            Some(o.to_string())
        }
    };

    // Then the token, on every route without exception.
    let presented = auth
        .as_deref()
        .and_then(|v| v.strip_prefix("Bearer ").or_else(|| v.strip_prefix("bearer ")))
        .map(|s| s.trim().to_string())
        .or(query_token);
    let authorized = {
        let st = shared().state.lock().unwrap();
        match (&st.token, presented.as_deref()) {
            (Some(expected), Some(got)) => ct_eq(expected, got),
            _ => false,
        }
    };
    if !authorized {
        // Bare body: no hint about whether a token exists, how long it is, or
        // whether the route is real. And nothing about the attempt is logged —
        // logging the presented value is how tokens end up in a crash report.
        let _ = request.respond(with_allowed_origin(
            json_resp(401, &json!({"error": "unauthorized"})),
            allowed_origin.as_deref(),
        ));
        return;
    }

    let response = match (&method, path.as_str()) {
        (Method::Get, "/status") => route_status(),
        (Method::Post, "/enable") => route_set_enabled(true),
        (Method::Post, "/disable") => route_set_enabled(false),
        (Method::Post, "/bridge/attach") => route_bridge_attach(&body),
        (Method::Post, "/bridge/detach") => route_set_enabled(false),
        (Method::Post, "/register-tools") => route_register_tools(&body),
        (Method::Get, "/bridge/next") => route_bridge_next(),
        (Method::Post, "/bridge/reply") => route_bridge_reply(&body),
        (Method::Post, "/mcp") => route_mcp(&body),
        _ => json_resp(405, &json!({"error": "method not allowed"})),
    };
    let _ = request.respond(with_allowed_origin(response, allowed_origin.as_deref()));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

fn route_status() -> Response<Cursor<Vec<u8>>> {
    let st = shared().state.lock().unwrap();
    // Reports attachment, never the token — a route that echoes the credential it
    // just validated is a credential leak waiting for a proxy.
    json_resp(200, &json!({"enabled": st.enabled, "port": MCP_PORT, "toolCount": st.tools.len()}))
}

fn route_set_enabled(on: bool) -> Response<Cursor<Vec<u8>>> {
    let mut st = shared().state.lock().unwrap();
    st.enabled = on;
    json_resp(200, &json!({"enabled": st.enabled}))
}

/// The webview announcing "I am the window that owns this document, and here is my
/// tool catalog" — one call so there is no window where the bridge is enabled with
/// an empty catalog. This is what `/enable` used to be for the frontend; `/enable`
/// stays on the client surface for an MCP client that wants it explicitly.
fn route_bridge_attach(body: &str) -> Response<Cursor<Vec<u8>>> {
    let tools = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v.get("tools").and_then(|t| t.as_array()).cloned())
        .unwrap_or_default();
    let mut st = shared().state.lock().unwrap();
    if !tools.is_empty() {
        st.tools = tools;
    }
    st.enabled = true;
    json_resp(200, &json!({"enabled": st.enabled, "toolCount": st.tools.len()}))
}

fn route_register_tools(body: &str) -> Response<Cursor<Vec<u8>>> {
    let parsed: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return json_resp(400, &json!({"error": "bad json"})),
    };
    let tools = parsed
        .get("tools")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut st = shared().state.lock().unwrap();
    st.tools = tools;
    json_resp(200, &json!({"ok": true}))
}

/// Long-polls up to 8s for a pending tool call so the frontend's poll loop paces
/// itself for free instead of busy-spinning.
fn route_bridge_next() -> Response<Cursor<Vec<u8>>> {
    let sh = shared();
    let mut st = sh.state.lock().unwrap();
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if let Some(call) = st.queue.pop_front() {
            return json_resp(200, &json!({"id": call.id, "tool": call.tool, "arguments": call.arguments}));
        }
        let now = Instant::now();
        if now >= deadline || st.token.is_none() {
            // `token == None` means `stop()` ran underneath us: return at once
            // instead of holding this connection for the rest of the 8s.
            return empty_resp(204);
        }
        let (guard, _) = sh.call_added.wait_timeout(st, deadline - now).unwrap();
        st = guard;
    }
}

#[derive(Deserialize)]
struct BridgeReplyBody {
    id: String,
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<String>,
}

fn route_bridge_reply(body: &str) -> Response<Cursor<Vec<u8>>> {
    let parsed: BridgeReplyBody = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return json_resp(400, &json!({"error": "bad json"})),
    };
    let sh = shared();
    {
        let mut st = sh.state.lock().unwrap();
        let outcome = match parsed.error {
            Some(e) => Err(e),
            None => Ok(parsed.result.unwrap_or(Value::Null)),
        };
        st.results.insert(parsed.id, outcome);
    }
    sh.result_added.notify_all();
    json_resp(200, &json!({"ok": true}))
}

#[derive(Deserialize)]
struct RpcRequest {
    #[serde(default)]
    id: Value,
    method: String,
    #[serde(default)]
    params: Value,
}

fn route_mcp(body: &str) -> Response<Cursor<Vec<u8>>> {
    let req: RpcRequest = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(e) => {
            return json_resp(
                200,
                &json!({"jsonrpc":"2.0","id": Value::Null, "error": {"code": -32700, "message": format!("parse error: {e}")}}),
            )
        }
    };
    let id = req.id.clone();

    match req.method.as_str() {
        "initialize" => json_resp(
            200,
            &json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {"name": "mazij-studio", "version": "0.1.0"},
                    "capabilities": {"tools": {}}
                }
            }),
        ),
        "notifications/initialized" | "ping" => json_resp(200, &json!({"jsonrpc": "2.0", "id": id, "result": {}})),
        "tools/list" => {
            // Reaching this line already required the token, so the catalog is no
            // longer the open metadata read it used to be. It is still gated on
            // attachment, because before the webview attaches there is genuinely
            // nothing to list.
            let st = shared().state.lock().unwrap();
            json_resp(200, &json!({"jsonrpc": "2.0", "id": id, "result": {"tools": st.tools}}))
        }
        "tools/call" => route_tools_call(id, &req.params),
        other => json_resp(
            200,
            &json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32601, "message": format!("unknown method \"{other}\"")}}),
        ),
    }
}

fn route_tools_call(id: Value, params: &Value) -> Response<Cursor<Vec<u8>>> {
    let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

    let sh = shared();
    let call_id = {
        let mut st = sh.state.lock().unwrap();
        if !st.enabled {
            return json_resp(
                200,
                &json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32000, "message": "MCP server is disabled — open Mazij Studio → \"خادم MCP\" / \"MCP server\" and enable it first."}}),
            );
        }
        if st.tools.is_empty() {
            return json_resp(
                200,
                &json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32001, "message": "no Mazij Studio window is connected to the bridge yet"}}),
            );
        }
        st.next_id += 1;
        let call_id = format!("call-{}", st.next_id);
        st.queue.push_back(PendingCall { id: call_id.clone(), tool: name, arguments });
        call_id
    };
    sh.call_added.notify_all();

    let mut st = sh.state.lock().unwrap();
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if let Some(outcome) = st.results.remove(&call_id) {
            return match outcome {
                Ok(value) => json_resp(
                    200,
                    &json!({"jsonrpc": "2.0", "id": id, "result": {"content": [{"type": "text", "text": serde_json::to_string(&value).unwrap_or_default()}]}}),
                ),
                Err(message) => json_resp(
                    200,
                    &json!({"jsonrpc": "2.0", "id": id, "result": {"content": [{"type": "text", "text": message}], "isError": true}}),
                ),
            };
        }
        let now = Instant::now();
        if now >= deadline {
            return json_resp(
                200,
                &json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32002, "message": "Mazij Studio did not reply in time — is the document window open and the bridge running?"}}),
            );
        }
        let (guard, _) = sh.result_added.wait_timeout(st, deadline - now).unwrap();
        st = guard;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpStream;

    /// A port nobody else in this repo uses, so the test never collides with a real
    /// Mazij window or the `mcp_server` QA binary on 7420.
    const TEST_PORT: u16 = 7429;

    /// `cargo test` runs tests in parallel threads, and every test here drives the
    /// one process-wide `LISTENER`. Run concurrently they fight: one test's `stop()`
    /// tears down the listener another is mid-request against, and the failure
    /// surfaces as `ConnectionRefused` in whichever test lost the race — a
    /// *different* test each run. Observed exactly that: plain `cargo test` failed
    /// 1 of 3, alternating which one, while `--test-threads=1` passed 3/3.
    ///
    /// Serialized here rather than by asking every future runner to remember a
    /// flag: a suite that only passes under a non-default invocation is a suite
    /// that gets believed when it is wrong.
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    /// Takes the serialization lock, ignoring poisoning — one panicking test must
    /// fail alone rather than cascade into every test that runs after it.
    fn serial() -> std::sync::MutexGuard<'static, ()> {
        TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    #[test]
    fn origin_rule_admits_the_webview_and_nothing_on_the_internet() {
        for ok in [
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
            "null",
            "http://localhost:1420",
            "http://localhost:1430",
            "http://127.0.0.1:1420",
            "http://[::1]:1420",
            "mazij://index.html",
        ] {
            assert!(is_first_party_origin(ok), "{ok} should be treated as the app's own webview");
        }
        for bad in [
            "https://evil.example",
            "http://evil.example",
            "https://localhost.evil.example",
            "https://tauri.localhost.evil.example",
            "http://127.0.0.1.evil.example",
            "https://127.0.0.2",
            "evil.example",
            "",
        ] {
            assert!(!is_first_party_origin(bad), "{bad} must never reach the bridge surface");
        }
    }

    fn raw_request(port: u16, request: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).expect("connect");
        s.write_all(request.as_bytes()).expect("write");
        let mut out = String::new();
        s.read_to_string(&mut out).expect("read");
        out
    }

    /// The keep-alive desync regression, which is what made disable→enable look
    /// like a broken bridge in the packaged app: a POST that gets rejected before
    /// its body is read leaves those bytes in the connection, and the *next*
    /// request the same connection carries is then parsed from the middle of them.
    /// Two rejected POSTs with bodies followed by a legitimate one, all on a single
    /// socket, is exactly the sequence WebKit produced.
    #[test]
    fn rejected_post_with_a_body_does_not_desync_the_connection() {
        let _guard = serial();
        let info = start(TEST_PORT + 1, None).expect("start");
        let mut s = TcpStream::connect(("127.0.0.1", TEST_PORT + 1)).expect("connect");

        // 1. wrong token, 2. forbidden Origin on the client surface — both carry a
        //    body, both are refused before routing.
        let catalog = r#"{"tools":[{"name":"t","inputSchema":{"type":"object"}}]}"#;
        let pipelined = format!(
            "POST /bridge/detach?token=wrong HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: text/plain\r\nContent-Length: 2\r\n\r\n{{}}\
             POST /enable HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://evil.example\r\nContent-Type: text/plain\r\nContent-Length: 2\r\n\r\n{{}}\
             POST /bridge/attach?token={token} HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: tauri://localhost\r\nContent-Type: text/plain\r\nContent-Length: {len}\r\nConnection: close\r\n\r\n{catalog}",
            token = info.token,
            len = catalog.len(),
        );
        s.write_all(pipelined.as_bytes()).expect("write");
        let mut out = String::new();
        s.read_to_string(&mut out).expect("read");

        assert_eq!(out.matches("HTTP/1.1 401").count(), 1, "{out}");
        assert_eq!(out.matches("HTTP/1.1 403").count(), 1, "{out}");
        assert!(out.contains("HTTP/1.1 200"), "the third request must still be understood: {out}");
        assert!(out.contains("\"enabled\":true"), "{out}");

        let enabled = shared().state.lock().unwrap().enabled;
        assert!(enabled, "the attach that followed two rejected bodies must have taken effect");
        stop();
    }

    /// The toggle-lifecycle regression: `mcp::spawn()` used to leak a listener for
    /// the whole process lifetime, so there was nothing to re-bind and nothing to
    /// test. Four transitions here, because a half-closed listener only shows up on
    /// the *second* re-enable.
    #[test]
    fn enable_disable_enable_rebinds_the_same_port() {
        let _guard = serial();
        for round in 0..4 {
            let info = start(TEST_PORT, None).unwrap_or_else(|e| panic!("round {round}: {e}"));
            assert_eq!(info.port, TEST_PORT);
            assert_eq!(info.token.len(), 48, "24 random bytes as hex");
            assert!(is_listening());

            // Fresh token every listening period, and the previous one is dead.
            let status = raw_request(
                TEST_PORT,
                &format!("GET /status HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n", info.token),
            );
            assert!(status.starts_with("HTTP/1.1 200"), "round {round}: {status}");

            let unauthorized = raw_request(
                TEST_PORT,
                "GET /status HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
            );
            assert!(unauthorized.starts_with("HTTP/1.1 401"), "round {round}: {unauthorized}");

            // An `Origin` on the client surface is fatal even with the token — the
            // reproduced CSRF, as a unit test.
            let forged = raw_request(
                TEST_PORT,
                &format!("POST /enable HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: text/plain\r\nOrigin: https://evil.example\r\nAuthorization: Bearer {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", info.token),
            );
            assert!(forged.starts_with("HTTP/1.1 403"), "round {round}: {forged}");
            assert!(!forged.contains("Access-Control-Allow-Origin"), "round {round}: {forged}");

            let preflight = raw_request(
                TEST_PORT,
                "OPTIONS /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://evil.example\r\nConnection: close\r\n\r\n",
            );
            assert!(preflight.starts_with("HTTP/1.1 405"), "round {round}: {preflight}");

            stop();
            assert!(!is_listening());
            assert!(
                TcpStream::connect(("127.0.0.1", TEST_PORT)).is_err(),
                "round {round}: the listening socket must really be closed by stop(), not leaked",
            );
        }
    }
}
