/**
 * The words as they are kept, and the words as blocks.
 *
 * What a document holds is still a string in `node.data.text` — the one
 * thing the prompts, the pages, the reading order, the export and the
 * anchors all read. The editor reads that string into blocks and writes
 * it back, so every other part of the app goes on working with words:
 *
 *  - prose is a small Markdown: `#`/`##`/`###` headings, `>` quotes,
 *    `**strong**`, `*em*`, `~~strike~~`, a line break inside a paragraph,
 *    a blank line between paragraphs;
 *  - a screenplay is a small Fountain: a scene heading starts INT./EXT.
 *    (or is forced with a `.`), a character is a line in capitals with its
 *    dialogue on the lines under it, a parenthetical is in brackets, a
 *    transition ends in TO: (or is forced with `>`), the rest is action.
 *
 * The plan (§8.3) keeps ProseMirror JSON as the canonical form; here the
 * canonical form is the text, because Markdown and Fountain are what a
 * writer, a model and an export all already read. `plain()` is the words
 * with the markup read away — what anchors hold on to and what is counted.
 */
import { Node as PMNode, type Mark } from "prosemirror-model";
import { schema, type Form } from "./schema";

const N = schema.nodes;
const K = schema.marks;

// ─── inline ─────────────────────────────────────────────────────────────────

// one unit of content is a character or an escape; a run ends on one
// that is not a space. An escape; **strong**; ~~strike~~; *em*; _em_ (not
// inside a word)
const U = String.raw`(?:\\[\s\S]|[^\\])`;
const INLINE = [
  String.raw`\\([\\*_~#>!.(@])`,
  String.raw`\*\*(?=\S)(${U}*?(?:\\[\s\S]|[^\s\\]))\*\*`,
  String.raw`~~(?=\S)(${U}*?(?:\\[\s\S]|[^\s\\]))~~`,
  String.raw`\*(?=[^\s*])(${U}*?(?:\\[\s\S]|[^\s*\\]))\*(?!\*)`,
  String.raw`(?<![\p{L}\p{N}\\])_(?=[^\s_])(${U}*?(?:\\[\s\S]|[^\s_\\]))_(?![\p{L}\p{N}])`,
].join("|");

/** a run of text with its marks read out; `\n` is a line break */
function inline(s: string, marks: readonly Mark[] = [], rich = true, breaks = true): PMNode[] {
  const out: PMNode[] = [];
  const push = (t: string) =>
    t.split("\n").forEach((part, i) => {
      if (i) out.push(breaks ? N.hard_break.create() : schema.text(" ", marks));
      if (part) out.push(schema.text(part, marks));
    });
  if (!rich) {
    push(s);
    return out;
  }
  const re = new RegExp(INLINE, "gu");
  let at = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > at) push(s.slice(at, m.index));
    if (m[1] !== undefined) push(m[1]);
    else if (m[2] !== undefined) out.push(...inline(m[2], K.strong.create().addToSet(marks), true, breaks));
    else if (m[3] !== undefined) out.push(...inline(m[3], K.strike.create().addToSet(marks), true, breaks));
    else if (m[4] !== undefined) out.push(...inline(m[4], K.em.create().addToSet(marks), true, breaks));
    else if (m[5] !== undefined) out.push(...inline(m[5], K.em.create().addToSet(marks), true, breaks));
    at = re.lastIndex;
  }
  if (at < s.length) push(s.slice(at));
  return out;
}

const DELIM: Record<string, string> = { strong: "**", em: "_", strike: "~~" };
const WORD = /[\p{L}\p{N}]/u;
const isWord = (c: string | undefined) => !!c && WORD.test(c);
/** words that would read as markup keep it as words; an underscore
 *  inside a word (snake_case) is left alone, since it cannot open */
const escape = (t: string) =>
  t
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/~~/g, "\\~\\~")
    .replace(/_/g, (_u, i: number, all: string) => (isWord(all[i - 1]) && isWord(all[i + 1]) ? "_" : "\\_"));

/** a block's inline content back to text: marks as their delimiters,
 *  whitespace kept outside them so the delimiters still read */
function serializeInline(node: PMNode, rich = true): string {
  type Run = { text: string; marks: readonly Mark[] };
  const runs: Run[] = [];
  node.forEach((c) => runs.push({ text: c.isText ? c.text! : "\n", marks: c.isText ? c.marks : runs.at(-1)?.marks ?? [] }));
  if (!rich) return runs.map((r) => r.text).join("");
  // edge whitespace takes only the marks its neighbour shares
  const split: Run[] = [];
  runs.forEach((r, i) => {
    const prev = runs[i - 1]?.marks ?? [];
    const next = runs[i + 1]?.marks ?? [];
    if (r.text === "\n") return void split.push({ text: r.text, marks: r.marks.filter((m) => m.isInSet(prev) && m.isInSet(next)) });
    if (!r.marks.length) return void split.push(r);
    const lead = r.text.match(/^\s*/)![0];
    const trail = r.text.slice(lead.length).match(/\s*$/)![0];
    const core = r.text.slice(lead.length, r.text.length - trail.length);
    if (!core) return void split.push({ text: r.text, marks: r.marks.filter((m) => m.isInSet(prev) && m.isInSet(next)) });
    if (lead) split.push({ text: lead, marks: r.marks.filter((m) => m.isInSet(prev)) });
    if (core) split.push({ text: core, marks: r.marks });
    if (trail) split.push({ text: trail, marks: r.marks.filter((m) => m.isInSet(next)) });
  });
  const toks: Tok[] = [];
  let open: readonly Mark[] = [];
  const close = (from: number) => {
    for (let i = open.length - 1; i >= from; i--) toks.push({ mark: open[i].type.name, open: false });
  };
  // how many runs from here on a mark lasts: the longer, the further out it opens
  const lasts = (m: Mark, from: number) => {
    let n = 0;
    while (from + n < split.length && m.isInSet(split[from + n].marks)) n++;
    return n;
  };
  split.forEach((r, at) => {
    const want = r.marks;
    let keep = 0;
    while (keep < open.length && open[keep].isInSet(want)) keep++;
    close(keep);
    const kept = open.slice(0, keep);
    const fresh = want.filter((m) => !m.isInSet(kept)).sort((a, b) => lasts(b, at) - lasts(a, at));
    for (const m of fresh) toks.push({ mark: m.type.name, open: true });
    open = [...kept, ...fresh];
    toks.push({ text: r.text === "\n" ? "\n" : escape(r.text) });
  });
  close(0);
  tidy(toks);
  // emphasis is _this_, except inside a word, where only *this* opens
  const charBefore = (i: number) => {
    for (let j = i - 1; j >= 0; j--) {
      const t = toks[j];
      if ("text" in t) return t.text.at(-1);
      return DELIM[t.mark].at(-1);
    }
  };
  const charAfter = (i: number) => {
    for (let j = i + 1; j < toks.length; j++) {
      const t = toks[j];
      if ("text" in t) return t.text[0];
      return DELIM[t.mark][0];
    }
  };
  let out = "";
  let emDelim = "_";
  toks.forEach((t, i) => {
    if ("text" in t) return void (out += t.text);
    if (t.mark !== "em") return void (out += DELIM[t.mark]);
    if (t.open) {
      let j = i + 1;
      while (j < toks.length && !(!("text" in toks[j]) && (toks[j] as { mark: string }).mark === "em")) j++;
      emDelim = isWord(charBefore(i)) || isWord(charAfter(j)) ? "*" : "_";
    }
    out += emDelim;
  });
  return out;
}

type Tok = { mark: string; open: boolean } | { text: string };
/** a delimiter never touches a space on its inside — a space there is
 *  moved outside it — and a mark around nothing is dropped. Whatever order
 *  the marks had to nest in, what comes out reads back as it went in. */
function tidy(toks: Tok[]) {
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = toks.length - 1; i >= 0; i--) {
      const t = toks[i];
      if ("text" in t && !t.text) toks.splice(i, 1);
    }
    for (let i = 0; i < toks.length && !changed; i++) {
      const t = toks[i];
      if ("text" in t) continue;
      const next = toks[i + 1];
      const prev = toks[i - 1];
      if (t.open && next && !("text" in next) && !next.open && next.mark === t.mark) {
        toks.splice(i, 2);
        changed = true;
      } else if (t.open && next && "text" in next && /^\s/.test(next.text)) {
        const ws = next.text.match(/^\s+/)![0];
        next.text = next.text.slice(ws.length);
        toks.splice(i, 0, { text: ws });
        changed = true;
      } else if (!t.open && prev && "text" in prev && /\s$/.test(prev.text)) {
        const ws = prev.text.match(/\s+$/)![0];
        prev.text = prev.text.slice(0, -ws.length);
        toks.splice(i + 1, 0, { text: ws });
        changed = true;
      }
    }
  }
}

// ─── prose ──────────────────────────────────────────────────────────────────

const HEADING = /^(#{1,3})\s+(.*)$/;
/** a figure: `![caption](assets/… "alt"){.page}` — the placement only when it is not in the run of the text */
const FIGURE = /^!\[((?:\\.|\[[^\]]*\]|[^\]\\])*)\]\(([^)\s]+)(?:\s+"((?:\\.|[^"\\])*)")?\)(?:\{\.(page|opener)\})?\s*$/;
const unescape = (s: string) => s.replace(/\\(.)/g, "$1");

/** A chapter's words with a figure put in after the paragraph a passage
 *  is in (M5.3) — or at the end, if the passage is not there any more. */
export function figureAfter(text: string, quote: string, line: string): string {
  const want = quote.replace(/\s+/g, " ").trim().slice(0, 60);
  const blocks = text.split(/\n{2,}/);
  const i = want ? blocks.findIndex((b) => plain(b).replace(/\s+/g, " ").includes(want)) : -1;
  if (i < 0) return `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${line}`;
  return [...blocks.slice(0, i + 1), line, ...blocks.slice(i + 1)].join("\n\n");
}

/** a figure as its line of Markdown */
export function figureLine(a: { src: string; caption?: string; alt?: string; place?: string }): string {
  const caption = (a.caption ?? "").replace(/[\\\]]/g, "\\$&").replace(/\n/g, " ");
  const alt = (a.alt ?? "").replace(/[\\"]/g, "\\$&").replace(/\n/g, " ");
  return `![${caption}](${a.src}${alt ? ` "${alt}"` : ""})${a.place && a.place !== "inline" ? `{.${a.place}}` : ""}`;
}

function parseProse(text: string): PMNode[] {
  const blocks: PMNode[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(N.paragraph.create(null, inline(para.join("\n"))));
    if (quote.length) {
      const paras = quote.join("\n").split(/\n\s*\n/).filter((p) => p.trim());
      blocks.push(N.quote.create(null, (paras.length ? paras : [""]).map((p) => N.paragraph.create(null, inline(p)))));
    }
    para = [];
    quote = [];
  };
  for (const line of text.split("\n")) {
    const h = line.match(HEADING);
    const fig = !quote.length && line.match(FIGURE);
    if (!line.trim()) flush();
    else if (fig) {
      flush();
      blocks.push(N.figure.create({ caption: unescape(fig[1]), src: fig[2], alt: unescape(fig[3] ?? ""), place: fig[4] ?? "inline" }));
    }
    else if (h && !quote.length) {
      flush();
      blocks.push(N.heading.create({ level: h[1].length }, inline(h[2], [], true, false)));
    } else if (line.startsWith(">")) {
      if (para.length) flush();
      quote.push(line.replace(/^>\s?/, ""));
    } else {
      if (quote.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** a line that would read as something else is kept as words with a `\` */
const guardProse = (s: string) => s.split("\n").map((l) => (/^(#{1,3}\s|>)/.test(l) ? `\\${l}` : l)).join("\n");

function serializeProse(doc: PMNode): string {
  const out: string[] = [];
  doc.forEach((b) => {
    if (b.type === N.heading) {
      const t = serializeInline(b).replace(/\n/g, " ").trim();
      if (t) out.push(`${"#".repeat(b.attrs.level)} ${t}`);
    } else if (b.type === N.figure) {
      if (b.attrs.src) out.push(figureLine(b.attrs as { src: string }));
    } else if (b.type === N.quote) {
      const paras: string[] = [];
      b.forEach((p) => {
        const t = serializeInline(p);
        if (t.trim()) paras.push(t.split("\n").map((l) => `> ${l}`).join("\n"));
      });
      if (paras.length) out.push(paras.join("\n>\n"));
    } else {
      // a screenplay block in a prose document keeps its words as a paragraph
      const t = b.type === N.paragraph || b.type === N.dialogue ? serializeInline(b) : b.textContent;
      if (t.trim()) out.push(guardProse(t));
    }
  });
  return out.join("\n\n");
}

// ─── screenplay ─────────────────────────────────────────────────────────────

const SCENE = /^(INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E)[.\s]/i;
const TRANSITION = /^[A-Z0-9 .'’-]*TO:$/;
/** a character cue: capitals (an extension in brackets allowed), not punctuation alone */
const isCue = (l: string) => {
  const t = l.trim().replace(/\s*\(.*\)\s*$/, "");
  return !!t && /[A-Z]/.test(t) && t === t.toUpperCase() && !/^[!.>]/.test(t) && !SCENE.test(t) && !TRANSITION.test(l.trim());
};

type Kind = "scene" | "transition" | "dialogue" | "action";
/** what a run of lines between blank lines is */
function kindOf(lines: string[]): Kind {
  const first = lines[0];
  if (first.startsWith("!")) return "action";
  if ((first.startsWith(".") && !first.startsWith("..")) || SCENE.test(first)) return "scene";
  if (lines.length === 1 && (TRANSITION.test(first.trim()) || (first.startsWith(">") && !first.trim().endsWith("<")))) return "transition";
  if (lines.length >= 2 && isCue(first)) return "dialogue";
  return "action";
}

function parseScreenplay(text: string): PMNode[] {
  const blocks: PMNode[] = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((l, i, all) => l.trim() || (i > 0 && i < all.length - 1));
    if (!lines.length) continue;
    const kind = kindOf(lines);
    if (kind === "scene") {
      blocks.push(N.scene.create(null, inline(lines[0].replace(/^\.(?!\.)/, "").trim(), [], false, false)));
      if (lines.length > 1) blocks.push(N.paragraph.create(null, inline(lines.slice(1).join("\n"))));
    } else if (kind === "transition") {
      blocks.push(N.transition.create(null, inline(lines[0].replace(/^>\s*/, "").trim(), [], false, false)));
    } else if (kind === "dialogue") {
      blocks.push(N.character.create(null, inline(lines[0].trim(), [], false, false)));
      let said: string[] = [];
      const say = () => {
        if (said.length) blocks.push(N.dialogue.create(null, inline(said.join("\n"))));
        said = [];
      };
      for (const l of lines.slice(1)) {
        const t = l.trim();
        if (t.startsWith("(") && t.endsWith(")")) {
          say();
          // the brackets are the element's, drawn by it; the words are inside
          blocks.push(N.parenthetical.create(null, inline(t.slice(1, -1).trim(), [], false, false)));
        } else said.push(l);
      }
      say();
    } else {
      blocks.push(N.paragraph.create(null, inline(lines.join("\n").replace(/^!/, ""))));
    }
  }
  return blocks;
}

function serializeScreenplay(doc: PMNode): string {
  const out: string[] = [];
  let cue: string[] | null = null; // a character and what they say, one run of lines
  const end = () => {
    if (cue) out.push(cue.join("\n"));
    cue = null;
  };
  doc.forEach((b) => {
    const t = b.type === N.paragraph || b.type === N.dialogue ? serializeInline(b) : b.textContent;
    if (b.type === N.character) {
      end();
      if (t.trim()) cue = [t.trim().toUpperCase()];
      return;
    }
    if (b.type === N.dialogue || b.type === N.parenthetical) {
      if (!t.trim()) return;
      const line = b.type === N.parenthetical ? `(${t.trim().replace(/^\(|\)$/g, "")})` : guardSaid(t);
      if (cue) cue.push(line);
      else out.push(guardAction(line)); // said by no one: it is action
      return;
    }
    end();
    if (!t.trim()) return;
    if (b.type === N.scene) out.push(SCENE.test(t) ? t.trim() : `.${t.trim()}`);
    else if (b.type === N.transition) out.push(TRANSITION.test(t.trim().toUpperCase()) ? t.trim().toUpperCase() : `> ${t.trim()}`);
    else if (b.type === N.heading) out.push(guardAction(b.textContent));
    else if (b.type === N.quote) out.push(guardAction(b.textContent));
    else out.push(guardAction(t));
  });
  end();
  return out.join("\n\n");
}

/** action that would read as another element is forced with a `!` */
const guardAction = (t: string) => (t.startsWith("!") || kindOf(t.split("\n")) !== "action" ? `!${t}` : t);
/** dialogue that would read as a parenthetical keeps its bracket as a word */
const guardSaid = (t: string) => t.split("\n").map((l) => (/^\s*\(.*\)\s*$/.test(l) ? `\\${l.trimStart()}` : l)).join("\n");

// ─── the whole ──────────────────────────────────────────────────────────────

export function parse(text: string, form: Form = "prose"): PMNode {
  const src = text.replace(/\r\n?/g, "\n");
  const blocks = form === "screenplay" ? parseScreenplay(src) : parseProse(src);
  return N.doc.create(null, blocks.length ? blocks : [N.paragraph.create()]);
}

export function serialize(doc: PMNode, form: Form = "prose"): string {
  return form === "screenplay" ? serializeScreenplay(doc) : serializeProse(doc);
}

// ─── the words, read ────────────────────────────────────────────────────────

export interface Plain {
  text: string;
  /** every text block: where its words start in `text`, where its content
   *  starts in the document, and how long it is (the same in both) */
  blocks: { start: number; pos: number; len: number }[];
}

/** the words of a document, blocks a blank line apart, a line break a
 *  newline — one character for every position inside a text block */
export function plainOf(doc: PMNode): Plain {
  let text = "";
  const blocks: Plain["blocks"] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let t = "";
    node.forEach((c) => (t += c.isText ? c.text : "\n"));
    if (blocks.length) text += "\n\n";
    blocks.push({ start: text.length, pos: pos + 1, len: t.length });
    text += t;
    return false;
  });
  return { text, blocks };
}

/** a place in the words → a position in the document */
export function toPos(p: Plain, offset: number): number {
  for (const b of p.blocks) if (offset <= b.start + b.len) return b.pos + Math.max(0, offset - b.start);
  const last = p.blocks.at(-1);
  return last ? last.pos + last.len : 0;
}

/** a position in the document → a place in the words */
export function toOffset(p: Plain, pos: number): number {
  let best = 0;
  for (const b of p.blocks) {
    if (pos < b.pos) return best;
    if (pos <= b.pos + b.len) return b.start + (pos - b.pos);
    best = b.start + b.len;
  }
  return best;
}

const seen = new Map<string, string>();
/** the words with the markup read away — what anchors and counts use */
export function plain(text: string, form: Form = "prose"): string {
  const key = `${form}\u0000${text}`;
  const hit = seen.get(key);
  if (hit !== undefined) return hit;
  const out = plainOf(parse(text, form)).text;
  if (seen.size > 400) seen.clear();
  seen.set(key, out);
  return out;
}

export const formOf = (data: Record<string, unknown>): Form => (data.form === "screenplay" ? "screenplay" : "prose");

export const countWords = (text: string, form: Form = "prose") => {
  const t = plain(text, form).trim();
  return t ? t.split(/\s+/).length : 0;
};
