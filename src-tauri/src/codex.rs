//! ChatGPT, through Codex. The CLI holds the login; Doodle spawns it and
//! reads what it says. Text runs in a read-only sandbox with nothing to
//! read; images run in a scratch folder the tool may write into. Nothing
//! of the user's account is read here — not a token, not a file.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use base64::Engine;

#[derive(serde::Serialize)]
pub struct CodexStatus {
    pub found: bool,
    pub path: Option<String>,
    pub auth: Option<String>,
    pub version: Option<String>,
}

fn candidates() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(p) = std::env::var("DOODLE_CODEX") {
        v.push(PathBuf::from(p));
    }
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        v.push(Path::new(dir).join("codex"));
    }
    v.push(PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex"));
    if let Some(home) = std::env::var_os("HOME") {
        v.push(Path::new(&home).join(".local/bin/codex"));
    }
    v
}

pub fn find() -> Option<PathBuf> {
    candidates().into_iter().find(|p| p.is_file())
}

/// Which way the CLI is signed in, from the shape of its auth file only —
/// the mode, never a token.
fn auth_mode() -> Option<String> {
    let home = std::env::var_os("HOME")?;
    let raw = fs::read_to_string(Path::new(&home).join(".codex/auth.json")).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    v.get("auth_mode").and_then(|m| m.as_str()).map(|s| s.to_string())
}

#[tauri::command]
pub fn codex_status() -> CodexStatus {
    let path = find();
    let version = path.as_ref().and_then(|p| {
        Command::new(p).arg("--version").output().ok().and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        })
    });
    CodexStatus { found: path.is_some(), path: path.map(|p| p.display().to_string()), auth: auth_mode(), version }
}

fn scratch(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("codex").join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn run(bin: &Path, cwd: &Path, sandbox: &str, prompt: &str) -> Result<String, String> {
    let out = cwd.join("last.txt");
    let _ = fs::remove_file(&out);
    let mut child = Command::new(bin)
        .args(["exec", "--ephemeral", "--skip-git-repo-check", "-s", sandbox, "-C"])
        .arg(cwd)
        .arg("-o")
        .arg(&out)
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start Codex: {e}"))?;
    child.stdin.take().ok_or("no stdin")?.write_all(prompt.as_bytes()).map_err(|e| e.to_string())?;
    let done = child.wait_with_output().map_err(|e| e.to_string())?;
    if !done.status.success() {
        let err = String::from_utf8_lossy(&done.stderr);
        return Err(format!("Codex: {}", err.lines().last().unwrap_or("failed")));
    }
    fs::read_to_string(&out).map_err(|_| "Codex said nothing".to_string())
}

#[tauri::command]
pub async fn codex_text(app: tauri::AppHandle, prompt: String, system: Option<String>) -> Result<String, String> {
    let bin = find().ok_or("Codex is not installed")?;
    let cwd = scratch(&app, "text")?;
    let full = match system {
        Some(s) if !s.trim().is_empty() => format!("{s}\n\n---\n\n{prompt}"),
        _ => prompt,
    };
    tauri::async_runtime::spawn_blocking(move || run(&bin, &cwd, "read-only", &full))
        .await
        .map_err(|e| e.to_string())?
        .map(|s| s.trim().to_string())
}

#[derive(serde::Serialize)]
pub struct CodexImage {
    pub data_url: String,
    pub path: String,
}

#[tauri::command]
pub async fn codex_image(app: tauri::AppHandle, prompt: String, seed: u64) -> Result<CodexImage, String> {
    let bin = find().ok_or("Codex is not installed")?;
    let cwd = scratch(&app, &format!("image-{seed}-{}", std::process::id()))?;
    let name = format!("out-{seed}.png");
    let ask = format!(
        "Use your image generation tool to create one image: {prompt}\n\nSave the PNG into the current directory as {name}. Reply with only the absolute path of the saved file."
    );
    let cwd2 = cwd.clone();
    tauri::async_runtime::spawn_blocking(move || run(&bin, &cwd2, "workspace-write", &ask))
        .await
        .map_err(|e| e.to_string())??;
    // trust the folder, not the reply: the newest PNG in it
    let mut pngs: Vec<PathBuf> = fs::read_dir(&cwd)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "png").unwrap_or(false))
        .collect();
    pngs.sort_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).ok());
    let file = pngs.pop().ok_or("Codex made no image")?;
    let bytes = fs::read(&file).map_err(|e| e.to_string())?;
    let data_url = format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(&bytes));
    Ok(CodexImage { data_url, path: file.display().to_string() })
}

// ── the app server ──────────────────────────────────────────────────────────
// One long-lived `codex app-server` child, JSON-RPC over its stdio. A turn
// is a request; what comes back streams as notifications, which become
// Tauri events the front end listens to. Each turn gets a fresh, ephemeral,
// read-only thread — asks are independent and leave nothing behind.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, ChildStdin};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

struct Server {
    child: Child,
    stdin: ChildStdin,
    next_id: AtomicU64,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>>,
}

#[derive(Default)]
pub struct CodexState {
    server: Mutex<Option<Server>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum CodexEvent {
    Delta { turn_id: String, delta: String },
    Done { turn_id: String, text: String, status: String, error: Option<String> },
    Failed { turn_id: String, error: String },
}

fn start(app: &AppHandle) -> Result<Server, String> {
    let bin = find().ok_or("Codex is not installed")?;
    let mut child = Command::new(&bin)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not start the Codex app server: {e}"))?;
    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>> = Arc::default();

    // the reader: responses go to whoever asked; notifications become events
    let app2 = app.clone();
    let pending2 = pending.clone();
    std::thread::spawn(move || {
        let mut texts: HashMap<String, String> = HashMap::new();
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(m) = serde_json::from_str::<Value>(&line) else { continue };
            if std::env::var_os("DOODLE_CODEX_TRACE").is_some() {
                eprintln!("[codex] {}", &line[..line.len().min(200)]);
            }
            if let Some(id) = m.get("id").and_then(|i| i.as_u64()) {
                if let Some(tx) = pending2.lock().unwrap().remove(&id) {
                    let _ = tx.send(m);
                }
                continue;
            }
            let method = m.get("method").and_then(|s| s.as_str()).unwrap_or("");
            let p = &m["params"];
            let turn_id = p.get("turnId").and_then(|s| s.as_str()).map(String::from);
            match method {
                "item/agentMessage/delta" => {
                    if let (Some(t), Some(d)) = (turn_id, p.get("delta").and_then(|s| s.as_str())) {
                        texts.entry(t.clone()).or_default().push_str(d);
                        let _ = app2.emit("codex", CodexEvent::Delta { turn_id: t, delta: d.to_string() });
                    }
                }
                "item/completed" => {
                    // the final message, whole — what the deltas added up to, or better
                    if p["item"]["type"].as_str() == Some("agentMessage") {
                        if let (Some(t), Some(text)) = (turn_id, p["item"]["text"].as_str()) {
                            texts.insert(t, text.to_string());
                        }
                    }
                }
                "turn/completed" => {
                    let turn = &p["turn"];
                    if let Some(t) = turn["id"].as_str() {
                        let text = texts.remove(t).unwrap_or_default();
                        let status = turn["status"].as_str().unwrap_or("completed").to_string();
                        let error = turn["error"]["message"].as_str().map(String::from);
                        let _ = app2.emit("codex", CodexEvent::Done { turn_id: t.to_string(), text, status, error });
                    }
                }
                "error" => {
                    if let Some(t) = turn_id {
                        let will_retry = p["willRetry"].as_bool().unwrap_or(false);
                        if !will_retry {
                            let error = p["error"]["message"].as_str().unwrap_or("Codex failed").to_string();
                            let _ = app2.emit("codex", CodexEvent::Failed { turn_id: t, error });
                        }
                    }
                }
                _ => {}
            }
        }
    });

    let mut s = Server { child, stdin, next_id: AtomicU64::new(1), pending };
    let init = s.request("initialize", json!({ "clientInfo": { "name": "doodle", "title": "Doodle", "version": env!("CARGO_PKG_VERSION") } }))?;
    if init.get("error").is_some() {
        return Err(format!("Codex would not initialize: {}", init["error"]["message"]));
    }
    s.notify("initialized", json!({}))?;
    Ok(s)
}

impl Server {
    fn send(&mut self, v: &Value) -> Result<(), String> {
        let mut line = serde_json::to_string(v).map_err(|e| e.to_string())?;
        line.push('\n');
        self.stdin.write_all(line.as_bytes()).map_err(|e| format!("Codex went away: {e}"))?;
        self.stdin.flush().map_err(|e| e.to_string())
    }
    fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        self.send(&json!({ "jsonrpc": "2.0", "method": method, "params": params }))
    }
    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = mpsc::channel();
        self.pending.lock().unwrap().insert(id, tx);
        self.send(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))?;
        rx.recv_timeout(std::time::Duration::from_secs(60)).map_err(|_| "Codex did not answer".to_string())
    }
    fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

fn with_server<T>(app: &AppHandle, f: impl FnOnce(&mut Server) -> Result<T, String>) -> Result<T, String> {
    let state = app.state::<CodexState>();
    let mut guard = state.server.lock().unwrap();
    let dead = guard.as_mut().map(|s| !s.alive()).unwrap_or(true);
    if dead {
        *guard = Some(start(app)?);
    }
    f(guard.as_mut().unwrap())
}

#[derive(serde::Serialize)]
pub struct TurnHandle {
    pub thread_id: String,
    pub turn_id: String,
}

/// Start a turn: a fresh read-only ephemeral thread, the prompt (system
/// first), an optional schema the answer must match. Returns at once; the
/// words arrive as `codex` events.
#[tauri::command]
pub async fn codex_turn(app: AppHandle, prompt: String, system: Option<String>, schema: Option<Value>) -> Result<TurnHandle, String> {
    let cwd = scratch(&app, "text")?;
    let text = match system {
        Some(s) if !s.trim().is_empty() => format!("{s}\n\n---\n\n{prompt}"),
        _ => prompt,
    };
    tauri::async_runtime::spawn_blocking(move || {
        with_server(&app, |s| {
            let t = s.request("thread/start", json!({ "cwd": cwd, "sandbox": "read-only", "ephemeral": true, "approvalPolicy": "never" }))?;
            let thread_id = t["result"]["thread"]["id"].as_str().ok_or_else(|| format!("no thread: {}", t["error"]["message"]))?.to_string();
            let mut params = json!({ "threadId": thread_id, "input": [{ "type": "text", "text": text }] });
            if let Some(sc) = schema {
                params["outputSchema"] = sc;
            }
            let r = s.request("turn/start", params)?;
            let turn_id = r["result"]["turn"]["id"].as_str().ok_or_else(|| format!("no turn: {}", r["error"]["message"]))?.to_string();
            eprintln!("[codex] turn {turn_id} on thread {thread_id}");
            Ok(TurnHandle { thread_id, turn_id })
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn codex_interrupt(app: AppHandle, thread_id: String, turn_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_server(&app, |s| s.request("turn/interrupt", json!({ "threadId": thread_id, "turnId": turn_id })).map(|_| ()))
    })
    .await
    .map_err(|e| e.to_string())?
}
