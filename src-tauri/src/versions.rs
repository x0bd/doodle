//! Versions (PLAN.md M1.5): a node — a page, a chapter with what it
//! holds — as it was, kept inside the project. Each is one file,
//! `versions/<id>.json`, written atomically; `versions/index.jsonl` lists
//! them one line each, appended and fsynced, so the list is read without
//! opening every version. What a version holds and when one is taken is
//! the page's business (`state/versions.ts`); this side keeps them.

use std::fs;
use std::path::{Path, PathBuf};

fn dir_of(project: &str) -> PathBuf {
    Path::new(project).join("versions")
}

/// ids are made by the page; only these characters ever name a file here
fn safe(id: &str) -> Result<&str, String> {
    if !id.is_empty() && id.len() <= 96 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Ok(id)
    } else {
        Err(format!("Not a version id: {id}"))
    }
}

pub fn save_in(project: &str, id: &str, meta: &str, body: &str) -> Result<(), String> {
    let id = safe(id)?;
    let dir = dir_of(project);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{id}.json.tmp"));
    fs::write(&tmp, body).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join(format!("{id}.json"))).map_err(|e| e.to_string())?;
    // the index line last: a version is listed only once it is whole
    let line = meta.replace('\n', " ");
    crate::recovery::append_to(&dir.join("index.jsonl"), &line)
}

#[tauri::command]
pub fn version_save(dir: String, id: String, meta: String, body: String) -> Result<(), String> {
    save_in(&dir, &id, &meta, &body)
}

/// every version's line, oldest first; nothing yet is an empty list
#[tauri::command]
pub fn version_index(dir: String) -> Result<String, String> {
    match fs::read_to_string(dir_of(&dir).join("index.jsonl")) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn version_read(dir: String, id: String) -> Result<String, String> {
    let id = safe(&id)?;
    fs::read_to_string(dir_of(&dir).join(format!("{id}.json"))).map_err(|_| "That version is no longer in the project.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_a_version_and_lists_it() {
        let root = std::env::temp_dir().join(format!("doodle-versions-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let p = root.to_string_lossy().into_owned();
        save_in(&p, "v1", r#"{"id":"v1"}"#, r#"{"nodes":{}}"#).unwrap();
        save_in(&p, "v2", "{\"id\":\n\"v2\"}", "{}").unwrap();
        assert_eq!(version_index(p.clone()).unwrap(), "{\"id\":\"v1\"}\n{\"id\": \"v2\"}\n");
        assert_eq!(version_read(p.clone(), "v1".into()).unwrap(), r#"{"nodes":{}}"#);
        assert!(version_read(p.clone(), "../graph".into()).is_err());
        assert!(save_in(&p, "a/b", "{}", "{}").is_err());
        fs::remove_dir_all(&root).unwrap();
    }
}
