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

/** the format this Doodle writes */
export const FORMAT = 1;

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

/** Each step takes a file of version n to version n + 1. */
type Raw = Record<string, unknown>;
const MIGRATIONS: Record<number, (f: Raw) => Raw> = {
  // before the version was written down: the same shape as 1
  0: (f) => ({ ...f, version: 1 }),
};

export function migrate(f: Raw): Raw {
  let v = typeof f.version === "number" ? f.version : 0;
  if (v > FORMAT) throw new Unreadable("was made by a newer version of Doodle", true);
  while (v < FORMAT) {
    const step = MIGRATIONS[v];
    if (!step) throw new Unreadable(`is in a format this Doodle cannot read (${v})`);
    f = step(f);
    v++;
  }
  return f;
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
  const f = migrate(raw);
  if (!isObj(f.nodes)) throw new Unreadable("has lost its cards");

  const fixes: string[] = [];
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
  };
  return { file, fixes };
}
