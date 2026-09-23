/**
 * Versions (PLAN.md M1.5): a page, a note, a chapter with everything it
 * holds, as it was — kept inside the project (`versions.rs`), listed,
 * compared with now, restored.
 *
 *  - **Daily**: the first save of a day that changes something keeps it as
 *    it was *before* — as the last save left it — so yesterday's chapter
 *    is always there to go back to. One a day per node; a chapter is kept
 *    whenever anything inside it changed.
 *  - **Kept**: a version taken on purpose (File › Keep a Version).
 *  - **Before restore**: restoring first keeps what is there now, so a
 *    restore is never the only copy of anything.
 *
 * A restore is one journal entry, so ⌘Z takes it back as well.
 */
import { createStore } from "./store";
import { graph, type Edge, type GraphNode, type GraphState } from "./graph";
import { nav } from "./nav";
import { commit } from "./history";
import type { NodeKind } from "../graph/kinds";
import { asMarkdown } from "./reading";
import { countWords, formOf } from "../writer/markup";
import { inTauri, versionIndex, versionRead, versionSave } from "../platform/fs";

/** the kinds that hold what a person wrote */
export const VERSIONED = new Set<NodeKind>(["page", "chapter", "note", "prompt", "character", "location", "style", "shot"]);

export type Reason = "daily" | "kept" | "before-restore";

export interface VersionMeta {
  id: string;
  node: string;
  kind: NodeKind;
  title: string;
  at: number;
  reason: Reason;
  words: number;
}

/** a node and everything inside it — what a version holds */
export interface Sub {
  nodes: Record<string, GraphNode>;
  order: string[];
  edges: Record<string, Edge>;
}

/* ── the pure part ── */

/** `id` and everything inside it, with the wires that run between them */
export function subtree(g: Sub, id: string): Sub {
  const kids = new Map<string, string[]>();
  for (const n of g.order) {
    const p = g.nodes[n]?.parent;
    if (p) kids.set(p, [...(kids.get(p) ?? []), n]);
  }
  const ids = new Set<string>();
  const walk = (n: string) => {
    if (ids.has(n) || !g.nodes[n]) return;
    ids.add(n);
    for (const c of kids.get(n) ?? []) walk(c);
  };
  walk(id);
  return {
    nodes: Object.fromEntries([...ids].map((n) => [n, g.nodes[n]])),
    order: g.order.filter((n) => ids.has(n)),
    edges: Object.fromEntries(Object.entries(g.edges).filter(([, e]) => ids.has(e.from.node) && ids.has(e.to.node))),
  };
}

/** what a version reads as — for the comparison and the count: a chapter
 *  in reading order, a page its words, a character its fields */
export function wordsOf(sub: Sub, id: string): string {
  const n = sub.nodes[id];
  if (!n) return "";
  if (n.kind === "chapter") return asMarkdown({ ...sub, selection: [], edgeSelection: [] } as GraphState, id, n.title);
  if (typeof n.data.text === "string") return n.data.text;
  return Object.entries(n.data)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`)
    .join("\n\n");
}

export const wordCount = (sub: Sub, id: string) => {
  const n = sub.nodes[id];
  return n ? countWords(wordsOf(sub, id), n.kind === "chapter" ? "prose" : formOf(n.data)) : 0;
};

/** what a person made of a node — not where it sits or how tall it drew */
const content = (n: GraphNode | undefined) =>
  n ? JSON.stringify([n.title, n.data, n.status, n.parent, n.asset ?? null, n.attachments ?? null, n.outputs ?? null, n.anchor ?? null]) : "";

/** The versioned nodes that were there before and changed — themselves or
 *  anything inside them (a node gone from inside a chapter changes it). */
export function touched(before: Sub, after: Sub): Set<string> {
  const changed = new Set<string>();
  for (const id of new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)])) {
    const a = before.nodes[id];
    const b = after.nodes[id];
    if (a !== b && content(a) !== content(b)) changed.add(id);
  }
  const out = new Set<string>();
  for (const id of changed) {
    // it, and every place it was or is inside
    for (const g of [before, after]) {
      let at: string | null | undefined = id;
      const seen = new Set<string>();
      while (at && !seen.has(at)) {
        seen.add(at);
        const n: GraphNode | undefined = g.nodes[at];
        if (n && before.nodes[at] && VERSIONED.has(n.kind)) out.add(at);
        at = n?.parent;
      }
    }
  }
  return out;
}

const day = (t: number) => new Date(t).toDateString();

/** of those, the ones with no daily version yet today */
export function due(changed: Iterable<string>, list: VersionMeta[], now = Date.now()): string[] {
  const today = new Set(list.filter((v) => v.reason === "daily" && day(v.at) === day(now)).map((v) => v.node));
  return [...changed].filter((id) => !today.has(id));
}

/** The graph with `root` as the version has it: what the version holds put
 *  back, what has been added inside since taken out (it is in the version
 *  kept before the restore). The node stays where it now sits. */
export function restoreInto(g: Sub, body: Sub, root: string): Sub {
  const now = subtree(g, root);
  const nodes = { ...g.nodes };
  for (const id of Object.keys(now.nodes)) if (!body.nodes[id]) delete nodes[id];
  for (const [id, n] of Object.entries(body.nodes)) nodes[id] = n;
  const here = g.nodes[root];
  const was = body.nodes[root];
  if (here && was) nodes[root] = { ...was, parent: here.parent, x: here.x, y: here.y };
  else if (was && was.parent && !nodes[was.parent]) nodes[root] = { ...was, parent: null };
  const order = [...g.order.filter((id) => nodes[id]), ...body.order.filter((id) => !g.order.includes(id))];
  const edges = Object.fromEntries(
    [...Object.entries(g.edges), ...Object.entries(body.edges)].filter(([, e]) => nodes[e.from.node] && nodes[e.to.node]),
  );
  return { nodes, order, edges };
}

/* ── kept on the disk ── */

export const versions = createStore<{ dir: string | null; list: VersionMeta[] }>({ dir: null, list: [] });

/** the project's list, read as it opens (or emptied: a graph with no home keeps none) */
export async function loadVersions(dir: string | null) {
  versions.set({ dir, list: [] });
  if (!dir || !inTauri) return;
  const raw = await versionIndex(dir).catch(() => "");
  const list: VersionMeta[] = [];
  for (const line of raw.split("\n")) {
    try {
      if (line.trim()) list.push(JSON.parse(line) as VersionMeta);
    } catch {
      /* a line cut short */
    }
  }
  // kept meanwhile (a daily version, taken while this was reading) stays
  if (versions.get().dir === dir) versions.set((v) => ({ dir, list: [...list, ...v.list.filter((x) => !list.some((y) => y.id === x.id))] }));
}

let n = 0;
async function keep(dir: string, from: Sub, id: string, reason: Reason): Promise<VersionMeta | null> {
  const node = from.nodes[id];
  if (!node) return null;
  const sub = subtree(from, id);
  const at = Date.now();
  const meta: VersionMeta = { id: `v${at.toString(36)}${(n++).toString(36)}`, node: id, kind: node.kind, title: node.title, at, reason, words: wordCount(sub, id) };
  await versionSave(dir, meta.id, JSON.stringify(meta), JSON.stringify({ meta, ...sub }));
  if (versions.get().dir === dir) versions.set((v) => ({ ...v, list: [...v.list, meta] }));
  return meta;
}

/** After a save: what this save changed, as the save before it had it —
 *  once a day for each. Never delays or fails the save; one after another,
 *  so two saves close together do not both take the day's version. */
let daily: Promise<unknown> = Promise.resolve();
export function keepDaily(dir: string, before: Sub, after: Sub) {
  if (!inTauri) return daily;
  return (daily = daily.then(async () => {
    for (const id of due(touched(before, after), versions.get().list)) await keep(dir, before, id, "daily").catch(() => null);
  }));
}

/** A version of this node, now, on purpose. */
export async function keepVersion(id: string, reason: Reason = "kept") {
  const dir = versions.get().dir;
  if (!dir) return null;
  return keep(dir, graph.get(), id, reason);
}

export async function readVersion(meta: VersionMeta): Promise<Sub> {
  const dir = versions.get().dir;
  if (!dir) throw new Error("Versions are kept inside a project.");
  return JSON.parse(await versionRead(dir, meta.id)) as Sub;
}

/** Put a version back — what is there now kept first. */
export async function restoreVersion(meta: VersionMeta) {
  const body = await readVersion(meta);
  if (graph.get().nodes[meta.node]) await keepVersion(meta.node, "before-restore");
  commit("Restore version", () =>
    graph.set((g) => {
      const next = restoreInto(g, body, meta.node);
      return { ...g, ...next, selection: [meta.node], edgeSelection: [] };
    }),
  );
}

/** what File › Versions is about: the one thing chosen, else the page or
 *  chapter you are in */
export function versionTarget(): string | null {
  const g = graph.get();
  const one = g.selection.length === 1 ? g.nodes[g.selection[0]] : undefined;
  if (one && VERSIONED.has(one.kind)) return one.id;
  // the card whose words are being written in
  const typing = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-node]")?.dataset.node : undefined;
  if (typing && g.nodes[typing] && VERSIONED.has(g.nodes[typing].kind)) return typing;
  const f = nav.get().focus ? g.nodes[nav.get().focus!] : undefined;
  return f && VERSIONED.has(f.kind) ? f.id : null;
}

/** File › Keep a Version: of what is chosen or open, and said so */
export async function keepVersionHere() {
  const id = versionTarget();
  const { say } = await import("./notice");
  if (!id) return say("Choose a page, a chapter, a note or a character to keep a version of it.");
  if (!versions.get().dir) return say("Versions are kept inside a project — save it first.");
  const m = await keepVersion(id).catch(() => null);
  say(m ? `Kept a version of “${m.title}” — File › Versions… to see them.` : "That version could not be kept.");
}

/** the Versions sheet, open on a node */
export const browsing = createStore<string | null>(null);
export const openVersions = (id = versionTarget()) => browsing.set(id ?? "");
export const closeVersions = () => browsing.set(null);
