/**
 * The recovery log, as data (PLAN.md M1.4). Between saves, what changed is
 * written down line by line — `delta()` — and on the next open what the
 * lines say is laid back over the file — `replay()`. `doc.ts` decides when;
 * Rust appends and fsyncs (`recovery.rs`).
 *
 * A line holds whole values, never edits: a node as it now is (or `null`,
 * gone), the order, the edges, the bible, the name, the provenance — each
 * only when it changed. So replaying a line twice, or a line the file
 * already has, changes nothing, and a line cut short by a crash is skipped
 * without harming the ones before it. The stores are immutable, so "what
 * changed" is which objects are new.
 */
import type { GraphState } from "./graph";
import type { Prov } from "./prov";

export interface Bible {
  tone: string;
  rules: string;
  avoid: string;
}

/** everything a save writes that a person changed */
export interface Tracked {
  nodes: GraphState["nodes"];
  order: GraphState["order"];
  edges: GraphState["edges"];
  bible: Bible;
  name: string;
  provenance: Record<string, Prov>;
}

export interface Line {
  /** when it was written */
  t: number;
  /** the whole state — first line of a graph that has no file to replay onto */
  base?: Tracked;
  nodes?: Record<string, GraphState["nodes"][string] | null>;
  order?: GraphState["order"];
  edges?: GraphState["edges"];
  bible?: Bible;
  name?: string;
  provenance?: Record<string, Prov>;
}

/** what is different from `prev` to `next`, or nothing */
export function delta(prev: Tracked, next: Tracked, t = Date.now()): Line | null {
  const line: Line = { t };
  let any = false;
  if (prev.nodes !== next.nodes) {
    const nodes: NonNullable<Line["nodes"]> = {};
    for (const [id, n] of Object.entries(next.nodes)) if (prev.nodes[id] !== n) nodes[id] = n;
    for (const id of Object.keys(prev.nodes)) if (!(id in next.nodes)) nodes[id] = null;
    if (Object.keys(nodes).length) {
      line.nodes = nodes;
      any = true;
    }
  }
  if (prev.order !== next.order) (line.order = next.order), (any = true);
  if (prev.edges !== next.edges) (line.edges = next.edges), (any = true);
  if (prev.bible !== next.bible) (line.bible = next.bible), (any = true);
  if (prev.name !== next.name) (line.name = next.name), (any = true);
  if (prev.provenance !== next.provenance) (line.provenance = next.provenance), (any = true);
  return any ? line : null;
}

/** one line laid over a state */
export function apply(s: Tracked, l: Line): Tracked {
  if (l.base) return l.base;
  let nodes = s.nodes;
  if (l.nodes) {
    nodes = { ...nodes };
    for (const [id, n] of Object.entries(l.nodes)) {
      if (n) nodes[id] = n;
      else delete nodes[id];
    }
  }
  return {
    nodes,
    order: l.order ?? s.order,
    edges: l.edges ?? s.edges,
    bible: l.bible ?? s.bible,
    name: l.name ?? s.name,
    provenance: l.provenance ?? s.provenance,
  };
}

export interface Replayed {
  state: Tracked;
  /** the lines laid over it */
  changes: number;
  /** when the last of them was written */
  at: number;
}

/**
 * The log laid over `onto` (the file as saved; `null` for a graph that was
 * never saved, whose log begins with its base). Nothing, if the log says
 * nothing that is not already there. An order that names a node the lines
 * never gave is trimmed rather than trusted.
 */
export function replay(onto: Tracked | null, text: string): Replayed | null {
  let s = onto;
  let first: Tracked | null = onto;
  let changes = 0;
  let at = 0;
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    let l: Line;
    try {
      l = JSON.parse(raw) as Line;
    } catch {
      continue; // the line the crash cut short
    }
    if (!s && !l.base) continue; // nothing to lay it on
    const next = apply(s!, l);
    first ??= next;
    if (!l.base) changes++;
    s = next;
    at = l.t ?? at;
  }
  if (!s || !changes) return null;
  if (!differs(onto ?? (first as Tracked), s)) return null;
  const order = s.order.filter((id) => s!.nodes[id]);
  const edges = Object.fromEntries(Object.entries(s.edges).filter(([, e]) => s!.nodes[e.from.node] && s!.nodes[e.to.node]));
  return { state: { ...s, order, edges }, changes, at };
}

/** whether two states say different things — once, on open. A card's
 *  height is the browser's measurement of what it holds, not something a
 *  person did: it is measured again on the next render, and a log that
 *  holds nothing else holds nothing to recover. */
function differs(a: Tracked, b: Tracked): boolean {
  const same = (x: unknown, y: unknown) => x === y || JSON.stringify(x, unmeasured) === JSON.stringify(y, unmeasured);
  if (!same(a.order, b.order) || !same(a.edges, b.edges) || !same(a.bible, b.bible) || a.name !== b.name || !same(a.provenance, b.provenance)) return true;
  const ids = new Set([...Object.keys(a.nodes), ...Object.keys(b.nodes)]);
  for (const id of ids) if (!same(a.nodes[id], b.nodes[id])) return true;
  return false;
}

function unmeasured(this: unknown, key: string, value: unknown) {
  return key === "h" && this && typeof this === "object" && "kind" in this ? undefined : value;
}
