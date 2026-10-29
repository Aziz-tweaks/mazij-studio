//! **ربطُ مزيج بتطبيقات الذكاء على الكمبيوتر** (٢٩ أكتوبر ٢٠٢٦).
//!
//! قرار المالك: الذكاء على حساب المستخدم لا على مزيج. وعلى الكمبيوتر هذا ممكنٌ بالطريقة
//! الرسميّة: تطبيقُ Claude للكمبيوتر وClaude Code وCodex كلُّها تقبل «خادمَ أدوات» محلّيًّا
//! (MCP) يُشغَّل بأمر. فمزيج يسجّل نفسه عندها بضغطة، والمستخدم يكلّم Claude في تطبيقه الرسميّ
//! باشتراكه هو، والتصميمُ يتغيّر أمامه في مزيج.
//!
//! **كيف يصل الطلب:** التطبيقُ يشغّل `Mazij --mcp-stdio` (هذا الملفّ التنفيذيّ نفسُه، بلا
//! نافذة). هذه العمليّة الصغيرة جسرٌ لا أكثر: تقرأ رسائل MCP من مدخلها القياسيّ وتمرّرها إلى
//! خادم مزيج المحلّيّ (`mcp.rs` على 127.0.0.1) الذي تحمله النافذةُ المفتوحة، وتعيد الردّ.
//! والجسرُ يجد المنفذَ والرمز في ملفٍّ يكتبه مزيج حين يُشغَّل خادمُه ويحذفه حين يُطفأ —
//! الرمزُ يتجدّد كلَّ تشغيل، والملفُّ مقروءٌ لصاحب الحساب وحده.
//!
//! وإن لم يكن مزيج مفتوحًا فتحه الجسرُ وانتظره، فيكفي المستخدمَ أن يكتب لـClaude.

use serde_json::{json, Value};
use std::io::{BufRead, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const APP_ID: &str = "studio.mazij.app";
const SERVER_NAME: &str = "mazij";

fn home() -> PathBuf {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from).unwrap_or_default()
}

/// مجلّدُ بيانات مزيج — المجلّدُ نفسُه الذي يحفظ فيه تاوري المشاريع.
fn app_data_dir() -> PathBuf {
    if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(home).join(APP_ID)
    } else if cfg!(target_os = "macos") {
        home().join("Library/Application Support").join(APP_ID)
    } else {
        home().join(".local/share").join(APP_ID)
    }
}

fn endpoint_file() -> PathBuf {
    app_data_dir().join("mcp-endpoint.json")
}

/// يكتبه مزيج حين يُشغَّل خادمُ أدواته. صلاحيّاتُه لصاحب الحساب وحده (0600).
pub fn write_endpoint(port: u16, token: &str) {
    let path = endpoint_file();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let body = json!({ "port": port, "token": token, "pid": std::process::id() }).to_string();
    if std::fs::write(&path, body).is_ok() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
    }
}

pub fn clear_endpoint() {
    let _ = std::fs::remove_file(endpoint_file());
}

fn read_endpoint() -> Option<(u16, String)> {
    let v: Value = serde_json::from_str(&std::fs::read_to_string(endpoint_file()).ok()?).ok()?;
    Some((v["port"].as_u64()? as u16, v["token"].as_str()?.to_string()))
}

// ─────────────────────────── الجسر: stdio ⇄ HTTP ───────────────────────────

/// طلبُ HTTP بسيط على 127.0.0.1 — لا مكتبة: الخادمُ محلّيّ والصيغةُ معروفة.
fn post(port: u16, path: &str, token: &str, body: &str, timeout: Duration) -> Result<(u16, String), String> {
    http("POST", port, path, token, body, timeout)
}

fn http(method: &str, port: u16, path: &str, token: &str, body: &str, timeout: Duration) -> Result<(u16, String), String> {
    let mut s = TcpStream::connect(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    s.set_read_timeout(Some(timeout)).ok();
    let req = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    s.read_to_end(&mut raw).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&raw).to_string();
    let (head, rest) = text.split_once("\r\n\r\n").ok_or("bad response")?;
    let status = head.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
    let chunked = head.to_ascii_lowercase().contains("transfer-encoding: chunked");
    let body = if chunked { dechunk(rest) } else { rest.to_string() };
    Ok((status, body))
}

fn dechunk(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some((size, after)) = rest.split_once("\r\n") {
        let n = usize::from_str_radix(size.trim(), 16).unwrap_or(0);
        if n == 0 || after.len() < n {
            break;
        }
        out.push_str(&after[..n]);
        rest = after[n..].trim_start_matches("\r\n");
    }
    out
}

/// يفتح مزيج إن لم يكن مفتوحًا.
fn launch_app() {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").args(["-g", "-b", APP_ID]).status();
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Ok(exe) = std::env::current_exe() {
            let _ = Command::new(exe).spawn();
        }
    }
}

/// منفذٌ ورمزٌ يعملان الآن — يفتح مزيج وينتظره إن لزم.
fn connect(wait: Duration) -> Option<(u16, String)> {
    let deadline = Instant::now() + wait;
    let mut launched = false;
    loop {
        if let Some((port, token)) = read_endpoint() {
            if let Ok((200, body)) = http("GET", port, "/status", &token, "", Duration::from_secs(3)) {
                let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
                if v["enabled"].as_bool() == Some(true) && v["toolCount"].as_u64().unwrap_or(0) > 0 {
                    return Some((port, token));
                }
            }
        }
        if !launched {
            launch_app();
            launched = true;
        }
        if Instant::now() >= deadline {
            return None;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
}

fn rpc_error(id: &Value, msg: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": msg } })
}

const NOT_RUNNING: &str = "مزيج غير مفتوح أو الربط موقوف. افتح مزيج وفعّل «الربط مع Claude» من إعدادات مِزو. / Mazij is not running or the link is off — open Mazij and turn on the link in Mizo settings.";

/// نقطةُ دخول `--mcp-stdio`: رسائل JSON-RPC سطرًا بسطر على المدخل والمخرج القياسيَّين.
pub fn run_stdio_proxy() {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    let mut conn: Option<(u16, String)> = None;
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
        let id = msg.get("id").cloned();
        let method = msg["method"].as_str().unwrap_or("").to_string();

        // التحيّةُ يُجاب عنها هنا، فيظهر «مزيج» في Claude ولو كان مغلقًا ساعتها.
        if method == "initialize" {
            let pv = msg["params"]["protocolVersion"].as_str().unwrap_or("2024-11-05").to_string();
            let reply = json!({ "jsonrpc": "2.0", "id": id, "result": {
                "protocolVersion": pv,
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
                "instructions": "Mazij (مزيج) is the user's design app. Start with document_get, then edit the open design with the tools. Reply to the user in their language."
            }});
            let _ = writeln!(out, "{reply}");
            let _ = out.flush();
            continue;
        }
        // الإشعاراتُ (بلا معرّف) لا ردَّ لها.
        let Some(id) = id else { continue };

        let mut reply: Option<Value> = None;
        for attempt in 0..2 {
            if conn.is_none() {
                conn = connect(Duration::from_secs(if attempt == 0 { 20 } else { 8 }));
            }
            let Some((port, token)) = conn.clone() else { break };
            // الخادمُ نفسُه يَحدّ كلَّ أداةٍ بمهلتها (`tool_wait_secs` في mcp.rs، حتى ساعةٍ للتصدير)،
            // فلا يقطع الجسرُ قبله.
            match post(port, "/mcp", &token, &line, Duration::from_secs(3700)) {
                Ok((200, body)) => {
                    // ردٌّ بصيغة SSE (‏`data: {...}`) أو JSON صريح.
                    let json_text = body.lines().find_map(|l| l.strip_prefix("data:")).map(|s| s.trim().to_string()).unwrap_or(body);
                    reply = serde_json::from_str(&json_text).ok();
                    break;
                }
                // رمزٌ قديم (أُعيد تشغيلُ مزيج) أو خادمٌ أُطفئ: نعيد الاتصال مرّةً واحدة.
                _ => conn = None,
            }
        }
        let reply = reply.unwrap_or_else(|| rpc_error(&id, NOT_RUNNING));
        let _ = writeln!(out, "{reply}");
        let _ = out.flush();
    }
}

// ─────────────────────────── تسجيلُ مزيج عند التطبيقات ───────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct LinkTarget {
    pub id: String,
    pub installed: bool,
    pub linked: bool,
}

fn exe() -> Result<String, String> {
    std::env::current_exe().map(|p| p.to_string_lossy().to_string()).map_err(|e| e.to_string())
}

fn claude_desktop_config() -> PathBuf {
    if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(home).join("Claude/claude_desktop_config.json")
    } else {
        home().join("Library/Application Support/Claude/claude_desktop_config.json")
    }
}

fn claude_desktop_installed() -> bool {
    if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("AnthropicClaude").exists()).unwrap_or(false) || claude_desktop_config().parent().map(Path::exists).unwrap_or(false)
    } else {
        Path::new("/Applications/Claude.app").exists() || home().join("Applications/Claude.app").exists()
    }
}

fn codex_config() -> PathBuf {
    home().join(".codex/config.toml")
}

fn read_json(path: &Path) -> Value {
    std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(|| json!({}))
}

/// نسخةٌ احتياطيّة مرّةً واحدة قبل أوّل تعديلٍ لملفّ إعدادٍ لا يملكه مزيج.
fn backup_once(path: &Path) {
    let bak = path.with_extension(format!("{}.mazij-backup", path.extension().and_then(|e| e.to_str()).unwrap_or("")));
    if path.exists() && !bak.exists() {
        let _ = std::fs::copy(path, bak);
    }
}

#[tauri::command]
pub fn ai_link_status() -> Vec<LinkTarget> {
    let cd = read_json(&claude_desktop_config());
    let codex_bin = crate::agents::find_bin_pub("codex");
    let claude_bin = crate::agents::find_bin_pub("claude");
    let codex_linked = std::fs::read_to_string(codex_config()).map(|s| s.contains("[mcp_servers.mazij]")).unwrap_or(false);
    let claude_code_linked = read_json(&home().join(".claude.json"))["mcpServers"][SERVER_NAME].is_object();
    vec![
        LinkTarget { id: "claude-desktop".into(), installed: claude_desktop_installed(), linked: cd["mcpServers"][SERVER_NAME].is_object() },
        LinkTarget { id: "claude-code".into(), installed: claude_bin.is_some(), linked: claude_code_linked },
        LinkTarget { id: "codex".into(), installed: codex_bin.is_some(), linked: codex_linked },
    ]
}

#[tauri::command]
pub fn ai_link(target: String) -> Result<(), String> {
    let exe = exe()?;
    match target.as_str() {
        "claude-desktop" => {
            let path = claude_desktop_config();
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            backup_once(&path);
            let mut cfg = read_json(&path);
            if !cfg["mcpServers"].is_object() {
                cfg["mcpServers"] = json!({});
            }
            cfg["mcpServers"][SERVER_NAME] = json!({ "command": exe, "args": ["--mcp-stdio"] });
            std::fs::write(&path, serde_json::to_string_pretty(&cfg).unwrap()).map_err(|e| e.to_string())
        }
        "claude-code" => {
            let bin = crate::agents::find_bin_pub("claude").ok_or("Claude Code غير مثبّت")?;
            let _ = Command::new(&bin).args(["mcp", "remove", "--scope", "user", SERVER_NAME]).output();
            let o = Command::new(&bin).args(["mcp", "add", "--scope", "user", SERVER_NAME, "--", &exe, "--mcp-stdio"]).output().map_err(|e| e.to_string())?;
            if o.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&o.stderr).to_string()) }
        }
        "codex" => {
            let path = codex_config();
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            backup_once(&path);
            let cur = std::fs::read_to_string(&path).unwrap_or_default();
            let cleaned = strip_toml_section(&cur, "[mcp_servers.mazij]");
            let exe_toml = exe.replace('\\', "\\\\").replace('"', "\\\"");
            let block = format!("\n[mcp_servers.mazij]\ncommand = \"{exe_toml}\"\nargs = [\"--mcp-stdio\"]\n");
            std::fs::write(&path, format!("{}{}", cleaned.trim_end(), block)).map_err(|e| e.to_string())
        }
        _ => Err("unknown target".into()),
    }
}

#[tauri::command]
pub fn ai_unlink(target: String) -> Result<(), String> {
    match target.as_str() {
        "claude-desktop" => {
            let path = claude_desktop_config();
            let mut cfg = read_json(&path);
            if let Some(m) = cfg["mcpServers"].as_object_mut() {
                m.remove(SERVER_NAME);
            }
            std::fs::write(&path, serde_json::to_string_pretty(&cfg).unwrap()).map_err(|e| e.to_string())
        }
        "claude-code" => {
            let bin = crate::agents::find_bin_pub("claude").ok_or("Claude Code غير مثبّت")?;
            Command::new(&bin).args(["mcp", "remove", "--scope", "user", SERVER_NAME]).output().map(|_| ()).map_err(|e| e.to_string())
        }
        "codex" => {
            let path = codex_config();
            let cur = std::fs::read_to_string(&path).unwrap_or_default();
            std::fs::write(&path, strip_toml_section(&cur, "[mcp_servers.mazij]")).map_err(|e| e.to_string())
        }
        _ => Err("unknown target".into()),
    }
}

/// يحذف قسمًا من ملفّ TOML: من رأسه إلى رأس القسم التالي.
fn strip_toml_section(src: &str, header: &str) -> String {
    let mut out = Vec::new();
    let mut skipping = false;
    for line in src.lines() {
        let t = line.trim();
        if t == header {
            skipping = true;
            continue;
        }
        if skipping && t.starts_with('[') {
            skipping = false;
        }
        if !skipping {
            out.push(line);
        }
    }
    let mut s = out.join("\n");
    if src.ends_with('\n') {
        s.push('\n');
    }
    s
}

/// يفتح تطبيق Claude (بعد الربط يحتاج إعادة تشغيل ليقرأ الإعداد).
#[tauri::command]
pub fn ai_restart_claude_desktop() {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("osascript").args(["-e", "tell application \"Claude\" to quit"]).status();
        std::thread::sleep(Duration::from_millis(1200));
        let _ = Command::new("open").args(["-a", "Claude"]).status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill").args(["/IM", "claude.exe", "/F"]).status();
        if let Some(p) = std::env::var_os("LOCALAPPDATA") {
            let _ = Command::new(PathBuf::from(p).join("AnthropicClaude/claude.exe")).spawn();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strip_section_keeps_others() {
        let src = "a = 1\n[mcp_servers.x]\ncommand = \"x\"\n[mcp_servers.mazij]\ncommand = \"m\"\nargs = []\n[other]\nb = 2\n";
        let out = strip_toml_section(src, "[mcp_servers.mazij]");
        assert!(out.contains("[mcp_servers.x]") && out.contains("[other]") && !out.contains("mazij"));
    }
    #[test]
    fn dechunk_works() {
        assert_eq!(dechunk("5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n"), "hello world");
    }
}
