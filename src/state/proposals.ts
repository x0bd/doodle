/**
 * Build from the board (PLAN.md M3.6) — the pure part: the board as
 * numbered material for the writer, what the writer is asked, and its
 * answer made proposals tied to the clippings their numbers name.
 */
import type { GraphNode } from "./graph";
import { plain } from "../writer/markup";

export type ProposalKind = "character" | "location" | "thing" | "style" | "chapter" | "bible";

export interface Proposal {
  id: string;
  kind: ProposalKind;
  title: string;
  text: string;
  /** a style's palette and lighting; the bible's three parts */
  extra?: Record<string, string>;
  /** the clippings it came from */
  from: string[];
}

export interface Built {
  board: string;
  by: string;
  items: Proposal[];
}

/** words enough of each document for the writer's window */
const DOC_WORDS = 1200;
const ALL_WORDS = 7000;

const cap = (text: string, words: number) => {
  const w = text.split(/\s+/).filter(Boolean);
  return w.length > words ? `${w.slice(0, words).join(" ")} …` : w.join(" ");
};

/** The board as numbered material: `[3] A picture “harbour-03”: …`, and
 *  which clipping each number is. */
export function digest(nodes: GraphNode[]): { text: string; index: string[] } {
  const order = { document: 0, passage: 1, note: 2, picture: 3 } as Record<string, number>;
  const things = nodes
    .filter((n) => n.kind === "clip" || (n.kind === "note" && String(n.data.text ?? "").trim()))
    .sort((a, b) => (order[a.kind === "note" ? "note" : String(a.data.what)] ?? 9) - (order[b.kind === "note" ? "note" : String(b.data.what)] ?? 9));
  const index: string[] = [];
  const parts: string[] = [];
  let budget = ALL_WORDS;
  for (const n of things) {
    const what = n.kind === "note" ? "note" : String(n.data.what);
    const from = String(n.data.from ?? "");
    const note = String(n.data.note ?? "").trim();
    let body: string;
    if (what === "picture") body = String(n.data.seen ?? "").trim() || "(not looked at)";
    else if (what === "note") body = String(n.data.text ?? "");
    else body = plain(String(n.data.text ?? "").replaceAll("\f", "\n\n").replace(/^!\[[^\]]*\]\([^)]*\)$/gm, ""));
    const words = what === "document" ? Math.min(DOC_WORDS, budget) : Math.min(400, budget);
    if (words <= 0) break;
    body = cap(body, words);
    budget -= body.split(/\s+/).length;
    index.push(n.id);
    const head = what === "document" ? `A document “${n.title}”${from ? ` (${from})` : ""}` : what === "passage" ? `A passage from ${from || "a document"}${n.data.page ? `, page ${n.data.page}` : ""}` : what === "picture" ? `A picture “${n.title}”` : `A note “${n.title}”`;
    parts.push(`[${index.length}] ${head}:\n${body}${note ? `\n(The writer's note on it: ${note})` : ""}`);
  }
  return { text: parts.join("\n\n"), index };
}

export const BUILD_SYSTEM = `BUILD FROM THE BOARD. You read a writer's gathered material for a book — documents, passages, notes, and descriptions of pictures, each numbered like [3] — and propose what the book could be built from:
- the cast: the people in it;
- the places;
- things that matter (objects);
- one visual style, drawn from the pictures: its palette, its lighting, its medium;
- a chapter outline: 6 to 12 chapters, each a title and a one-line summary;
- a bible: the tone; the rules of its world; what to avoid.
Use only what the material supports; where it is thin, propose less rather than inventing. Descriptions are one or two sentences, concrete, in plain words. For every item give "from": the numbers of the material it comes from. Answer with JSON matching the schema, nothing else.`;

const ITEM = {
  type: "object",
  properties: { name: { type: "string" }, description: { type: "string" }, from: { type: "array", items: { type: "integer" } } },
  required: ["name", "description", "from"],
};
export const BUILD_SCHEMA = {
  type: "object",
  properties: {
    cast: { type: "array", items: ITEM },
    places: { type: "array", items: ITEM },
    things: { type: "array", items: ITEM },
    style: {
      type: "object",
      properties: { name: { type: "string" }, description: { type: "string" }, palette: { type: "string" }, lighting: { type: "string" }, from: { type: "array", items: { type: "integer" } } },
      required: ["name", "description", "palette", "lighting", "from"],
    },
    outline: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" }, from: { type: "array", items: { type: "integer" } } }, required: ["title", "summary", "from"] },
    },
    bible: { type: "object", properties: { tone: { type: "string" }, rules: { type: "string" }, avoid: { type: "string" } }, required: ["tone", "rules", "avoid"] },
  },
  required: ["cast", "places", "things", "style", "outline", "bible"],
};

let seq = 0;
const pid = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The writer's answer → proposals, their numbers made clippings. Anything
 *  the answer got wrong (a missing list, a number past the end) is passed
 *  over, not trusted. */
export function parseBuild(answer: string, index: string[]): Proposal[] {
  const json = answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1);
  let a: Record<string, unknown>;
  try {
    a = JSON.parse(json);
  } catch {
    return [];
  }
  const from = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((n) => index[Number(n) - 1]).filter(Boolean))];
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []).filter((x) => x && typeof x === "object");
  const out: Proposal[] = [];
  for (const [key, kind] of [["cast", "character"], ["places", "location"], ["things", "thing"]] as const)
    for (const x of list(a[key]).slice(0, 12)) if (s(x.name)) out.push({ id: pid(), kind, title: s(x.name), text: s(x.description), from: from(x.from) });
  const st = a.style as Record<string, unknown> | undefined;
  if (st && s(st.name)) out.push({ id: pid(), kind: "style", title: s(st.name), text: s(st.description), extra: { palette: s(st.palette), lighting: s(st.lighting) }, from: from(st.from) });
  for (const x of list(a.outline).slice(0, 16)) if (s(x.title)) out.push({ id: pid(), kind: "chapter", title: s(x.title), text: s(x.summary), from: from(x.from) });
  const b = a.bible as Record<string, unknown> | undefined;
  if (b && (s(b.tone) || s(b.rules) || s(b.avoid))) out.push({ id: pid(), kind: "bible", title: "The bible", text: s(b.tone), extra: { tone: s(b.tone), rules: s(b.rules), avoid: s(b.avoid) }, from: [] });
  return out;
}

