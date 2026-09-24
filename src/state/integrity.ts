/**
 * Integrity (PLAN.md M1.6): whether a graph on the disk can be trusted, and
 * what had to be set right to trust it.
 *
 * `check()` reads the words of a `graph.json`: not JSON, not a Doodle
 * graph, or no cards at all is **damaged** (the caller opens the newest good
 * backup instead); a format newer than this Doodle is **newer** (never
 * "repaired" — an update opens it); anything else is brought to the current
 * format by the migrations, one version at a time, and then made whole —
 * an order that names a card that is not there, a wire to nowhere, a card
 * inside a card that is gone or inside itself — each one said in a line,
 * so a repair is never silent.
 */
import { KINDS, type NodeKind } from "../graph/kinds";
import type { Edge, GraphNode, GraphState } from "./graph";
import type { Camera } from "../canvas/camera";
import type { Prov } from "./prov";
import type { Bible } from "./recovery";
import type { Stats } from "./stats";
import { plain } from "../writer/markup";

/** the format this Doodle writes: 2 — a chapter holds its own words (D1) */
export const FORMAT = 2;

export interface FileGraph {
  format: "doodle-graph";
  version: number;
  name: string;
  nodes: GraphState["nodes"];
  order: GraphState["order"];
  edges: GraphState["edges"];
  camera: Camera;
  /** each workspace's last view, by node id; "root" for the top */
  views?: Record<string, Camera>;
  bible?: Bible;
  /** where every generated thing came from, by what it produced */
  provenance?: Record<string, Prov>;
  /** the daily goal and the days written (M2.5) */
  stats?: Stats;
  /** the words taught to the book's spelling (M2.8) */
  words?: string[];
}

export class Unreadable extends Error {
  constructor(
    message: string,
    /** made by a newer Doodle — not damaged, and no backup is better */
    public newer = false,
  ) {
    super(message);
  }
}

/** Each step takes a file of version n to version n + 1, and says what it
 *  did when a person would want to know. */
type Raw = Record<string, unknown>;
type Step = (f: Raw) => { f: Raw; said?: string };
const MIGRATIONS: Record<number, Step> = {
  // before the version was written down: the same shape as 1
  0: (f) => ({ f: { ...f, version: 1 } }),
  // D1: the chapter is the manuscript — its pages become its words
  1: joinChapters,
};

export function migrate(f: Raw): { f: Raw; said: string[] } {
  let v = typeof f.version === "number" ? f.version : 0;
  if (v > FORMAT) throw new Unreadable("was made by a newer version of Doodle", true);
  const said: string[] = [];
  while (v < FORMAT) {
    const step = MIGRATIONS[v];
    if (!step) throw new Unreadable(`is in a format this Doodle cannot read (${v})`);
    const r = step(f);
    f = { ...r.f, version: v + 1 };
    if (r.said) said.push(r.said);
    v++;
  }
  return { f, said };
}

/**
 * Format 1 → 2 (PLAN.md D1, M2.1). A chapter was a field of page cards of
 * ~350 words; now it holds its own words, and pages are only how they are
 * laid out. Each chapter's pages, in their order, become its text — one
 * paragraph break between them — and the pages go. What was inside a page
 * (its beats and notes) moves into the chapter; a beat tied to a page's
 * words is tied to the same words in the chapter; a page's pictures become
 * the chapter's; a wire to or from a page is to or from its chapter. Pages
 * not in a chapter stay as they were.
 */
function joinChapters(f: Raw): { f: Raw; said?: string } {
  if (!isObj(f.nodes)) return { f };
  const nodes: Record<string, Raw> = { ...(f.nodes as Record<string, Raw>) };
  const order = Array.isArray(f.order) ? (f.order as string[]) : Object.keys(nodes);
  const rank = (id: string) => {
    const n = nodes[id];
    return typeof n?.seq === "number" ? n.seq : order.indexOf(id);
  };
  const into = new Map<string, string>(); // page → its chapter
  let joined = 0;
  for (const [cid, c] of Object.entries(nodes)) {
    if (!isObj(c) || c.kind !== "chapter") continue;
    const pages = Object.keys(nodes)
      .filter((id) => isObj(nodes[id]) && nodes[id].kind === "page" && nodes[id].parent === cid)
      .sort((a, b) => rank(a) - rank(b));
    const data = isObj(c.data) ? { ...c.data } : {};
    if (!pages.length) {
      nodes[cid] = { ...c, data: { text: "", ...data } };
      continue;
    }
    const texts = pages.map((id) => {
      const d = nodes[id].data;
      return isObj(d) && typeof d.text === "string" ? d.text.trim() : "";
    });
    const own = typeof data.text === "string" && data.text.trim() ? [data.text.trim()] : [];
    const text = [...own, ...texts.filter(Boolean)].join("\n\n");
    // where each page's words now begin, in the chapter's plain words
    const whole = plain(text);
    let cursor = 0;
    const starts = new Map<string, number>();
    pages.forEach((id, i) => {
      const p = plain(texts[i]);
      if (!p) return starts.set(id, cursor);
      const at = whole.indexOf(p.slice(0, 60), cursor);
      const start = at < 0 ? cursor : at;
      starts.set(id, start);
      cursor = start + p.length;
    });
    const pictures = new Set<string>(Array.isArray(c.attachments) ? (c.attachments as string[]) : []);
    for (const id of pages) {
      const p = nodes[id];
      for (const r of [p.asset, ...(Array.isArray(p.attachments) ? p.attachments : [])]) if (typeof r === "string") pictures.add(r);
      into.set(id, cid);
    }
    nodes[cid] = { ...c, data: { ...data, text }, ...(pictures.size ? { attachments: [...pictures] } : {}) };
    // what was inside a page is inside the chapter; a tie follows its words
    for (const [kid, k] of Object.entries(nodes)) {
      if (!isObj(k) || typeof k.parent !== "string" || !into.has(k.parent) || into.get(k.parent) !== cid) continue;
      const page = k.parent;
      const anchor = isObj(k.anchor) && k.anchor.node === page ? { ...k.anchor, node: cid, at: (typeof k.anchor.at === "number" ? k.anchor.at : 0) + (starts.get(page) ?? 0) } : k.anchor;
      nodes[kid] = { ...k, parent: cid, ...(anchor !== undefined ? { anchor } : {}) };
    }
    for (const id of pages) delete nodes[id];
    joined++;
  }
  if (!joined) return { f: { ...f, nodes } };
  // wires to or from a page are to or from its chapter; one wire into a chapter's words
  const edges: Record<string, Raw> = {};
  const fed = new Set<string>();
  for (const [key, e] of Object.entries(isObj(f.edges) ? (f.edges as Record<string, Raw>) : {})) {
    if (!isObj(e) || !isObj(e.from) || !isObj(e.to)) continue;
    const from = into.get(e.from.node as string);
    const to = into.get(e.to.node as string);
    const next = { ...e, from: from ? { node: from, port: "text" } : e.from, to: to ? { node: to, port: "text" } : e.to };
    if (to) {
      if (fed.has(to) || next.from.node === to) continue;
      fed.add(to);
    }
    edges[key] = next;
  }
  return {
    f: { ...f, nodes, edges, order: order.filter((id) => nodes[id]) },
    said: `${joined === 1 ? "its chapter's pages were" : `the pages of ${joined} chapters were`} joined into one manuscript${joined === 1 ? "" : " each"} — pages are how the words are laid out now`,
  };
}

const isObj = (x: unknown): x is Raw => !!x && typeof x === "object" && !Array.isArray(x);
const num = (x: unknown, or: number) => (typeof x === "number" && Number.isFinite(x) ? x : or);
const STATES = new Set(["canon", "draft", "exploration", "rejected"]);
const plural = (n: number, one: string, many: string) => (n === 1 ? `one ${one}` : `${n} ${many}`);

export interface Checked {
  file: FileGraph;
  /** what was set right, in words; empty when nothing was */
  fixes: string[];
}

/** The words of a graph.json, read, brought up to date and made whole. */
export function check(text: string): Checked {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Unreadable("could not be read — the file is cut short or damaged");
  }
  if (!isObj(raw) || raw.format !== "doodle-graph") throw new Unreadable("is not a Doodle graph");
  const { f, said } = migrate(raw);
  if (!isObj(f.nodes)) throw new Unreadable("has lost its cards");

  const fixes: string[] = [...said];
  let unknown = 0;
  let mended = 0;
  const nodes: Record<string, GraphNode> = {};
  for (const [key, v] of Object.entries(f.nodes)) {
    if (!isObj(v) || typeof v.kind !== "string" || !(v.kind in KINDS)) {
      unknown++;
      continue;
    }
    const kind = v.kind as NodeKind;
    const size = KINDS[kind].size;
    const n = {
      ...v,
      id: key,
      kind,
      x: num(v.x, 0),
      y: num(v.y, 0),
      w: num(v.w, size.w),
      h: num(v.h, size.h),
      title: typeof v.title === "string" ? v.title : kind[0].toUpperCase() + kind.slice(1),
      data: isObj(v.data) ? v.data : {},
      status: STATES.has(v.status as string) ? v.status : "canon",
      seq: num(v.seq, 0),
      parent: typeof v.parent === "string" ? v.parent : null,
    } as GraphNode;
    if (v.id !== key || !isObj(v.data) || n.x !== v.x || n.y !== v.y || n.w !== v.w || n.h !== v.h || typeof v.title !== "string") mended++;
    nodes[key] = n;
  }
  if (unknown) fixes.push(`${plural(unknown, "card", "cards")} this Doodle could not read ${unknown === 1 ? "was" : "were"} left out`);
  if (mended) fixes.push(`${plural(mended, "card", "cards")} had parts missing and ${mended === 1 ? "was" : "were"} filled in`);

  // a card inside one that is gone, or inside itself: at the top instead
  let orphans = 0;
  for (const n of Object.values(nodes)) {
    if (n.parent && !nodes[n.parent]) {
      n.parent = null;
      orphans++;
    }
  }
  for (const n of Object.values(nodes)) {
    const seen = new Set<string>([n.id]);
    let at = n.parent;
    while (at) {
      if (seen.has(at)) {
        n.parent = null;
        orphans++;
        break;
      }
      seen.add(at);
      at = nodes[at]?.parent ?? null;
    }
  }
  if (orphans) fixes.push(`${plural(orphans, "card", "cards")} inside something that was gone ${orphans === 1 ? "is" : "are"} at the top now`);

  // the order: every card once, nothing that is not there
  const given = Array.isArray(f.order) ? f.order.filter((x): x is string => typeof x === "string") : [];
  const order = [...new Set(given.filter((id) => nodes[id]))];
  for (const id of Object.keys(nodes)) if (!order.includes(id)) order.push(id);
  if (given.length !== order.length || given.some((id, i) => order[i] !== id)) fixes.push("the order of the cards was set right");

  // wires: both ends there
  const edges: Record<string, Edge> = {};
  let loose = 0;
  for (const [key, e] of Object.entries(isObj(f.edges) ? f.edges : {})) {
    const ok = isObj(e) && isObj(e.from) && isObj(e.to) && typeof e.from.node === "string" && typeof e.to.node === "string" && typeof e.from.port === "string" && typeof e.to.port === "string";
    const w = e as unknown as Edge;
    if (ok && nodes[w.from.node] && nodes[w.to.node]) edges[key] = { ...w, id: key };
    else loose++;
  }
  if (loose) fixes.push(`${plural(loose, "wire", "wires")} to nothing ${loose === 1 ? "was" : "were"} taken out`);

  const cam = isObj(f.camera) ? f.camera : {};
  const file: FileGraph = {
    format: "doodle-graph",
    version: FORMAT,
    name: typeof f.name === "string" ? f.name : "Untitled",
    nodes,
    order,
    edges,
    camera: { x: num(cam.x, 0), y: num(cam.y, 0), zoom: num(cam.zoom, 1) || 1 },
    views: isObj(f.views) ? (f.views as FileGraph["views"]) : undefined,
    bible: isObj(f.bible) ? (f.bible as unknown as Bible) : undefined,
    provenance: isObj(f.provenance) ? (f.provenance as FileGraph["provenance"]) : undefined,
    stats: isObj(f.stats) && isObj(f.stats.days) ? { goal: num(f.stats.goal, 0), days: f.stats.days as Stats["days"] } : undefined,
    words: Array.isArray(f.words) ? f.words.filter((w): w is string => typeof w === "string") : undefined,
  };
  return { file, fixes };
}
