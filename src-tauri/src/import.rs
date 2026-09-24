//! Import (PLAN.md M2.9, M3.1's readers): a file's words as Markdown, for
//! the page to split into chapters or lay on the board. Markdown, Fountain
//! and plain text are read as they are (as UTF-8, a byte that is not read as
//! the replacement character rather than refused); a Word document
//! (`.docx`) is read from its `word/document.xml` — headings (by style, or
//! by outline level) become `#`s, bold and italic runs `**` and `_`, a line
//! break a line break, a list item `- ` or `1. ` (by its numbering), a quote
//! `> `, a picture `![](assets/…)` once it is kept in the project — and
//! nothing else of Word's comes with it. PDFs are the page's (pdf.js);
//! `read_bytes` hands it the file.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

use crate::commands::store;

const MAX: u64 = 32 * 1024 * 1024;
const MAX_BYTES: u64 = 256 * 1024 * 1024;

#[derive(serde::Serialize)]
pub struct Imported {
    /// the file's name without its extension — a chapter's title when there is nothing better
    pub name: String,
    /// md, txt, fountain, docx
    pub kind: String,
    pub text: String,
    /// the pictures kept from it, in the order they stand (`assets/…`)
    pub pictures: Vec<String>,
}

/// A file's words. With `dir` (the open project), a Word document's
/// pictures are kept in its `assets/` and stand in the words where they
/// were; without, they are left behind.
#[tauri::command]
pub fn read_import(path: String, dir: Option<String>) -> Result<Imported, String> {
    let p = Path::new(&path);
    let size = fs::metadata(p).map_err(|e| e.to_string())?.len();
    if size > MAX {
        return Err("Larger than 32 MB".into());
    }
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("Imported").to_string();
    let read = || fs::read(p).map(|b| String::from_utf8_lossy(&b).into_owned()).map_err(|e| e.to_string());
    let (kind, text, pictures) = match ext.as_str() {
        "md" | "markdown" | "mdown" => ("md", read()?, vec![]),
        "txt" | "text" => ("txt", read()?, vec![]),
        "fountain" | "spmd" => ("fountain", read()?, vec![]),
        "docx" => {
            let (text, pictures) = docx(p, dir.as_deref().map(Path::new))?;
            ("docx", text, pictures)
        }
        other => return Err(format!("Doodle does not read .{other} files yet — Markdown, plain text, Fountain and Word (.docx) it does.")),
    };
    Ok(Imported { name, kind: kind.into(), text: text.replace("\r\n", "\n").replace('\r', "\n"), pictures })
}

/// A file's bytes, for what the page reads itself (a PDF, through pdf.js).
#[tauri::command]
pub fn read_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > MAX_BYTES {
        return Err("Larger than 256 MB".into());
    }
    Ok(tauri::ipc::Response::new(fs::read(&path).map_err(|e| e.to_string())?))
}

/// A document laid on the board is kept in the project (`assets/`, by its
/// hash), so its clippings open it wherever the original went. Its path.
#[tauri::command]
pub fn keep_source(dir: String, path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if fs::metadata(p).map_err(|e| e.to_string())?.len() > MAX_BYTES {
        return Err("Larger than 256 MB".into());
    }
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if !matches!(ext.as_str(), "md" | "markdown" | "mdown" | "txt" | "text" | "fountain" | "spmd" | "docx" | "pdf") {
        return Err(format!("Not a document: .{ext}"));
    }
    store(Path::new(&dir), &fs::read(p).map_err(|e| e.to_string())?, &ext)
}

/// A file kept in the project, opened in the Mac's own app for it (a PDF in
/// Preview) — only what is in `assets/`, nothing named from outside it.
#[tauri::command]
pub fn open_kept(dir: String, rel: String) -> Result<(), String> {
    if !rel.starts_with("assets/") || rel.contains("..") {
        return Err("Not a file kept in the project".into());
    }
    let p = Path::new(&dir).join(&rel);
    if !p.is_file() {
        return Err("That file is not in the project any more".into());
    }
    std::process::Command::new("/usr/bin/open").arg(&p).status().map_err(|e| e.to_string())?;
    Ok(())
}

/// A Word document's words as Markdown, and the pictures kept from it.
pub fn docx(p: &Path, dir: Option<&Path>) -> Result<(String, Vec<String>), String> {
    let file = fs::File::open(p).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "Not a Word document (it is not a .docx zip)".to_string())?;
    let mut part = |name: &str| -> Option<String> {
        let mut s = String::new();
        zip.by_name(name).ok()?.read_to_string(&mut s).ok()?;
        Some(s)
    };
    let xml = part("word/document.xml").ok_or("Not a Word document (no document.xml)")?;
    let parts = Parts {
        rels: part("word/_rels/document.xml.rels").map(|x| rels(&x)).unwrap_or_default(),
        lists: part("word/numbering.xml").map(|x| numbering(&x)).unwrap_or_default(),
    };
    let text = document_with(&xml, &parts);
    // the pictures: kept in the project, or left out
    let mut kept = Vec::new();
    let mut out = Vec::new();
    for block in text.split("\n\n") {
        let Some(target) = block.strip_prefix("![](").and_then(|b| b.strip_suffix(')')) else {
            out.push(block.to_string());
            continue;
        };
        let Some(dir) = dir else { continue };
        let ext = target.rsplit('.').next().unwrap_or("").to_lowercase();
        let ext = if ext == "jpeg" { "jpg".to_string() } else { ext };
        if !matches!(ext.as_str(), "png" | "jpg" | "gif" | "webp") {
            continue; // Word's own vector pictures (emf, wmf) are left behind
        }
        let mut bytes = Vec::new();
        let file = fs::File::open(p).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        if zip.by_name(target).map(|mut f| f.read_to_end(&mut bytes)).is_err() {
            continue;
        }
        let rel = store(dir, &bytes, &ext)?;
        out.push(format!("![]({rel})"));
        kept.push(rel);
    }
    Ok((out.join("\n\n"), kept))
}

/// What a document's paragraphs refer to: its pictures by id, its lists' kinds.
#[derive(Default)]
pub struct Parts {
    /// relationship id → the part it names, from the zip's root (`word/media/image1.png`)
    pub rels: HashMap<String, String>,
    /// numbering id → whether each level counts (`1.`) or not (`-`)
    pub lists: HashMap<String, Vec<bool>>,
}

fn attr(e: &BytesStart, name: &str) -> Option<String> {
    e.attributes().flatten().find(|a| a.key.local_name().as_ref() == name).map(|a| a.value.to_string())
}

/// `word/_rels/document.xml.rels` → id → the part, from the zip's root
pub fn rels(xml: &str) -> HashMap<String, String> {
    let mut r = Reader::from_str(xml);
    let mut out = HashMap::new();
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) if e.name().local_name().as_ref() == "Relationship" => {
                if attr(&e, "TargetMode").as_deref() == Some("External") {
                    continue;
                }
                if let (Some(id), Some(t)) = (attr(&e, "Id"), attr(&e, "Target")) {
                    let t = t.strip_prefix('/').map(str::to_string).unwrap_or_else(|| format!("word/{t}"));
                    out.insert(id, t);
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    out
}

/// `word/numbering.xml` → numbering id → for each level, whether it counts
pub fn numbering(xml: &str) -> HashMap<String, Vec<bool>> {
    let mut r = Reader::from_str(xml);
    let mut kinds: HashMap<String, Vec<bool>> = HashMap::new(); // abstract id → levels
    let mut nums: HashMap<String, String> = HashMap::new(); // num id → abstract id
    let (mut abs, mut lvl, mut num) = (None::<String>, 0usize, None::<String>);
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match e.name().local_name().as_ref() {
                "abstractNum" => abs = attr(&e, "abstractNumId"),
                "lvl" => lvl = attr(&e, "ilvl").and_then(|v| v.parse().ok()).unwrap_or(0),
                "numFmt" => {
                    if let Some(a) = &abs {
                        let levels = kinds.entry(a.clone()).or_default();
                        if levels.len() <= lvl {
                            levels.resize(lvl + 1, false);
                        }
                        levels[lvl] = !matches!(attr(&e, "val").as_deref(), Some("bullet") | Some("none") | None);
                    }
                }
                "num" => num = attr(&e, "numId"),
                "abstractNumId" => {
                    if let (Some(n), Some(a)) = (&num, attr(&e, "val")) {
                        nums.insert(n.clone(), a);
                    }
                }
                _ => {}
            },
            Ok(Event::End(e)) => match e.name().local_name().as_ref() {
                "abstractNum" => abs = None,
                "num" => num = None,
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    nums.into_iter().filter_map(|(n, a)| kinds.get(&a).map(|k| (n, k.clone()))).collect()
}

#[derive(Default, Clone, Copy, PartialEq)]
struct Style {
    bold: bool,
    italic: bool,
}

#[cfg(test)]
/// `word/document.xml` alone → Markdown (no pictures, lists by their marks)
pub fn document_xml(xml: &str) -> String {
    document_with(xml, &Parts::default())
}

/// `word/document.xml` → Markdown: one paragraph a block, a blank line apart
/// (a list's items a line apart); a picture a block of its own, `![](word/media/…)`.
pub fn document_with(xml: &str, parts: &Parts) -> String {
    let mut r = Reader::from_str(xml);
    let mut blocks: Vec<String> = Vec::new();
    // the paragraph being read: its heading level, list, quote, runs, pictures
    let mut level = 0usize;
    let (mut list_id, mut list_lvl) = (None::<String>, 0usize);
    let mut quote = false;
    let mut pictures: Vec<String> = Vec::new();
    let mut runs: Vec<(Style, String)> = Vec::new();
    let mut run = Style::default();
    let mut text = String::new();
    let (mut in_para, mut in_run, mut in_rpr, mut in_text) = (false, false, false, false);
    let mut was_item = false;
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = e.name();
                let local = name.local_name();
                let val = || attr(&e, "val");
                match local.as_ref() {
                    "p" => {
                        in_para = true;
                        level = 0;
                        list_id = None;
                        list_lvl = 0;
                        quote = false;
                        runs.clear();
                        pictures.clear();
                    }
                    "pStyle" if in_para => {
                        let v = val().unwrap_or_default().to_lowercase().replace(' ', "");
                        if v == "title" {
                            level = 1;
                        } else if let Some(n) = v.strip_prefix("heading") {
                            level = n.parse::<usize>().map(|n| n.clamp(1, 3)).unwrap_or(level);
                        } else if v.contains("quote") {
                            quote = true;
                        } else if v.starts_with("listbullet") && list_id.is_none() {
                            list_id = Some(String::new());
                        } else if v.starts_with("listnumber") && list_id.is_none() {
                            list_id = Some("#".into());
                        }
                    }
                    "outlineLvl" if in_para => {
                        if let Some(n) = val().and_then(|v| v.parse::<usize>().ok()) {
                            // 9 is Word's "body text"
                            if n < 9 {
                                level = (n + 1).clamp(1, 3);
                            }
                        }
                    }
                    "ilvl" if in_para && !in_run => list_lvl = val().and_then(|v| v.parse().ok()).unwrap_or(0),
                    // numId 0 is "not a list"
                    "numId" if in_para && !in_run => list_id = val().filter(|v| v != "0"),
                    "r" if in_para => {
                        in_run = true;
                        run = Style::default();
                        text.clear();
                    }
                    "rPr" if in_run => in_rpr = true,
                    // <w:b/> is on; <w:b w:val="0"/> or "false" is off
                    "b" if in_rpr => run.bold = !matches!(val().as_deref(), Some("0") | Some("false")),
                    "i" if in_rpr => run.italic = !matches!(val().as_deref(), Some("0") | Some("false")),
                    "t" if in_run => in_text = true,
                    "tab" if in_run => text.push('\t'),
                    "br" if in_run => text.push('\n'),
                    // a picture: DrawingML's blip, or the older VML imagedata
                    "blip" | "imagedata" if in_para => {
                        let id = attr(&e, "embed").or_else(|| attr(&e, "id"));
                        if let Some(t) = id.and_then(|id| parts.rels.get(&id)) {
                            pictures.push(t.clone());
                        }
                    }
                    _ => {}
                }
            }
            // the words (entities arrive on their own, below)
            Ok(Event::Text(t)) if in_text => text.push_str(&t),
            Ok(Event::GeneralRef(g)) if in_text => {
                // entities inside the words: &amp; and the like, and &#8217;
                if let Ok(Some(c)) = g.resolve_char_ref() {
                    text.push(c);
                    continue;
                }
                text.push_str(match &*g {
                    "amp" => "&",
                    "lt" => "<",
                    "gt" => ">",
                    "quot" => "\"",
                    "apos" => "'",
                    _ => "",
                });
            }
            Ok(Event::End(e)) => match e.name().local_name().as_ref() {
                "t" => in_text = false,
                "rPr" => in_rpr = false,
                "r" if in_run => {
                    in_run = false;
                    if !text.is_empty() {
                        match runs.last_mut() {
                            Some((s, t)) if *s == run => t.push_str(&text),
                            _ => runs.push((run, text.clone())),
                        }
                    }
                }
                "p" if in_para => {
                    in_para = false;
                    let body: String = runs.iter().map(|(s, t)| if level > 0 { t.clone() } else { marked(*s, t) }).collect();
                    let (body, typed) = typed_list(&body);
                    let body = body.replace('\t', " ").trim().to_string();
                    let item = list_id.is_some() || typed.is_some();
                    if !body.is_empty() {
                        let block = if level > 0 {
                            format!("{} {}", "#".repeat(level), body.replace('\n', " "))
                        } else if item {
                            let counts = match (&typed, &list_id) {
                                (Some(c), _) => *c,
                                (None, Some(id)) if id == "#" => true,
                                (None, Some(id)) => parts.lists.get(id).and_then(|l| l.get(list_lvl).copied()).unwrap_or(false),
                                _ => false,
                            };
                            let lead = if counts { "   ".repeat(list_lvl) } else { "  ".repeat(list_lvl) };
                            format!("{lead}{} {}", if counts { "1." } else { "-" }, body.replace('\n', " "))
                        } else if quote {
                            body.lines().map(|l| format!("> {l}")).collect::<Vec<_>>().join("\n")
                        } else {
                            body
                        };
                        // a list's items stand a line apart, as one list
                        if item && was_item {
                            if let Some(last) = blocks.last_mut() {
                                last.push('\n');
                                last.push_str(&block);
                            }
                        } else {
                            blocks.push(block);
                        }
                        was_item = item;
                    }
                    for t in pictures.drain(..) {
                        blocks.push(format!("![]({t})"));
                        was_item = false;
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    blocks.join("\n\n")
}

/// A list typed out by hand, as other writers save one (`\t•\tthe item`,
/// `\t2\tthe item`): the item's words, and whether it counts.
fn typed_list(body: &str) -> (String, Option<bool>) {
    let b = body.trim_start_matches('\t');
    let Some((mark, rest)) = b.split_once('\t') else { return (body.to_string(), None) };
    let m = mark.trim();
    if matches!(m, "•" | "◦" | "▪" | "·" | "–" | "-") {
        return (rest.to_string(), Some(false));
    }
    if !m.is_empty() && m.trim_end_matches(['.', ')']).chars().all(|c| c.is_ascii_digit()) {
        return (rest.to_string(), Some(true));
    }
    (body.to_string(), None)
}

/// A run with its marks, the spaces kept outside them (a mark must not touch
/// a space on its inside, or it does not read as one).
fn marked(s: Style, t: &str) -> String {
    if !s.bold && !s.italic || t.trim().is_empty() {
        return t.to_string();
    }
    let lead = &t[..t.len() - t.trim_start().len()];
    let trail = &t[t.trim_end().len()..];
    let core = t.trim();
    let core = if s.italic { format!("_{core}_") } else { core.to_string() };
    let core = if s.bold { format!("**{core}**") } else { core };
    format!("{lead}{core}{trail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_word_document_as_markdown() {
        let xml = r#"<w:document xmlns:w="w"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">The ship is </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">there </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>at first</w:t></w:r><w:r><w:t xml:space="preserve"> light &amp; wind.</w:t></w:r></w:p>
<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>line two</w:t></w:r></w:p>
<w:p></w:p>
<w:p><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>A part</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>Not bold.</w:t></w:r></w:p>
</w:body></w:document>"#;
        assert_eq!(document_xml(xml), "# Chapter One\n\nThe ship is _there_ **at first** light & wind.\n\nLine one\nline two\n\n## A part\n\nNot bold.");
    }

    /// the fixture — a document as Word writes one, lists, a quote and a
    /// picture — against its expected Markdown
    #[test]
    fn the_word_fixture() {
        let dir = std::env::temp_dir().join(format!("doodle-docx-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let fx = Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/import");
        let (text, pictures) = docx(&fx.join("letters.docx"), Some(&dir)).unwrap();
        let want = fs::read_to_string(fx.join("letters.docx.md")).unwrap();
        let hash = pictures.first().expect("the picture is kept").clone();
        assert!(dir.join(&hash).exists());
        assert_eq!(text, want.trim_end().replace("assets/PICTURE.png", &hash));
        // without a project, the picture is left behind and nothing else changes
        let (bare, none) = docx(&fx.join("letters.docx"), None).unwrap();
        assert!(none.is_empty());
        assert_eq!(bare, want.trim_end().replace("\n\n![](assets/PICTURE.png)", ""));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn lists_typed_by_hand() {
        assert_eq!(typed_list("\t•\ta lamp"), ("a lamp".into(), Some(false)));
        assert_eq!(typed_list("\t2\tsecond"), ("second".into(), Some(true)));
        assert_eq!(typed_list("no\tlist"), ("no\tlist".into(), None));
    }
}
