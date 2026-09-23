//! The recovery log (PLAN.md M1.4). Autosave writes the graph whole, but
//! only once typing pauses; between saves every change is also appended
//! here — one JSON line per flush, fsynced — so a crash, a force quit or a
//! reload loses at most the last moment. A save clears it; opening a
//! project replays whatever it still holds.
//!
//! A project keeps its log inside itself (`Name.doodle/recovery.log`, never
//! archived); a graph that has never been saved keeps one in Doodle's own
//! Application Support folder (`recovery/untitled.log`), whole first line
//! and all, since there is no file under it to replay onto.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::Manager;

fn log_path(app: &tauri::AppHandle, dir: Option<&str>) -> Result<PathBuf, String> {
    match dir {
        Some(d) => Ok(Path::new(d).join("recovery.log")),
        // the dev binary shares the installed app's Application Support
        // folder (both are com.x0bd.doodle); each keeps its own log
        None => Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("recovery").join(if cfg!(debug_assertions) { "untitled-dev.log" } else { "untitled.log" })),
    }
}

/// Append lines, then make sure they are on the disk before answering.
pub fn append_to(path: &Path, lines: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut f = OpenOptions::new().create(true).append(true).open(path).map_err(|e| e.to_string())?;
    f.write_all(lines.as_bytes()).map_err(|e| e.to_string())?;
    if !lines.ends_with('\n') {
        f.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    f.sync_data().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn recovery_append(app: tauri::AppHandle, dir: Option<String>, lines: String) -> Result<(), String> {
    append_to(&log_path(&app, dir.as_deref())?, &lines)
}

/// What the log holds, if there is one. A line cut short by the crash is
/// the page's to skip.
#[tauri::command]
pub fn recovery_read(app: tauri::AppHandle, dir: Option<String>) -> Result<Option<String>, String> {
    let p = log_path(&app, dir.as_deref())?;
    match fs::read_to_string(&p) {
        Ok(s) if !s.trim().is_empty() => Ok(Some(s)),
        Ok(_) => Ok(None),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Everything in it is saved now, or no longer wanted.
#[tauri::command]
pub fn recovery_clear(app: tauri::AppHandle, dir: Option<String>) -> Result<(), String> {
    match fs::remove_file(log_path(&app, dir.as_deref())?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_whole_lines_and_keeps_them() {
        let dir = std::env::temp_dir().join(format!("doodle-recovery-{}", std::process::id()));
        let p = dir.join("recovery.log");
        let _ = fs::remove_dir_all(&dir);
        append_to(&p, "{\"a\":1}").unwrap();
        append_to(&p, "{\"b\":2}\n").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "{\"a\":1}\n{\"b\":2}\n");
        fs::remove_dir_all(&dir).unwrap();
    }
}
