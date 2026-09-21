//! The document on disk. A graph lives in a folder — `Name.doodle/` — as
//! `graph.json` beside an `assets/` directory. Writes go to a temporary
//! file and are renamed into place, so a crash mid-write leaves the last
//! good graph.

use std::fs;
use std::path::{Path, PathBuf};

fn graph_path(dir: &Path) -> PathBuf {
    dir.join("graph.json")
}

/// Before a graph is overwritten, the last one is kept — at most once every
/// ten minutes, the newest ten of them — so a bad save is never the only
/// copy.
fn back_up(dir: &Path) {
    let target = graph_path(dir);
    if !target.is_file() {
        return;
    }
    let backups = dir.join("backups");
    let _ = fs::create_dir_all(&backups);
    let mut had: Vec<PathBuf> = fs::read_dir(&backups)
        .map(|r| r.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.extension().map(|x| x == "json").unwrap_or(false)).collect())
        .unwrap_or_default();
    had.sort();
    let now = std::time::SystemTime::now();
    if let Some(last) = had.last() {
        if let Ok(m) = fs::metadata(last).and_then(|m| m.modified()) {
            if now.duration_since(m).map(|d| d.as_secs() < 600).unwrap_or(false) {
                return;
            }
        }
    }
    let stamp = now.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let _ = fs::copy(&target, backups.join(format!("graph-{stamp}.json")));
    had.push(backups.join(format!("graph-{stamp}.json")));
    while had.len() > 10 {
        let _ = fs::remove_file(had.remove(0));
    }
}

#[tauri::command]
pub fn save_graph(dir: String, json: String) -> Result<(), String> {
    let dir = PathBuf::from(dir);
    fs::create_dir_all(dir.join("assets")).map_err(|e| e.to_string())?;
    back_up(&dir);
    let target = graph_path(&dir);
    let tmp = dir.join("graph.json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_graph(dir: String) -> Result<String, String> {
    let dir = PathBuf::from(dir);
    fs::read_to_string(graph_path(&dir)).map_err(|e| e.to_string())
}

/// Small sidecar records beside the graph — the runs, later the journal.
/// Named from a short list; never a path.
fn side_path(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if !matches!(name, "jobs") {
        return Err("Not a record Doodle keeps".into());
    }
    Ok(dir.join(format!("{name}.json")))
}

#[tauri::command]
pub fn save_record(dir: String, name: String, json: String) -> Result<(), String> {
    let dir = PathBuf::from(dir);
    let target = side_path(&dir, &name)?;
    let tmp = dir.join(format!("{name}.json.tmp"));
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_record(dir: String, name: String) -> Result<Option<String>, String> {
    let target = side_path(&PathBuf::from(dir), &name)?;
    if !target.is_file() {
        return Ok(None);
    }
    fs::read_to_string(&target).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn graph_exists(dir: String) -> bool {
    graph_path(&PathBuf::from(dir)).is_file()
}

// ── assets ──────────────────────────────────────────────────────────────────
// Media lives beside the graph, content-addressed: assets/<sha256>.<ext>.
// The same file dropped twice is one file. Blobs are immutable.

use base64::Engine;
use sha2::{Digest, Sha256};

#[derive(serde::Serialize)]
pub struct ImportedAsset {
    pub rel: String,
    pub name: String,
    pub bytes: u64,
}

const MAX_ASSET: u64 = 64 * 1024 * 1024;

fn ext_of(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("bin").to_ascii_lowercase()
}

#[tauri::command]
pub fn import_asset(dir: String, path: String) -> Result<ImportedAsset, String> {
    let src = PathBuf::from(&path);
    let meta = fs::metadata(&src).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Not a file".into());
    }
    if meta.len() > MAX_ASSET {
        return Err("Larger than 64 MB".into());
    }
    let ext = ext_of(&src);
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "avif") {
        return Err(format!("Not an image: .{ext}"));
    }
    let bytes = fs::read(&src).map_err(|e| e.to_string())?;
    let hash = hex::encode(Sha256::digest(&bytes));
    let rel = format!("assets/{hash}.{ext}");
    let dir = PathBuf::from(dir);
    let target = dir.join(&rel);
    fs::create_dir_all(dir.join("assets")).map_err(|e| e.to_string())?;
    if !target.exists() {
        let tmp = dir.join(format!("assets/.{hash}.tmp"));
        fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    }
    Ok(ImportedAsset {
        rel,
        name: src.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
        bytes: meta.len(),
    })
}

/// The bytes of an asset as a data URL — the webview never reads the disk.
#[tauri::command]
pub fn read_asset(dir: String, rel: String) -> Result<String, String> {
    if rel.contains("..") || !rel.starts_with("assets/") {
        return Err("Not an asset path".into());
    }
    let p = PathBuf::from(dir).join(&rel);
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    let mime = match ext_of(&p).as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// A generated image, handed over as a data URL, kept content-addressed
/// beside the graph like anything else.
#[tauri::command]
pub fn write_asset(dir: String, data_url: String) -> Result<ImportedAsset, String> {
    let (head, b64) = data_url.split_once(',').ok_or("Not a data URL")?;
    let ext = if head.contains("image/png") {
        "png"
    } else if head.contains("image/jpeg") {
        "jpg"
    } else if head.contains("image/webp") {
        "webp"
    } else {
        return Err("Not an image".into());
    };
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_ASSET {
        return Err("Larger than 64 MB".into());
    }
    let hash = hex::encode(Sha256::digest(&bytes));
    let rel = format!("assets/{hash}.{ext}");
    let dir = PathBuf::from(dir);
    let target = dir.join(&rel);
    fs::create_dir_all(dir.join("assets")).map_err(|e| e.to_string())?;
    if !target.exists() {
        let tmp = dir.join(format!("assets/.{hash}.tmp"));
        fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    }
    Ok(ImportedAsset { rel, name: format!("{hash}.{ext}"), bytes: bytes.len() as u64 })
}
