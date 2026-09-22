//! The archive. A project leaves as one file and comes back whole: every
//! file it holds, each with its hash in a manifest, so an import can say
//! plainly whether what arrived is what left.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

const FORMAT: &str = "doodle-archive";
const VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
pub struct Entry {
    pub path: String,
    pub sha256: String,
    pub bytes: u64,
}

#[derive(Serialize, Deserialize)]
pub struct Manifest {
    pub format: String,
    pub version: u32,
    pub app: String,
    pub name: String,
    pub exported_at: u64,
    pub files: Vec<Entry>,
}

#[derive(Serialize, Debug)]
pub struct Imported {
    pub dir: String,
    pub name: String,
    pub files: usize,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// what a project folder holds, as paths relative to it: the graph, its
/// assets and its records — never the backups, which are its own history
fn contents(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    for name in ["graph.json", "jobs.json"] {
        if dir.join(name).is_file() {
            out.push(name.to_string());
        }
    }
    if let Ok(entries) = fs::read_dir(dir.join("assets")) {
        let mut assets: Vec<String> = entries
            .flatten()
            .filter(|e| e.path().is_file())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| !n.starts_with('.'))
            .map(|n| format!("assets/{n}"))
            .collect();
        assets.sort();
        out.extend(assets);
    }
    out
}

/// Write the project at `dir` as one archive at `path`.
#[tauri::command]
pub fn export_archive(dir: String, path: String, name: String) -> Result<usize, String> {
    let dir = PathBuf::from(dir);
    let out = PathBuf::from(&path);
    if !dir.join("graph.json").is_file() {
        return Err("Save the project first; there is nothing on disk to archive.".into());
    }
    let mut files = Vec::new();
    let mut manifest = Manifest {
        format: FORMAT.into(),
        version: VERSION,
        app: env!("CARGO_PKG_VERSION").into(),
        name,
        exported_at: now(),
        files: Vec::new(),
    };
    for rel in contents(&dir) {
        let bytes = fs::read(dir.join(&rel)).map_err(|e| format!("{rel}: {e}"))?;
        manifest.files.push(Entry {
            path: rel.clone(),
            sha256: hex::encode(Sha256::digest(&bytes)),
            bytes: bytes.len() as u64,
        });
        files.push((rel, bytes));
    }
    let tmp = out.with_extension("tmp");
    {
        let file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("manifest.json", opts).map_err(|e| e.to_string())?;
        zip.write_all(serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?.as_bytes())
            .map_err(|e| e.to_string())?;
        for (rel, bytes) in &files {
            zip.start_file(rel.clone(), opts).map_err(|e| e.to_string())?;
            zip.write_all(bytes).map_err(|e| e.to_string())?;
        }
        zip.finish().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, &out).map_err(|e| e.to_string())?;
    Ok(files.len())
}

/// Read an archive into a new project folder at `dir`, refusing anything
/// whose bytes do not match what the manifest says they are.
#[tauri::command]
pub fn import_archive(path: String, dir: String) -> Result<Imported, String> {
    let dir = PathBuf::from(dir);
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "Not an archive Doodle can read.".to_string())?;

    let manifest: Manifest = {
        let mut m = zip.by_name("manifest.json").map_err(|_| "No manifest — not a Doodle archive.".to_string())?;
        let mut s = String::new();
        m.read_to_string(&mut s).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|e| format!("The manifest is not readable: {e}"))?
    };
    if manifest.format != FORMAT {
        return Err("Not a Doodle archive.".into());
    }
    if manifest.version > VERSION {
        return Err(format!("This archive is version {} — this Doodle reads {VERSION}.", manifest.version));
    }

    // every file, checked against the manifest before anything is written
    let mut taken: Vec<(String, Vec<u8>)> = Vec::new();
    for entry in &manifest.files {
        if entry.path.contains("..") || entry.path.starts_with('/') {
            return Err(format!("The archive names a file outside itself: {}", entry.path));
        }
        let mut f = zip
            .by_name(&entry.path)
            .map_err(|_| format!("The manifest lists {} but the archive does not hold it.", entry.path))?;
        let mut bytes = Vec::new();
        f.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        let got = hex::encode(Sha256::digest(&bytes));
        if got != entry.sha256 {
            return Err(format!("{} arrived changed; the archive is not sound.", entry.path));
        }
        taken.push((entry.path.clone(), bytes));
    }
    if !taken.iter().any(|(p, _)| p == "graph.json") {
        return Err("The archive holds no graph.".into());
    }

    fs::create_dir_all(dir.join("assets")).map_err(|e| e.to_string())?;
    for (rel, bytes) in &taken {
        let target = dir.join(rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
    }
    Ok(Imported {
        dir: dir.to_string_lossy().to_string(),
        name: manifest.name,
        files: taken.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// a project folder with a graph, an asset and a record
    fn project(at: &Path) {
        fs::create_dir_all(at.join("assets")).unwrap();
        fs::create_dir_all(at.join("backups")).unwrap();
        fs::write(at.join("graph.json"), r#"{"format":"doodle-graph","version":1,"name":"Round","nodes":{},"order":[],"edges":{}}"#).unwrap();
        fs::write(at.join("jobs.json"), r#"{"order":[],"jobs":{},"iterations":0}"#).unwrap();
        fs::write(at.join("assets/abc.png"), [0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).unwrap();
        fs::write(at.join("backups/old.json"), "{}").unwrap();
    }

    fn scratch(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("doodle-test-{name}-{}", now()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn round_trip_keeps_every_byte() {
        let root = scratch("round");
        let from = root.join("Round.doodle");
        project(&from);
        let box_at = root.join("Round.doodlebox");

        let n = export_archive(from.to_string_lossy().into(), box_at.to_string_lossy().into(), "Round".into()).unwrap();
        assert_eq!(n, 3, "graph, jobs and the asset — never the backups");

        let to = root.join("Again.doodle");
        let got = import_archive(box_at.to_string_lossy().into(), to.to_string_lossy().into()).unwrap();
        assert_eq!(got.name, "Round");
        assert_eq!(got.files, 3);
        for rel in ["graph.json", "jobs.json", "assets/abc.png"] {
            assert_eq!(fs::read(from.join(rel)).unwrap(), fs::read(to.join(rel)).unwrap(), "{rel} came back changed");
        }
        assert!(!to.join("backups").join("old.json").exists(), "a project's own history is not its archive's business");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_an_archive_that_was_tampered_with() {
        let root = scratch("tamper");
        let from = root.join("Round.doodle");
        project(&from);
        let box_at = root.join("Round.doodlebox");
        export_archive(from.to_string_lossy().into(), box_at.to_string_lossy().into(), "Round".into()).unwrap();

        // rewrite the graph inside the archive, leaving the manifest as it was
        let bytes = fs::read(&box_at).unwrap();
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let out = fs::File::create(root.join("Bad.doodlebox")).unwrap();
        let mut w = zip::ZipWriter::new(out);
        let opts = SimpleFileOptions::default();
        for i in 0..zip.len() {
            let mut f = zip.by_index(i).unwrap();
            let name = f.name().to_string();
            let mut b = Vec::new();
            f.read_to_end(&mut b).unwrap();
            if name == "graph.json" {
                b = br#"{"format":"doodle-graph","version":1,"name":"Not it","nodes":{},"order":[],"edges":{}}"#.to_vec();
            }
            w.start_file(name, opts).unwrap();
            w.write_all(&b).unwrap();
        }
        w.finish().unwrap();

        let to = root.join("Nope.doodle");
        let err = import_archive(root.join("Bad.doodlebox").to_string_lossy().into(), to.to_string_lossy().into()).unwrap_err();
        assert!(err.contains("arrived changed"), "said: {err}");
        assert!(!to.join("graph.json").exists(), "nothing is written when the archive is unsound");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_what_is_not_an_archive() {
        let root = scratch("plain");
        let f = root.join("notes.txt");
        fs::write(&f, "just a file").unwrap();
        let err = import_archive(f.to_string_lossy().into(), root.join("X.doodle").to_string_lossy().into()).unwrap_err();
        assert!(err.contains("Not an archive"), "said: {err}");
        let _ = fs::remove_dir_all(&root);
    }
}
