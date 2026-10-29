// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Roadmap #20 — public so `src/bin/mcp_server.rs` can run the identical module
// headless (no Tauri window) for QA; see `mcp.rs` for the design rationale.
pub mod mcp;

// مِزو عبر وكلاءٍ خارجيّين (Claude Code / Codex / مخصّص) — انظر `agents.rs`.
pub mod agents;

// ربطُ مزيج بتطبيق Claude للكمبيوتر وClaude Code وCodex — انظر `link.rs`.
pub mod link;
mod awake;

/// Roadmap #20, security fix: `run()` used to call `mcp::spawn(mcp::MCP_PORT)`
/// unconditionally, so 127.0.0.1:7420 went to LISTEN the instant the app launched
/// while the MCP dialog (whose `mcpServerEnabled` flag defaults to `false`)
/// truthfully displayed "off". The UI said no local control surface existed and
/// `lsof -iTCP:7420` said otherwise; that gap was *reproduced* with curl, not
/// theorised. The socket now only exists between an `mcp_start` and an `mcp_stop`,
/// both driven by the switch in `McpServerDialog.tsx`.
///
/// `mcp_start` returns the freshly minted bearer token so the dialog can show it
/// for the user to paste into their MCP client. The token crosses the Tauri IPC
/// boundary exactly once and is never logged on either side.
#[tauri::command]
fn mcp_start() -> Result<mcp::StartInfo, String> {
    let info = mcp::start(mcp::MCP_PORT, None)?;
    // جسرُ `--mcp-stdio` (تطبيق Claude، Codex) يجد المنفذَ والرمزَ هنا.
    link::write_endpoint(info.port, &info.token);
    awake::begin();
    Ok(info)
}

#[tauri::command]
fn mcp_stop() {
    awake::end();
    link::clear_endpoint();
    mcp::stop();
}

/// Lets the frontend ask reality rather than trusting its own flag — the precise
/// reconciliation that was missing when the listener's lifetime was independent of
/// the switch.
#[tauri::command]
fn mcp_is_listening() -> bool {
    mcp::is_listening()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet, mcp_start, mcp_stop, mcp_is_listening, agents::agent_detect, agents::agent_run, agents::agent_cancel, link::ai_link_status, link::ai_link, link::ai_unlink, link::ai_restart_claude_desktop])
        // The bridge must not outlive the window that owns the document, and a
        // listener surviving a quit would be a local control surface with no UI
        // at all attached to it.
        .on_window_event(|_window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                agents::agent_cancel();
                link::clear_endpoint();
                mcp::stop();
            }
        })
        .setup(|app| {
            use tauri::Manager;
            for (_, win) in app.webview_windows() {
                awake::configure_webview(&win);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        // ‏⌘Q لا يمرّ بحدث إغلاق النافذة: ملفُّ المنفذ يُحذف عند خروج التطبيق كلِّه أيضًا.
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                link::clear_endpoint();
                mcp::stop();
            }
        });
}
