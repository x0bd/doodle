//! doodle-imaged (PLAN.md M4.1): pictures made on this Mac — FLUX.2 through
//! mflux, in a Python process of Doodle's own. Doodle keeps it an
//! environment of its own under Application Support (`imaged/venv`, made
//! with `uv` the first time it is asked for), writes the sidecar there from
//! the copy compiled into the binary, starts it when a picture is wanted,
//! hands it JSON lines, and turns each line it says into an `imaged` event
//! for the page. If it dies, the page hears `exited`, and the next command
//! starts it again. The weights are Hugging Face's own cache
//! (`~/.cache/huggingface/hub`), read offline.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

/// the sidecar itself, compiled in: what is written to the environment
const SIDECAR: &str = include_str!("../imaged/doodle_imaged.py");
/// the version of mflux the sidecar is written against
const MFLUX: &str = "mflux==0.20.0";
const PYTHON: &str = "3.13";
/// the model the first set is built on, by its Hugging Face name
const FLUX_4B: &str = "black-forest-labs/FLUX.2-klein-4B";

struct Proc {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
pub struct ImagedState {
    proc: Mutex<Option<Proc>>,
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
}

/// `uv`, where Homebrew or its own installer puts it
fn uv() -> Option<PathBuf> {
    ["/opt/homebrew/bin/uv", "/usr/local/bin/uv"]
        .iter()
        .map(PathBuf::from)
        .chain([home().join(".local/bin/uv"), home().join(".cargo/bin/uv")])
        .find(|p| p.is_file())
}

fn env_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("imaged"))
}

fn python(dir: &Path) -> PathBuf {
    dir.join("venv/bin/python")
}

/// the Hugging Face cache's copy of a model, if every part of it is there
fn model_dir(repo: &str) -> Option<PathBuf> {
    let base = std::env::var_os("HF_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".cache/huggingface"));
    let snaps = base.join("hub").join(format!("models--{}", repo.replace('/', "--"))).join("snapshots");
    std::fs::read_dir(snaps).ok()?.filter_map(Result::ok).map(|e| e.path()).find(|s| {
        ["transformer/diffusion_pytorch_model.safetensors", "vae/diffusion_pytorch_model.safetensors", "text_encoder/model-00001-of-00002.safetensors", "text_encoder/model-00002-of-00002.safetensors"]
            .iter()
            .all(|f| s.join(f).is_file())
    })
}

#[derive(serde::Serialize)]
pub struct ImagedStatus {
    uv: bool,
    /// Doodle's environment, with mflux in it
    env: bool,
    /// FLUX.2 klein 4B, whole, in the Hugging Face cache
    model: bool,
    running: bool,
}

#[tauri::command]
pub fn imaged_status(app: AppHandle, state: tauri::State<ImagedState>) -> Result<ImagedStatus, String> {
    let dir = env_dir(&app)?;
    Ok(ImagedStatus {
        uv: uv().is_some(),
        env: python(&dir).is_file() && dir.join("venv/.mflux").is_file(),
        model: model_dir(FLUX_4B).is_some(),
        running: state.proc.lock().unwrap().is_some(),
    })
}

/// Make Doodle's environment: a Python of its own and mflux in it — each
/// line of the work said as an `imaged` event (`{"event":"setup","line"}`).
#[tauri::command]
pub async fn imaged_setup(app: AppHandle) -> Result<(), String> {
    let uv = uv().ok_or("uv is not installed — brew install uv, then try again.")?;
    let dir = env_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let steps: [Vec<String>; 2] = [
            vec!["venv".into(), "--python".into(), PYTHON.into(), dir.join("venv").to_string_lossy().into()],
            vec!["pip".into(), "install".into(), "--python".into(), python(&dir).to_string_lossy().into(), MFLUX.into()],
        ];
        for args in steps {
            let mut child = Command::new(&uv).args(&args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("Could not run uv: {e}"))?;
            let err = child.stderr.take().unwrap();
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                let _ = app.emit("imaged", json!({ "event": "setup", "line": line }));
            }
            let ok = child.wait().map_err(|e| e.to_string())?.success();
            if !ok {
                return Err(format!("uv {} did not finish", args[0]));
            }
        }
        std::fs::write(dir.join("venv/.mflux"), MFLUX).map_err(|e| e.to_string())?;
        let _ = app.emit("imaged", json!({ "event": "setup-done" }));
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn start(app: &AppHandle) -> Result<Proc, String> {
    let dir = env_dir(app)?;
    let py = python(&dir);
    if !py.is_file() {
        return Err("The picture maker is not set up yet (Settings › Providers).".into());
    }
    // the sidecar as this build has it
    let script = dir.join("doodle_imaged.py");
    if std::fs::read_to_string(&script).ok().as_deref() != Some(SIDECAR) {
        std::fs::write(&script, SIDECAR).map_err(|e| e.to_string())?;
    }
    let mut child = Command::new(&py)
        .arg(&script)
        .env("PYTHONUNBUFFERED", "1")
        // the weights are in the cache already; nothing is fetched behind the writer's back
        .env("HF_HUB_OFFLINE", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start the picture maker: {e}"))?;
    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    let app2 = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                let _ = app2.emit("imaged", v);
            }
        }
        // gone: the page marks what was running as failed; the next command starts it again
        if let Some(state) = app2.try_state::<ImagedState>() {
            if let Some(mut p) = state.proc.lock().unwrap().take() {
                let _ = p.child.wait();
            }
        }
        let _ = app2.emit("imaged", json!({ "event": "exited" }));
    });
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            eprintln!("{line}");
        }
    });
    Ok(Proc { child, stdin })
}

/// Say a line to the picture maker, starting it first if it is not running.
#[tauri::command]
pub fn imaged_send(app: AppHandle, state: tauri::State<ImagedState>, line: Value) -> Result<(), String> {
    let mut guard = state.proc.lock().unwrap();
    if guard.is_none() {
        *guard = Some(start(&app)?);
        writeln!(guard.as_mut().unwrap().stdin, "{}", json!({ "op": "hello" })).map_err(|e| e.to_string())?;
    }
    let p = guard.as_mut().unwrap();
    writeln!(p.stdin, "{line}").map_err(|e| e.to_string())?;
    p.stdin.flush().map_err(|e| e.to_string())
}

/// Stop the picture maker (it is started again when next wanted).
#[tauri::command]
pub fn imaged_stop(state: tauri::State<ImagedState>) {
    if let Some(mut p) = state.proc.lock().unwrap().take() {
        let _ = writeln!(p.stdin, "{}", json!({ "op": "quit" }));
        let _ = p.child.kill();
    }
}

/// where a picture is written before it is taken into the project
#[tauri::command]
pub fn imaged_out(app: AppHandle, id: String) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("imaged");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{}.png", id.replace(|c: char| !c.is_ascii_alphanumeric(), "_"))).to_string_lossy().into())
}
