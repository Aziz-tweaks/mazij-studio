//! مِزو عبر وكلاءٍ خارجيّين: Claude Code وCodex، وأيُّ وكيلٍ يقبل أمرًا نصّيًّا.
//!
//! الفكرة كلُّها إعادةُ استعمالٍ لا مسارٌ موازٍ: الوكيلُ لا يكتب في المستند بنفسه،
//! بل يتّصل بخادم MCP المضمَّن (`mcp.rs`) على 127.0.0.1 ويستدعي الأدوات نفسها
//! التي يستدعيها المفسّرُ المحلّيّ وأيُّ عميلِ MCP آخر (`src/lib/mcpTools.ts`).
//! فكلُّ تعديلٍ يمرّ بأفعال المتجر الحقيقيّة، ويظهر على اللوحة لحظةَ تنفيذه،
//! ويدخل سجلَّ التراجع كأيّ تعديلٍ يدويّ.
//!
//! ## لماذا عمليّةٌ فرعيّة لا مفتاحُ API
//! الجهازُ عليه `claude` و`codex` مسجَّلان بحساب المستخدم. تشغيلُهما كما هما يعني:
//! لا مفاتيحَ تُخزَّن في التطبيق، ولا فاتورةً ثانية، والوكيلُ هو نفسه الذي يستعمله
//! المستخدم في الطرفيّة.
//!
//! ## أين يبحث عن الثنائيّات
//! تطبيقُ macOS المفتوح من Finder لا يرث `PATH` الطرفيّة — `PATH` عنده
//! `/usr/bin:/bin:/usr/sbin:/sbin` فقط. لذلك نبحث في المواضع المعروفة صراحةً،
//! ونمرّر للعمليّة الفرعيّة `PATH` يضمّ مجلّدَ الثنائيّ نفسه: `codex` سكربتُ Node
//! يبدأ بـ `#!/usr/bin/env node`، ولا يعمل إلا إن وُجد `node` بجواره.
//!
//! ## الرمز
//! رمزُ MCP يصل إلى العمليّة الفرعيّة **في بيئتها فقط** (`MAZIJ_MCP_TOKEN`)، لا في
//! سطر الأوامر الذي يراه `ps`. ملفُّ إعداد Claude يشير إليه بـ `${MAZIJ_MCP_TOKEN}`.

use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::mcp;

const MCP_URL: &str = "http://127.0.0.1:7420/mcp";
/// سقفُ تشغيلةٍ واحدة. التعديلاتُ الكبيرة (قالبٌ كامل) تأخذ دقيقةً أو اثنتين.
const RUN_TIMEOUT: Duration = Duration::from_secs(300);
/// كم ننتظر النافذةَ حتى تتّصل بالجسر بعد تشغيله.
const READY_TIMEOUT: Duration = Duration::from_secs(12);

static RUNNING: Mutex<Option<Child>> = Mutex::new(None);

#[derive(Serialize, Clone)]
pub struct AgentInfo {
    pub id: String,
    pub label: String,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Serialize)]
pub struct AgentReply {
    pub ok: bool,
    pub text: String,
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

/// المواضعُ التي يُثبَّت فيها Claude Code وCodex عادةً على macOS، ثم `PATH` الموروث.
fn search_dirs() -> Vec<PathBuf> {
    let h = home();
    let mut dirs = vec![
        h.join(".local/bin"),
        h.join(".claude/local"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        h.join(".npm-global/bin"),
        h.join(".bun/bin"),
        h.join(".volta/bin"),
        h.join(".cargo/bin"),
    ];
    // مسارات Node الشائعة، ومنها ما تحمله أدواتٌ أخرى معها.
    for root in [h.join(".nvm/versions/node"), h.join(".nvm/versions/node")] {
        if let Ok(rd) = std::fs::read_dir(&root) {
            let mut found: Vec<PathBuf> = rd.flatten().map(|e| e.path().join("bin")).filter(|p| p.is_dir()).collect();
            found.sort();
            found.reverse(); // الأحدث أوّلًا
            dirs.extend(found);
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    dirs
}

fn find_bin(name: &str) -> Option<PathBuf> {
    search_dirs().into_iter().map(|d| d.join(name)).find(|p| is_executable(p))
}

fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(p).map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0).unwrap_or(false)
}

/// `PATH` للعمليّة الفرعيّة: مجلّدُ الثنائيّ أوّلًا (من أجل `node` بجوار `codex`)، ثم الباقي.
fn child_path(bin: &Path) -> String {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(parent) = bin.parent() {
        dirs.push(parent.to_path_buf());
    }
    dirs.extend(search_dirs());
    dirs.push(PathBuf::from("/usr/bin"));
    dirs.push(PathBuf::from("/bin"));
    std::env::join_paths(dirs).map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
}

/// مجلّدُ عملٍ محايد: لا نريد أن يقرأ الوكيلُ `CLAUDE.md` أو `AGENTS.md` من أيّ مستودع.
fn work_dir() -> PathBuf {
    let d = home().join("Mazij/.agent");
    let _ = std::fs::create_dir_all(&d);
    d
}

fn version_of(bin: &Path) -> Option<String> {
    let mut cmd = Command::new(bin);
    cmd.arg("--version").env("PATH", child_path(bin)).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    let out = run_with_timeout(cmd, Duration::from_secs(8), false).ok()?;
    let line = out.0.lines().next()?.trim().to_string();
    if line.is_empty() { None } else { Some(line) }
}

/// يكتشف الوكلاءَ المثبّتين. بطيءٌ نسبيًّا (يشغّل `--version`)، فيُستدعى مرّةً عند فتح اللوحة.
#[tauri::command]
pub async fn agent_detect() -> Vec<AgentInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        [("claude", "Claude"), ("codex", "Codex")]
            .into_iter()
            .map(|(id, label)| {
                let path = find_bin(id);
                let version = path.as_deref().and_then(version_of);
                AgentInfo { id: id.into(), label: label.into(), path: path.map(|p| p.to_string_lossy().into_owned()), version }
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// يقسم قالبَ أمرٍ مخصّص إلى وسائط كما يفعل الصدفة، دون صدفة: مسافاتٌ تفصل،
/// وعلامتا التنصيص تجمعان. لا توسيعَ لمتغيّرات ولا أنابيب — عمدًا.
fn split_args(template: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    for c in template.chars() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => cur.push(c),
            None if c == '"' || c == '\'' => {
                quote = Some(c);
                started = true;
            }
            None if c.is_whitespace() => {
                if started || !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                    started = false;
                }
            }
            None => cur.push(c),
        }
    }
    if started || !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn wait_ready() -> Result<String, String> {
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        if let Some(t) = mcp::ready_token() {
            return Ok(t);
        }
        if Instant::now() >= deadline {
            return Err("لم يتّصل المستند بجسر الأدوات في الوقت المحدّد.".into());
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

/// يشغّل أمرًا ويجمع مخرجاته، مع مهلةٍ وإمكانِ الإلغاء (حين `register` صحيح).
fn run_with_timeout(mut cmd: Command, timeout: Duration, register: bool) -> Result<(String, String, bool), String> {
    let mut child = cmd.spawn().map_err(|e| format!("تعذّر تشغيل الوكيل: {e}"))?;
    let mut so = child.stdout.take();
    let mut se = child.stderr.take();
    let out_t = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(r) = so.as_mut() {
            let _ = r.read_to_string(&mut s);
        }
        s
    });
    let err_t = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(r) = se.as_mut() {
            let _ = r.read_to_string(&mut s);
        }
        s
    });
    let mut local = if register {
        *RUNNING.lock().unwrap() = Some(child);
        None
    } else {
        Some(child)
    };
    let deadline = Instant::now() + timeout;
    let success;
    loop {
        let status = if register {
            let mut g = RUNNING.lock().unwrap();
            match g.as_mut() {
                // أُلغي: `agent_cancel` قتله وأخذه.
                None => Some(false),
                Some(c) => match c.try_wait() {
                    Ok(Some(st)) => {
                        *g = None;
                        Some(st.success())
                    }
                    _ => None,
                },
            }
        } else {
            match local.as_mut().unwrap().try_wait() {
                Ok(Some(st)) => Some(st.success()),
                _ => None,
            }
        };
        if let Some(ok) = status {
            success = ok;
            break;
        }
        if Instant::now() >= deadline {
            if register {
                if let Some(mut c) = RUNNING.lock().unwrap().take() {
                    let _ = c.kill();
                    let _ = c.wait();
                }
            } else if let Some(c) = local.as_mut() {
                let _ = c.kill();
                let _ = c.wait();
            }
            return Err("انتهت المهلة قبل أن يُنهي الوكيلُ عمله.".into());
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    let out = out_t.join().unwrap_or_default();
    let err = err_t.join().unwrap_or_default();
    Ok((out, err, success))
}

fn claude_command(bin: &Path, prompt: &str, system: &str) -> Result<Command, String> {
    let cfg = serde_json::json!({
        "mcpServers": { "mazij": { "type": "http", "url": MCP_URL, "headers": { "Authorization": "Bearer ${MAZIJ_MCP_TOKEN}" } } }
    });
    let cfg_path = work_dir().join("claude-mcp.json");
    std::fs::write(&cfg_path, cfg.to_string()).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(bin);
    cmd.arg("-p")
        .arg(prompt)
        .arg("--mcp-config")
        .arg(&cfg_path)
        .arg("--strict-mcp-config")
        // لا أدواتَ مدمجة: لا صدفة ولا قراءةَ ملفّات. أدواتُ مزيج وحدها.
        .arg("--tools")
        .arg("")
        .arg("--allowedTools")
        .arg("mcp__mazij")
        .arg("--append-system-prompt")
        .arg(system)
        .arg("--output-format")
        .arg("json")
        .arg("--no-session-persistence");
    Ok(cmd)
}

fn codex_command(bin: &Path, prompt: &str, system: &str, last_msg: &Path) -> Command {
    let mut cmd = Command::new(bin);
    cmd.arg("exec")
        .arg("--skip-git-repo-check")
        .arg("--ephemeral")
        .arg("--sandbox")
        .arg("read-only")
        .arg("-c")
        .arg(format!("mcp_servers.mazij.url=\"{MCP_URL}\""))
        .arg("-c")
        .arg("mcp_servers.mazij.bearer_token_env_var=\"MAZIJ_MCP_TOKEN\"")
        // أدواتُ مزيج وحدها تُوافَق تلقائيًّا — لا الصدفة ولا الملفّات (الصندوق
        // `read-only` أعلاه). بدون هذا السطر يرفض `codex exec` كلَّ استدعاءٍ لأداة
        // MCP لأنه لا أحد هناك ليوافق، فيعتذر الوكيلُ دون أن يلمس التصميم — وهذا ما
        // حدث في أوّل تجربة.
        .arg("-c")
        .arg("mcp_servers.mazij.default_tools_approval_mode=\"approve\"")
        .arg("-c")
        .arg("approval_policy=\"never\"")
        .arg("-o")
        .arg(last_msg)
        .arg(format!("{system}\n\n---\n\nطلب المستخدم:\n{prompt}"));
    cmd
}

/// يستخرج الردَّ النهائيّ من مخرجات `claude -p --output-format json`.
fn claude_result(stdout: &str) -> Option<(bool, String)> {
    let v: serde_json::Value = serde_json::from_str(stdout.trim()).ok()?;
    let text = v.get("result").and_then(|r| r.as_str()).unwrap_or("").trim().to_string();
    let is_error = v.get("is_error").and_then(|b| b.as_bool()).unwrap_or(false);
    Some((!is_error, text))
}

fn tail(s: &str, n: usize) -> String {
    let t = s.trim();
    let chars: Vec<char> = t.chars().collect();
    if chars.len() <= n { t.to_string() } else { chars[chars.len() - n..].iter().collect() }
}

/// ينفّذ طلبًا واحدًا عبر وكيل. `agent`: ‏`claude` أو `codex` أو `custom`.
/// في `custom`، ‏`custom_cmd` قالبٌ تُستبدل فيه `{prompt}` و`{system}` و`{mcp_url}`،
/// ويجد الوكيلُ الرابطَ والرمزَ أيضًا في `MAZIJ_MCP_URL` و`MAZIJ_MCP_TOKEN`.
#[tauri::command]
pub async fn agent_run(agent: String, prompt: String, system: String, custom_cmd: Option<String>) -> Result<AgentReply, String> {
    tauri::async_runtime::spawn_blocking(move || run_blocking(&agent, &prompt, &system, custom_cmd.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

fn run_blocking(agent: &str, prompt: &str, system: &str, custom_cmd: Option<&str>) -> Result<AgentReply, String> {
    if RUNNING.lock().unwrap().is_some() {
        return Err("هناك طلبٌ قيد التنفيذ. انتظر حتى ينتهي أو أوقفه.".into());
    }
    let token = wait_ready()?;
    let last_msg = work_dir().join("codex-last.txt");
    let _ = std::fs::remove_file(&last_msg);

    let (mut cmd, bin) = match agent {
        "claude" => {
            let bin = find_bin("claude").ok_or("لم أجد Claude Code على هذا الجهاز.")?;
            (claude_command(&bin, prompt, system)?, bin)
        }
        "codex" => {
            let bin = find_bin("codex").ok_or("لم أجد Codex على هذا الجهاز.")?;
            (codex_command(&bin, prompt, system, &last_msg), bin)
        }
        "custom" => {
            let tpl = custom_cmd.unwrap_or("").trim();
            let mut parts = split_args(tpl).into_iter();
            let first = parts.next().ok_or("لم يُحدَّد أمرُ الوكيل المخصّص.")?;
            let bin = if first.contains('/') { PathBuf::from(&first) } else { find_bin(&first).ok_or(format!("لم أجد «{first}» على هذا الجهاز."))? };
            let mut cmd = Command::new(&bin);
            let mut used_prompt = false;
            for a in parts {
                if a.contains("{prompt}") {
                    used_prompt = true;
                }
                cmd.arg(a.replace("{prompt}", prompt).replace("{system}", system).replace("{mcp_url}", MCP_URL));
            }
            if !used_prompt {
                cmd.arg(format!("{system}\n\n---\n\n{prompt}"));
            }
            (cmd, bin)
        }
        other => return Err(format!("وكيلٌ غير معروف: {other}")),
    };

    cmd.current_dir(work_dir())
        .env("PATH", child_path(&bin))
        .env("MAZIJ_MCP_TOKEN", &token)
        .env("MAZIJ_MCP_URL", MCP_URL)
        .env("MAZIJ_PROMPT", prompt)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let (out, err, success) = run_with_timeout(cmd, RUN_TIMEOUT, true)?;

    if !success && out.trim().is_empty() && err.trim().is_empty() {
        return Ok(AgentReply { ok: false, text: "أُوقف الطلب.".into() });
    }
    let reply = match agent {
        "claude" => claude_result(&out).map(|(ok, t)| AgentReply { ok: ok && success, text: t }),
        "codex" => std::fs::read_to_string(&last_msg).ok().map(|t| AgentReply { ok: success, text: t.trim().to_string() }),
        _ => None,
    };
    Ok(reply.unwrap_or_else(|| {
        let text = if out.trim().is_empty() { tail(&err, 600) } else { tail(&out, 2000) };
        AgentReply { ok: success, text }
    }))
}

/// يوقف الطلبَ الجاري، إن وُجد.
#[tauri::command]
pub fn agent_cancel() {
    if let Some(mut c) = RUNNING.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::split_args;

    #[test]
    fn split_args_respects_quotes() {
        assert_eq!(split_args(r#"gemini -p "{prompt}" --yolo"#), vec!["gemini", "-p", "{prompt}", "--yolo"]);
        assert_eq!(split_args("a  'b c'  \"\""), vec!["a", "b c", ""]);
    }
}
