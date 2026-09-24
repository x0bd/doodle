//! Integrity (PLAN.md M1.6), the disk's half. The page decides whether a
//! graph is sound (`state/integrity.ts`); this side hands it the backups to
//! fall back on, keeps a damaged file aside instead of letting the next save
//! overwrite it, and finds the pictures nothing uses any more.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// the backups a save leaves, newest first (`backups/graph-<secs>.json`)
#[tauri::command]
pub fn list_backups(dir: String) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(Path::new(&dir).join("backups"))
        .map(|r| r.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.starts_with("graph-") && n.ends_with(".json")).collect())
        .unwrap_or_default();
    names.sort();
    names.reverse();
    names
}

#[tauri::command]
pub fn read_backup(dir: String, name: String) -> Result<String, String> {
    if name.contains('/') || name.contains("..") || !name.starts_with("graph-") {
        return Err("Not a backup".into());
    }
    fs::read_to_string(Path::new(&dir).join("backups").join(name)).map_err(|e| e.to_string())
}

/// The file as it was, kept beside the graph under another name — the next
/// save must not be the end of it: `graph-damaged-<secs>.json` when it
/// could not be read, `graph-before-<secs>.json` when it was mended or
/// brought up to a newer format. Says what it is called.
#[tauri::command]
pub fn set_aside(dir: String, why: String) -> Result<Option<String>, String> {
    let why = if why == "damaged" { "damaged" } else { "before" };
    let dir = PathBuf::from(dir);
    let from = dir.join("graph.json");
    if !from.is_file() {
        return Ok(None);
    }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let name = format!("graph-{why}-{stamp}.json");
    fs::copy(&from, dir.join(&name)).map_err(|e| e.to_string())?;
    Ok(Some(name))
}

/// every `assets/<sha256>.<ext>` a text names
fn refs_in(text: &str, out: &mut HashSet<String>) {
    let mut rest = text;
    while let Some(at) = rest.find("assets/") {
        let tail = &rest[at + 7..];
        let hash: String = tail.chars().take_while(|c| c.is_ascii_hexdigit()).collect();
        let after = &tail[hash.len()..];
        if hash.len() == 64 && after.starts_with('.') {
            let ext: String = after[1..].chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
            if !ext.is_empty() {
                out.insert(format!("{hash}.{ext}"));
            }
        }
        rest = &rest[at + 7..];
    }
}

#[derive(serde::Serialize)]
pub struct Unused {
    pub files: Vec<String>,
    pub bytes: u64,
}

/// The pictures in `assets/` that nothing names: not the graph, its runs,
/// its versions, its backups and kept copies, nor the recovery log of what
/// is not saved yet.
pub fn unused_in(dir: &Path) -> Unused {
    let mut used = HashSet::new();
    for f in ["graph.json", "jobs.json", "recovery.log"] {
        if let Ok(t) = fs::read_to_string(dir.join(f)) {
            refs_in(&t, &mut used);
        }
    }
    // every version, every backup, and every copy kept aside (graph-before-…,
    // graph-damaged-…): going back to any of them must find its pictures
    for sub in ["versions", "backups"] {
        if let Ok(r) = fs::read_dir(dir.join(sub)) {
            for e in r.filter_map(|e| e.ok()) {
                if let Ok(t) = fs::read_to_string(e.path()) {
                    refs_in(&t, &mut used);
                }
            }
        }
    }
    if let Ok(r) = fs::read_dir(dir) {
        for e in r.filter_map(|e| e.ok()) {
            let n = e.file_name().to_string_lossy().into_owned();
            if n.starts_with("graph-") && n.ends_with(".json") {
                if let Ok(t) = fs::read_to_string(e.path()) {
                    refs_in(&t, &mut used);
                }
            }
        }
    }
    let mut files = Vec::new();
    let mut bytes = 0;
    if let Ok(r) = fs::read_dir(dir.join("assets")) {
        for e in r.filter_map(|e| e.ok()) {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || used.contains(&name) {
                continue;
            }
            bytes += e.metadata().map(|m| m.len()).unwrap_or(0);
            files.push(name);
        }
    }
    files.sort();
    Unused { files, bytes }
}

/// What would go — nothing moves.
#[tauri::command]
pub fn unused_assets(dir: String) -> Unused {
    unused_in(Path::new(&dir))
}

/// Move what is unused to the Trash (never deleted: the Trash gives it
/// back). Found again here, not taken from the page, so only what is
/// unused at this moment goes. Says how many went.
#[tauri::command]
pub fn trash_unused_assets(dir: String) -> Result<usize, String> {
    let dir = PathBuf::from(dir);
    let found = unused_in(&dir);
    let paths: Vec<PathBuf> = found.files.iter().map(|f| dir.join("assets").join(f)).collect();
    if paths.is_empty() {
        return Ok(0);
    }
    trash::delete_all(&paths).map_err(|e| e.to_string())?;
    // their thumbnails are a cache of them
    if let Ok(r) = fs::read_dir(dir.join("thumbs")) {
        let gone: HashSet<&str> = found.files.iter().map(|f| f.split('.').next().unwrap_or("")).collect();
        for e in r.filter_map(|e| e.ok()) {
            let n = e.file_name().to_string_lossy().into_owned();
            if gone.contains(n.split('-').next().unwrap_or("")) {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    Ok(paths.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_only_what_nothing_names() {
        let root = std::env::temp_dir().join(format!("doodle-integrity-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("assets")).unwrap();
        fs::create_dir_all(root.join("versions")).unwrap();
        let h = |c: char| c.to_string().repeat(64);
        for n in ['a', 'b', 'c', 'd'] {
            fs::write(root.join("assets").join(format!("{}.png", h(n))), b"xx").unwrap();
        }
        fs::write(root.join("graph.json"), format!(r#"{{"asset":"assets/{}.png"}}"#, h('a'))).unwrap();
        fs::write(root.join("versions/v1.json"), format!(r#"{{"outputs":["assets/{}.png"]}}"#, h('b'))).unwrap();
        fs::write(root.join("recovery.log"), format!("{{\"asset\":\"assets/{}.png\"}}\n", h('c'))).unwrap();
        fs::write(root.join("assets").join(format!("{}.png", h('e'))), b"xx").unwrap();
        fs::write(root.join("graph-before-1.json"), format!(r#"{{"asset":"assets/{}.png"}}"#, h('e'))).unwrap();
        let u = unused_in(&root);
        assert_eq!(u.files, vec![format!("{}.png", h('d'))]);
        assert_eq!(u.bytes, 2);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn backups_newest_first_and_only_backups() {
        let root = std::env::temp_dir().join(format!("doodle-backups-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("backups")).unwrap();
        for n in ["graph-100.json", "graph-300.json", "graph-200.json", "notes.txt"] {
            fs::write(root.join("backups").join(n), "{}").unwrap();
        }
        let d = root.to_string_lossy().into_owned();
        assert_eq!(list_backups(d.clone()), vec!["graph-300.json", "graph-200.json", "graph-100.json"]);
        assert!(read_backup(d, "../graph.json".into()).is_err());
        fs::remove_dir_all(&root).unwrap();
    }
}
