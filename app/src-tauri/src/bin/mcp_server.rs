//! Roadmap #20 QA helper: runs the exact same `mcp.rs` module the shipped Tauri
//! app embeds, but headless (no window) — a real WKWebView isn't drivable by
//! Playwright on macOS, so `qa/mcp-server.spec.mjs` exercises the real server via
//! this binary plus a real browser tab as the frontend bridge peer, instead of
//! trying to automate the native app window.
//!
//! The bridge now requires a bearer token on every route (see the security note in
//! `mcp.rs`: a reproduced CSRF, not a hypothetical). The token is taken from
//! `MAZIJ_MCP_TOKEN` and never printed. That is deliberate: the harness generates
//! it, passes it in the environment, and injects the same value into the browser
//! tab — which models the real flow (the user copies the token out of the MCP
//! dialog and pastes it into their client) without this binary ever writing a
//! credential to stdout, a log or a file.
fn main() {
    let token = match std::env::var("MAZIJ_MCP_TOKEN") {
        Ok(t) if !t.trim().is_empty() => t,
        _ => {
            eprintln!(
                "[mcp_server] refusing to start: set MAZIJ_MCP_TOKEN to the bearer token this \
                 server should accept. Nothing is bound without it, because an unauthenticated \
                 local control surface is the defect this binary exists to test against."
            );
            std::process::exit(2);
        }
    };
    match app_lib::mcp::start(app_lib::mcp::MCP_PORT, Some(token)) {
        Ok(info) => println!("[mcp_server] listening on 127.0.0.1:{}", info.port),
        Err(e) => {
            eprintln!("[mcp_server] {e}");
            std::process::exit(1);
        }
    }
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}
