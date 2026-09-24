/**
 * Import into chapters (PLAN.md M2.9) — the pure part: a file's words
 * (Markdown, as `import.rs` hands them over) cut into chapters.
 *
 *  - **Markdown and Word**: at the top-level headings when there are two or
 *    more; else at the second level (a single `#` above them is the book's
 *    title, not a chapter); else the whole file is one chapter. What comes
 *    before the first heading, if it is words, is a chapter of its own.
 *    Front matter goes; pictures go (M3 brings them in); a link keeps its
 *    words; HTML tags go.
 *  - **Plain text**: at lines that say *Chapter 1*, *CHAPTER TWO*, *Part
 *    III: The Sea*; paragraphs are what blank lines part (lines broken
 *    inside a paragraph are joined).
 *  - **Fountain**: at its `#` sections, as a screenplay; the title page goes.
 */

export interface Piece {
  title: string;
  text: string;
}

export interface Split {
  chapters: Piece[];
  form: "prose" | "screenplay";
}

const NUMBER = "(?:\\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty[\\w-]*|thirty[\\w-]*|forty[\\w-]*|fifty[\\w-]*)";
const CHAPTER_LINE = new RegExp(`^\\s*(?:chapter|part|book)\\s+${NUMBER}\\b.*$`, "i");

/** Markdown as Doodle's writer reads it: what it cannot hold, gone */
export function cleanMarkdown(md: string): string {
  let s = md.replace(/^﻿/, "");
  s = s.replace(/^---\n[\s\S]*?\n---\n/, ""); // front matter
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ""); // pictures
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links keep their words
  s = s.replace(/<\/?[a-z][^>]*>/gi, ""); // tags
  s = s.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, "* * *"); // a rule is a scene break
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** cut at headings of one level: [title, body] each, and what came before */
function cutAt(md: string, level: number): { before: string; parts: Piece[] } {
  const mark = `${"#".repeat(level)} `;
  const lines = md.split("\n");
  const parts: Piece[] = [];
  const before: string[] = [];
  let cur: Piece | null = null;
  let body: string[] = [];
  const close = () => {
    if (cur) parts.push({ title: cur.title, text: body.join("\n").trim() });
    body = [];
  };
  for (const line of lines) {
    if (line.startsWith(mark) && !line.startsWith(`${mark}#`)) {
      close();
      cur = { title: line.slice(mark.length).replace(/\s+#*\s*$/, "").trim(), text: "" };
    } else if (cur) body.push(line);
    else before.push(line);
  }
  close();
  return { before: before.join("\n").trim(), parts };
}

const heads = (md: string, level: number) => md.split("\n").filter((l) => l.startsWith(`${"#".repeat(level)} `) && !l.startsWith(`${"#".repeat(level + 1)}`)).length;

/** one level up, so a chapter's own headings start at the top level */
const lift = (text: string, by: number) => (by ? text.replace(/^(#{2,6}) /gm, (_, h: string) => `${"#".repeat(Math.max(1, h.length - by))} `) : text);

export function fromMarkdown(md: string, name: string): Piece[] {
  const s = cleanMarkdown(md);
  if (!s) return [];
  const level = heads(s, 1) >= 2 ? 1 : heads(s, 2) >= 2 ? 2 : 0;
  if (!level) {
    // one chapter: its own heading (if there is one) is its name
    const { before, parts } = cutAt(s, 1);
    if (parts.length === 1 && !before) return [{ title: parts[0].title || name, text: lift(parts[0].text, 1) }];
    return [{ title: name, text: s }];
  }
  const { before, parts } = cutAt(s, level);
  const out: Piece[] = parts.map((p) => ({ title: p.title || "Untitled chapter", text: lift(p.text, level) }));
  // before the chapters: the book's title (a lone `#` above `##` chapters) goes; words stay, as a chapter
  const lead = level === 2 ? before.replace(/^# .*$/m, "").trim() : before;
  if (lead) out.unshift({ title: level === 2 && /^# /m.test(before) ? before.match(/^# (.*)$/m)![1].trim() : "Before", text: lead });
  return out;
}

/** plain text: paragraphs are what blank lines part */
function paragraphs(txt: string): string {
  const s = txt.replace(/^﻿/, "").replace(/[ \t]+$/gm, "");
  // hard-wrapped: lines inside a paragraph joined; no blank lines at all: every line a paragraph
  return /\n\s*\n/.test(s)
    ? s
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
        .filter(Boolean)
        .join("\n\n")
    : s
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n\n");
}

export function fromText(txt: string, name: string): Piece[] {
  const lines = txt.replace(/^﻿/, "").split(/\r?\n/);
  const cuts = lines.map((l, i) => (CHAPTER_LINE.test(l) && l.trim().length < 80 ? i : -1)).filter((i) => i >= 0);
  if (!cuts.length) {
    const t = paragraphs(txt);
    return t ? [{ title: name, text: t }] : [];
  }
  const out: Piece[] = [];
  const lead = paragraphs(lines.slice(0, cuts[0]).join("\n"));
  if (lead) out.push({ title: "Before", text: lead });
  cuts.forEach((at, k) => {
    const end = k + 1 < cuts.length ? cuts[k + 1] : lines.length;
    out.push({ title: lines[at].trim(), text: paragraphs(lines.slice(at + 1, end).join("\n")) });
  });
  return out;
}

export function fromFountain(src: string, name: string): Piece[] {
  let s = src.replace(/^﻿/, "");
  // the title page: key: value lines up to the first blank line
  if (/^(title|credit|author|source|draft date|contact)\s*:/i.test(s)) s = s.replace(/^[\s\S]*?\n\s*\n/, "");
  const { before, parts } = cutAt(s, 1);
  if (!parts.length) return s.trim() ? [{ title: name, text: s.trim() }] : [];
  const out = parts.map((p) => ({ title: p.title, text: p.text }));
  if (before.trim()) out.unshift({ title: "Before", text: before.trim() });
  return out;
}

/** A file, as `read_import` hands it over, in chapters. */
export function chaptersFrom(kind: string, text: string, name: string): Split {
  if (kind === "fountain") return { chapters: fromFountain(text, name), form: "screenplay" };
  if (kind === "txt") return { chapters: fromText(text, name), form: "prose" };
  return { chapters: fromMarkdown(text, name), form: "prose" };
}
