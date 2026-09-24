//! Import (PLAN.md M2.9, the start of M3.1's readers): a file's words as
//! Markdown, for the page to split into chapters. Markdown, Fountain and
//! plain text are read as they are (as UTF-8, a byte that is not read as
//! the replacement character rather than refused); a Word document
//! (`.docx`) is read from its `word/document.xml` — headings (by style, or
//! by outline level) become `#`s, bold and italic runs `**` and `_`, a line
//! break a line break — and nothing else of Word's comes with it.

use std::fs;
use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;

const MAX: u64 = 32 * 1024 * 1024;

#[derive(serde::Serialize)]
pub struct Imported {
    /// the file's name without its extension — a chapter's title when there is nothing better
    pub name: String,
    /// md, txt, fountain, docx
    pub kind: String,
    pub text: String,
}

#[tauri::command]
pub fn read_import(path: String) -> Result<Imported, String> {
    let p = Path::new(&path);
    let size = fs::metadata(p).map_err(|e| e.to_string())?.len();
    if size > MAX {
        return Err("Larger than 32 MB".into());
    }
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("Imported").to_string();
    let (kind, text) = match ext.as_str() {
        "md" | "markdown" | "mdown" => ("md", String::from_utf8_lossy(&fs::read(p).map_err(|e| e.to_string())?).into_owned()),
        "txt" | "text" => ("txt", String::from_utf8_lossy(&fs::read(p).map_err(|e| e.to_string())?).into_owned()),
        "fountain" | "spmd" => ("fountain", String::from_utf8_lossy(&fs::read(p).map_err(|e| e.to_string())?).into_owned()),
        "docx" => ("docx", docx(p)?),
        other => return Err(format!("Doodle does not read .{other} files yet — Markdown, plain text, Fountain and Word (.docx) it does.")),
    };
    Ok(Imported { name, kind: kind.into(), text: text.replace("\r\n", "\n").replace('\r', "\n") })
}

/// A Word document's words as Markdown.
pub fn docx(p: &Path) -> Result<String, String> {
    let file = fs::File::open(p).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "Not a Word document (it is not a .docx zip)".to_string())?;
    let mut xml = String::new();
    zip.by_name("word/document.xml").map_err(|_| "Not a Word document (no document.xml)".to_string())?.read_to_string(&mut xml).map_err(|e| e.to_string())?;
    Ok(document_xml(&xml))
}

#[derive(Default, Clone, Copy, PartialEq)]
struct Style {
    bold: bool,
    italic: bool,
}

/// `word/document.xml` → Markdown: one paragraph a block, a blank line apart.
pub fn document_xml(xml: &str) -> String {
    let mut r = Reader::from_str(xml);
    let mut blocks: Vec<String> = Vec::new();
    // the paragraph being read: its heading level, its runs
    let mut level = 0usize;
    let mut runs: Vec<(Style, String)> = Vec::new();
    let mut run = Style::default();
    let mut text = String::new();
    let (mut in_para, mut in_run, mut in_rpr, mut in_text) = (false, false, false, false);
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = e.name();
                let local = name.local_name();
                let val = || {
                    e.attributes()
                        .flatten()
                        .find(|a| a.key.local_name().as_ref() == "val")
                        .map(|a| a.value.to_string())
                };
                match local.as_ref() {
                    "p" => {
                        in_para = true;
                        level = 0;
                        runs.clear();
                    }
                    "pStyle" if in_para => {
                        let v = val().unwrap_or_default().to_lowercase();
                        if v == "title" {
                            level = 1;
                        } else if let Some(n) = v.strip_prefix("heading").map(|s| s.trim()) {
                            level = n.parse::<usize>().map(|n| n.clamp(1, 3)).unwrap_or(level);
                        }
                    }
                    "outlineLvl" if in_para => {
                        if let Some(n) = val().and_then(|v| v.parse::<usize>().ok()) {
                            level = (n + 1).clamp(1, 3);
                        }
                    }
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
                    "tab" if in_run => text.push(' '),
                    "br" if in_run => text.push('\n'),
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
                    let body = body.trim().to_string();
                    if !body.is_empty() {
                        blocks.push(if level > 0 { format!("{} {}", "#".repeat(level), body.replace('\n', " ")) } else { body });
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
}
