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
