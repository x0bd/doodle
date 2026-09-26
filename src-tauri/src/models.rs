//! The models on this Mac (PLAN.md M4.2): whether each is here, how much
//! of it is, and bringing one down — Hugging Face's own downloader through
//! `uv`, into Hugging Face's own cache, where mflux reads it. Plain HTTPS,
//! not Xet: its files grow on disk as they come, so the page can show how
//! far it has got, and a stopped download picks up where it was. A gated
//! model is fetched with the writer's Hugging Face token, which is kept in
//! the Keychain and nowhere else.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter};

const KEYCHAIN: &str = "Doodle — Hugging Face";

#[derive(Default)]
pub struct ModelsState {
    running: Arc<Mutex<HashMap<String, Child>>>,
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
}

fn hub() -> PathBuf {
    std::env::var_os("HF_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".cache/huggingface")).join("hub")
}

fn repo_dir(repo: &str) -> PathBuf {
    hub().join(format!("models--{}", repo.replace('/', "--")))
}

fn uv() -> Option<PathBuf> {
    ["/opt/homebrew/bin/uv", "/usr/local/bin/uv"].iter().map(PathBuf::from).chain([home().join(".local/bin/uv")]).find(|p| p.is_file())
}

/// bytes of a model on disk: finished files and the ones still coming
fn bytes_in(dir: &Path) -> u64 {
    std::fs::read_dir(dir.join("blobs")).map(|d| d.filter_map(Result::ok).filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum()).unwrap_or(0)
}

/// every file it needs, in one snapshot
fn whole(dir: &Path, need: &[String]) -> bool {
    std::fs::read_dir(dir.join("snapshots")).ok().is_some_and(|d| d.filter_map(Result::ok).any(|s| need.iter().all(|f| s.path().join(f).is_file())))
}

#[derive(serde::Serialize)]
pub struct Present {
    whole: bool,
    bytes: u64,
    fetching: bool,
}

#[tauri::command]
pub fn model_present(state: tauri::State<ModelsState>, id: String, repo: String, need: Vec<String>) -> Present {
    let dir = repo_dir(&repo);
    Present { whole: whole(&dir, &need), bytes: bytes_in(&dir), fetching: state.running.lock().unwrap().contains_key(&id) }
}

fn token() -> Option<String> {
    let out = Command::new("/usr/bin/security").args(["find-generic-password", "-s", KEYCHAIN, "-a", "huggingface", "-w"]).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string()).filter(|t| !t.is_empty())
}

#[tauri::command]
pub fn hf_token_has() -> bool {
    token().is_some()
}

/// Keep the writer's Hugging Face token in the Keychain (`-U`: replace one that is there).
#[tauri::command]
pub fn hf_token_set(value: String) -> Result<(), String> {
    let value = value.trim();
    if !value.starts_with("hf_") {
        return Err("That does not look like a Hugging Face token (they begin with hf_).".into());
    }
    let ok = Command::new("/usr/bin/security")
        .args(["add-generic-password", "-U", "-s", KEYCHAIN, "-a", "huggingface", "-w", value])
        .status()
        .map_err(|e| e.to_string())?
        .success();
    ok.then_some(()).ok_or_else(|| "The Keychain did not take it.".into())
}

#[tauri::command]
pub fn hf_token_forget() {
    let _ = Command::new("/usr/bin/security").args(["delete-generic-password", "-s", KEYCHAIN, "-a", "huggingface"]).status();
}

/// Bring a model down: `models` events — `{id, event: "progress", bytes}`
/// every second, then `done` or `failed` with the downloader's last words.
#[tauri::command]
pub fn model_fetch(app: AppHandle, state: tauri::State<ModelsState>, id: String, repo: String, include: Vec<String>, exclude: Vec<String>, need: Vec<String>) -> Result<(), String> {
    let uv = uv().ok_or("uv is not installed — brew install uv, then try again.")?;
    let mut running = state.running.lock().unwrap();
    if running.contains_key(&id) {
        return Ok(());
    }
    let mut cmd = Command::new(uv);
    cmd.args(["tool", "run", "--from", "huggingface_hub", "hf", "download", &repo]);
    if !include.is_empty() {
        cmd.arg("--include").args(&include);
    }
    if !exclude.is_empty() {
        cmd.arg("--exclude").args(&exclude);
    }
    // files that grow as they come: progress to show, and a resume that works
    cmd.env("HF_HUB_DISABLE_XET", "1").env("HF_HUB_DISABLE_PROGRESS_BARS", "1");
    if let Some(t) = token() {
        cmd.env("HF_TOKEN", t);
    }
    let mut child = cmd.stdout(Stdio::null()).stderr(Stdio::piped()).spawn().map_err(|e| format!("Could not start the download: {e}"))?;
    let err = child.stderr.take().unwrap();
    running.insert(id.clone(), child);
    drop(running);

    let last = Arc::new(Mutex::new(String::new()));
    let last2 = last.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(err).lines().map_while(Result::ok) {
            if !line.trim().is_empty() {
                *last2.lock().unwrap() = line;
            }
        }
    });
    let dir = repo_dir(&repo);
    let running = state.running.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let finished = {
            let mut r = running.lock().unwrap();
            match r.get_mut(&id).map(|c| c.try_wait()) {
                None => Some(None), // stopped by the writer
                Some(Ok(Some(status))) => {
                    r.remove(&id);
                    Some(Some(status.success()))
                }
                _ => None,
            }
        };
        let _ = app.emit("models", json!({ "id": id, "event": "progress", "bytes": bytes_in(&dir) }));
        match finished {
            None => continue,
            Some(None) => {
                let _ = app.emit("models", json!({ "id": id, "event": "stopped" }));
                break;
            }
            Some(Some(ok)) => {
                let complete = whole(&dir, &need);
                let said = last.lock().unwrap().clone();
                let gated = said.contains("401") || said.contains("403") || said.to_lowercase().contains("gated");
                let _ = app.emit(
                    "models",
                    if ok && complete {
                        json!({ "id": id, "event": "done" })
                    } else {
                        json!({ "id": id, "event": "failed", "gated": gated, "message": if said.is_empty() { "The download stopped before it was whole.".to_string() } else { said } })
                    },
                );
                break;
            }
        }
    });
    Ok(())
}

/// Stop a download; what came down stays, and the next fetch picks up from it.
#[tauri::command]
pub fn model_stop(state: tauri::State<ModelsState>, id: String) {
    if let Some(mut c) = state.running.lock().unwrap().remove(&id) {
        let _ = c.kill();
        let _ = c.wait();
    }
}

/// Open a model's page on Hugging Face (to accept its licence) — only a repository's own page.
#[tauri::command]
pub fn model_page(repo: String) -> Result<(), String> {
    let ok = repo.split('/').count() == 2 && repo.chars().all(|c| c.is_ascii_alphanumeric() || "-_./".contains(c)) && !repo.contains("..");
    if !ok {
        return Err("Not a repository".into());
    }
    Command::new("/usr/bin/open").arg(format!("https://huggingface.co/{repo}")).status().map_err(|e| e.to_string())?;
    Ok(())
}

/// Show a model's folder in the Finder.
#[tauri::command]
pub fn model_reveal(repo: String) {
    let _ = Command::new("/usr/bin/open").arg("-R").arg(repo_dir(&repo)).status();
}
