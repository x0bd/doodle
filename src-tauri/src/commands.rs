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
