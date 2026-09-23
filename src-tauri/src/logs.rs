//! Doodle's own log (PLAN.md M1.8): what happened and how long it took, on
//! this Mac only, in `~/Library/Logs/com.x0bd.doodle/doodle.log` — rotated
//! at 1 MB, three kept. Never a word of anyone's writing, never a token:
//! the page logs sizes, counts and timings, and Rust logs what it found and
//! whether it worked. A friend can send it without sending their book.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

static FILE: OnceLock<Mutex<PathBuf>> = OnceLock::new();
const LIMIT: u64 = 1024 * 1024;
const KEEP: usize = 3;

pub fn dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_log_dir().ok()
}

pub fn init(app: &tauri::AppHandle) {
    if let Some(d) = dir(app) {
        let _ = fs::create_dir_all(&d);
        let _ = FILE.set(Mutex::new(d.join("doodle.log")));
    }
}

/// `2026-09-23T14:05:03.123Z`, from the clock alone
fn stamp() -> String {
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = d.as_secs() as i64;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // civil date from days since 1970 (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z", rem / 3600, rem % 3600 / 60, rem % 60, d.subsec_millis())
}

fn rotate(path: &PathBuf) {
    for i in (1..KEEP).rev() {
        let _ = fs::rename(path.with_extension(format!("{i}.log")), path.with_extension(format!("{}.log", i + 1)));
    }
    let _ = fs::rename(path, path.with_extension("1.log"));
}

/// One line: when, how serious, where in Doodle, what.
pub fn line(level: &str, area: &str, msg: &str) {
    let Some(f) = FILE.get() else { return };
    let path = f.lock().unwrap();
    if fs::metadata(&*path).map(|m| m.len() > LIMIT).unwrap_or(false) {
        rotate(&path);
    }
    let msg: String = msg.replace(['\n', '\r'], " ").chars().take(600).collect();
    if let Ok(mut out) = OpenOptions::new().create(true).append(true).open(&*path) {
        let _ = writeln!(out, "{} {level:<5} {area:<8} {msg}", stamp());
    }
    if cfg!(debug_assertions) {
        eprintln!("[log] {level} {area} {msg}");
    }
}

pub fn info(area: &str, msg: &str) {
    line("info", area, msg);
}
pub fn warn(area: &str, msg: &str) {
    line("warn", area, msg);
}

/// From the page. Its areas and levels are its own; the words it sends are
/// sizes and timings, never content (see `platform/log.ts`).
#[tauri::command]
pub fn log_event(level: String, area: String, message: String) {
    let level = if matches!(level.as_str(), "info" | "warn" | "error") { level } else { "info".into() };
    let area: String = area.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(12).collect();
    line(&level, &area, &message);
}

/// Where the logs are, for Help › Reveal Logs.
#[tauri::command]
pub fn log_path(app: tauri::AppHandle) -> Option<String> {
    FILE.get().map(|f| f.lock().unwrap().display().to_string()).or_else(|| dir(&app).map(|d| d.join("doodle.log").display().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamps_read_as_dates() {
        let s = stamp();
        assert_eq!(s.len(), 24);
        assert!(s.starts_with("20") && s.ends_with('Z') && &s[10..11] == "T");
    }
}
