//! The document on disk. A graph lives in a folder — `Name.doodle/` — as
//! `graph.json` beside an `assets/` directory. Writes go to a temporary
//! file and are renamed into place, so a crash mid-write leaves the last
//! good graph.

use std::fs;
use std::path::{Path, PathBuf};

fn graph_path(dir: &Path) -> PathBuf {
    dir.join("graph.json")
}

#[tauri::command]
pub fn save_graph(dir: String, json: String) -> Result<(), String> {
    let dir = PathBuf::from(dir);
    fs::create_dir_all(dir.join("assets")).map_err(|e| e.to_string())?;
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
