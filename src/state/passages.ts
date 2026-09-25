/**
 * A book in passages (PLAN.md M6.2) — the pure part. Every written thing
 * (a chapter's words, a page's, a note's, a document on a board) cut at
 * its paragraphs into passages of about `AIM` words, never more than
 * `MOST`: a paragraph longer than that is cut at its sentences. Each is
 * known by a hash of its words, so a passage that has not changed is never
 * read again.
 */

export interface Passage {
  /** the node it is in */
  node: string;
  /** its words, as written */
  text: string;
  /** a hash of the words (and whatever else is asked to vary it) */
  key: string;
  /** a document's page it begins on, where the node has pages */
  page?: number;
}

interface Written {
  id: string;
  kind: string;
  status: string;
  data: Record<string, unknown>;
}

export const AIM = 180;
export const MOST = 300;

/** the kinds whose words are the book's, or what it is made from */
const READ = new Set(["chapter", "page", "note", "clip"]);

/** cyrb53: a fast 53-bit string hash, as a short string */
export function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const count = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** a paragraph too long for one passage, at its sentences */
function sentences(p: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of p.split(/(?<=[.!?…]["”’)]?)\s+/)) {
    if (cur && count(cur) + count(s) > AIM) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

/** One text in passages: paragraphs gathered to about `AIM` words. */
export function cut(text: string): { text: string; page: number }[] {
  const out: { text: string; page: number }[] = [];
  let page = 1;
  let cur: string[] = [];
  let at = 1;
  const close = () => {
    if (cur.length) out.push({ text: cur.join("\n\n"), page: at });
    cur = [];
  };
  for (const [i, sheet] of text.split("\f").entries()) {
    page = i + 1;
    for (const raw of sheet.split(/\n\s*\n/)) {
      const p = raw.trim();
      // a scene break or a picture is not a passage
      if (!p || /^(\* \* \*|!\[[^\]]*\]\([^)]*\))$/.test(p)) continue;
      const parts = count(p) > MOST ? sentences(p) : [p];
      for (const part of parts) {
        if (cur.length && count(cur.join(" ")) + count(part) > AIM) close();
        if (!cur.length) at = page;
        cur.push(part);
      }
    }
  }
  close();
  return out;
}

/** Every passage of the document, in the order it is read. */
export function passagesOf(nodes: Written[], salt = ""): Passage[] {
  const out: Passage[] = [];
  for (const n of nodes) {
    if (!READ.has(n.kind) || n.status === "rejected") continue;
    // a board's picture has no words of its own; what was seen of it does not count
    if (n.kind === "clip" && n.data.what === "picture") continue;
    const text = String(n.data.text ?? "");
    if (!text.trim()) continue;
    const paged = text.includes("\f");
    for (const p of cut(text)) out.push({ node: n.id, text: p.text, key: hash(`${salt}\n${p.text}`), ...(paged ? { page: p.page } : {}) });
  }
  return out;
}
