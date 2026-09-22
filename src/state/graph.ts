/**
 * The graph on the field: nodes with a place, a size and their data; the
 * wires between their ports; the selection beside them. Mutations go
 * through the functions here so the command bus (step 4) can take them
 * over without the surface changing.
 */
import { createStore } from "./store";
import type { Rect } from "../canvas/camera";
import { KINDS, type NodeKind, type Port } from "../graph/kinds";
import { commit } from "./history";
import type { Anchor } from "./anchors";

export type Canon = "canon" | "draft" | "exploration" | "rejected";

export interface GraphNode extends Rect {
  id: string;
  kind: NodeKind;
  title: string;
  /** canon is settled; draft is proposed or unreviewed; exploration is a
   *  branch; rejected stays but never counts as context */
  status: Canon;
  data: Record<string, string | number>;
  /** an image the node holds, shown in its well */
  asset?: string;
  /** media attached to the node, by reference */
  attachments?: string[];
  /** what a generator produced, newest last; `asset` is the take among them */
  outputs?: string[];
  /** creation order, for lists that should not follow the stack */
  seq: number;
  /** the node this one lives inside; null at the root */
  parent: string | null;
  /** the passage of its parent's words this one came from, if it did */
  anchor?: Anchor;
  /** the run whose words these are, while they are still its words */
  from?: string;
}

export interface PortRef {
  node: string;
  port: string;
}

export interface Edge {
  id: string;
  from: PortRef; // an output
  to: PortRef; // an input
}

export interface GraphState {
  nodes: Record<string, GraphNode>;
  order: string[];
  edges: Record<string, Edge>;
  selection: string[];
  edgeSelection: string[];
}

let counter = 0;
export const newId = (p = "n") => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;
let seq = 0;
export const nextSeq = () => ++seq;

export function makeNode(kind: NodeKind, x: number, y: number, extra: Partial<GraphNode> = {}): GraphNode {
  const def = KINDS[kind];
  return { id: newId(), kind, title: def.title, x, y, ...def.size, data: { ...def.data }, seq: nextSeq(), parent: null, status: "draft", ...extra };
}

export const graph = createStore<GraphState>({
  nodes: {},
  order: [],
  edges: {},
  selection: [],
  edgeSelection: [],
});

/* ── ports ── */
export const inputs = (n: GraphNode): Port[] => KINDS[n.kind].inputs;
export const outputs = (n: GraphNode): Port[] => KINDS[n.kind].outputs;
export const portOf = (ref: PortRef, dir: "in" | "out"): Port | undefined => {
  const n = graph.get().nodes[ref.node];
  return n ? (dir === "in" ? inputs(n) : outputs(n)).find((p) => p.id === ref.port) : undefined;
};
export const isConnected = (ref: PortRef) =>
  Object.values(graph.get().edges).some(
    (e) => (e.from.node === ref.node && e.from.port === ref.port) || (e.to.node === ref.node && e.to.port === ref.port),
  );

/* ── where ── */
/** the nodes that live in a workspace, in stack order */
export const childrenOf = (g: GraphState, parent: string | null) => g.order.filter((id) => g.nodes[id].parent === parent);
export const childCount = (g: GraphState, id: string) => g.order.filter((n) => g.nodes[n].parent === id).length;
/** a node and everything inside it, however deep */
export function descendants(g: GraphState, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const walk = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    for (const c of g.order) if (g.nodes[c].parent === id) walk(c);
  };
  for (const id of ids) walk(id);
  return out;
}

/* ── selection ── */
export const select = (ids: string[]) => graph.set((g) => ({ ...g, selection: ids, edgeSelection: [] }));
export const selectEdge = (id: string) => graph.set((g) => ({ ...g, selection: [], edgeSelection: [id] }));
export const clearSelection = () =>
  graph.set((g) => (g.selection.length || g.edgeSelection.length ? { ...g, selection: [], edgeSelection: [] } : g));
export const toggleSelect = (id: string) =>
  graph.set((g) => ({
    ...g,
    edgeSelection: [],
    selection: g.selection.includes(id) ? g.selection.filter((s) => s !== id) : [...g.selection, id],
  }));

/* ── nodes ── */
export function moveNodes(ids: string[], dx: number, dy: number) {
  if (!ids.length || (dx === 0 && dy === 0)) return;
  graph.set((g) => {
    const nodes = { ...g.nodes };
    for (const id of ids) {
      const n = nodes[id];
      if (n) nodes[id] = { ...n, x: n.x + dx, y: n.y + dy };
    }
    return { ...g, nodes };
  });
}

/** Bring the given nodes to the top of the stack. */
export function raise(ids: string[]) {
  graph.set((g) => ({ ...g, order: [...g.order.filter((id) => !ids.includes(id)), ...ids] }));
}

/** A field edit — a run of typing into one field is one journal entry. */
export function updateData(id: string, patch: Record<string, string | number>) {
  commit(
    "Edit",
    () =>
      graph.set((g) => {
        const n = g.nodes[id];
        if (!n) return g;
        return { ...g, nodes: { ...g.nodes, [id]: { ...n, data: { ...n.data, ...patch } } } };
      }),
    `data:${id}:${Object.keys(patch).join(",")}`,
  );
}

export function setStatus(ids: string[], status: Canon) {
  commit("Status", () =>
    graph.set((g) => {
      const nodes = { ...g.nodes };
      for (const id of ids) if (nodes[id]) nodes[id] = { ...nodes[id], status };
      return { ...g, nodes };
    }),
  );
}

export function rename(id: string, title: string) {
  commit(
    "Rename",
    () =>
      graph.set((g) => (g.nodes[id] ? { ...g, nodes: { ...g.nodes, [id]: { ...g.nodes[id], title } } } : g)),
    `title:${id}`,
  );
}

export function addNode(node: GraphNode) {
  commit("Add node", () =>
    graph.set((g) => ({ ...g, nodes: { ...g.nodes, [node.id]: node }, order: [...g.order, node.id], selection: [node.id], edgeSelection: [] })),
  );
}

/** Copies of the selected nodes, a step down and right, wired among themselves. */
export function duplicateSelected() {
  const g = graph.get();
  if (!g.selection.length) return;
  const map = new Map<string, string>();
  const copies = g.selection.map((id) => {
    const n = g.nodes[id];
    const c = { ...n, id: newId(), x: n.x + 24, y: n.y + 24, data: { ...n.data }, seq: nextSeq() };
    map.set(id, c.id);
    return c;
  });
  const edges = Object.values(g.edges)
    .filter((e) => map.has(e.from.node) && map.has(e.to.node))
    .map((e) => ({ id: newId("e"), from: { node: map.get(e.from.node)!, port: e.from.port }, to: { node: map.get(e.to.node)!, port: e.to.port } }));
  commit("Duplicate", () =>
    graph.set((x) => ({
      ...x,
      nodes: { ...x.nodes, ...Object.fromEntries(copies.map((c) => [c.id, c])) },
      order: [...x.order, ...copies.map((c) => c.id)],
      edges: { ...x.edges, ...Object.fromEntries(edges.map((e) => [e.id, e])) },
      selection: copies.map((c) => c.id),
      edgeSelection: [],
    })),
  );
}

/** Move nodes inside another, laid out in a row at its head. */
export function moveInto(ids: string[], parent: string) {
  const g = graph.get();
  const inside = descendants(g, ids);
  if (inside.has(parent)) return; // a node cannot hold itself
  const already = childrenOf(g, parent).length;
  commit("Move into", () =>
    graph.set((x) => {
      const nodes = { ...x.nodes };
      ids.forEach((id, i) => {
        if (nodes[id]) nodes[id] = { ...nodes[id], parent, x: 60 + (already + i) * 260, y: 60 };
      });
      return { ...x, nodes, selection: [] };
    }),
  );
}

/** Put a node under a parent at a place among its siblings — before
 *  `before`, or last. Order is `seq`; the siblings are renumbered so the
 *  order reads the same everywhere (the outliner, the turn, a reading).
 *  Changing parent also gives it a spot on that field. */
export function reorder(id: string, parent: string | null, before: string | null) {
  const g = graph.get();
  const n = g.nodes[id];
  if (!n || id === parent) return;
  if (parent && descendants(g, [id]).has(parent)) return; // a node cannot hold itself
  commit("Reorder", () =>
    graph.set((x) => {
      const nodes = { ...x.nodes };
      const moved = nodes[id];
      const siblings = x.order
        .map((i) => nodes[i])
        .filter((s) => s.parent === parent && s.id !== id)
        .sort((a, b) => a.seq - b.seq);
      const at = before ? Math.max(0, siblings.findIndex((s) => s.id === before)) : siblings.length;
      const placed = moved.parent === parent ? moved : place(moved, parent, nodes);
      siblings.splice(at, 0, placed);
      // renumber from the smallest seq among them so nothing else shifts
      const base = Math.min(...siblings.map((s) => s.seq), placed.seq);
      siblings.forEach((s, i) => (nodes[s.id] = { ...s, seq: base + i }));
      return { ...x, nodes };
    }),
  );
}

/** a spot on a field for a node arriving from elsewhere: to the right of the last one there */
function place(n: GraphNode, parent: string | null, nodes: Record<string, GraphNode>): GraphNode {
  const there = Object.values(nodes).filter((s) => s.parent === parent && s.id !== n.id);
  const last = there.reduce<GraphNode | undefined>((m, s) => (!m || s.x + s.w > m.x + m.w ? s : m), undefined);
  return { ...n, parent, x: last ? last.x + last.w + 40 : 60, y: last ? last.y : 60 };
}

/** Make one of a generator's outputs its take; it flows to what its image feeds. */
export function takeOutput(id: string, ref: string) {
  commit("Take", () =>
    graph.set((g) => {
      const n = g.nodes[id];
      if (!n) return g;
      const targets = Object.values(g.edges).filter((e) => e.from.node === id && e.from.port === "image").map((e) => e.to.node);
      const nodes = { ...g.nodes, [id]: { ...n, asset: ref } };
      for (const t of targets) if (nodes[t]) nodes[t] = { ...nodes[t], asset: ref };
      return { ...g, nodes };
    }),
  );
}

/** what a page holds before it turns, in words — about a printed page */
export const PAGE_WORDS = 350;
const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Cut a text into pages: whole paragraphs while they fit, a long paragraph
 *  at a sentence's end, never mid-sentence unless one sentence is a page. */
export function paginate(text: string, cap = PAGE_WORDS): string[] {
  const paras = text.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  let cur: string[] = [];
  let n = 0;
  const flush = () => {
    if (cur.length) pages.push(cur.join("\n\n"));
    cur = [];
    n = 0;
  };
  for (const p of paras) {
    const w = countWords(p);
    if (n + w <= cap) {
      cur.push(p);
      n += w;
      continue;
    }
    // too long for what is left: close this page unless it is empty, then
    // lay the paragraph sentence by sentence
    if (cur.length) flush();
    if (w <= cap) {
      cur.push(p);
      n = w;
      continue;
    }
    const sentences = p.match(/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g) ?? [p];
    let piece: string[] = [];
    let m = 0;
    for (const s of sentences) {
      const sw = countWords(s);
      if (m + sw > cap && piece.length) {
        pages.push(piece.join("").trim());
        piece = [];
        m = 0;
      }
      piece.push(s);
      m += sw;
    }
    if (piece.length) {
      cur = [piece.join("").trim()];
      n = m;
    }
  }
  flush();
  return pages.length ? pages : [""];
}

/** Lay a text onto a page and, past what it holds, onto the pages after it —
 *  the empty ones already there, then new ones made to the right. A page
 *  with words of its own is never written over. Inside a commit. */
export function layOnPages(pageId: string, text: string, from?: string) {
  const g = graph.get();
  const first = g.nodes[pageId];
  if (!first || first.kind !== "page") return;
  const parts = paginate(text);
  // the run of pages after this one, in order, while they are empty
  const siblings = g.order
    .map((id) => g.nodes[id])
    .filter((n) => n.parent === first.parent && n.kind === "page")
    .sort((a, b) => a.seq - b.seq);
  const at = siblings.findIndex((n) => n.id === pageId);
  const after = at >= 0 ? siblings.slice(at + 1) : [];
  const targets: string[] = [pageId];
  for (const n of after) {
    if (targets.length >= parts.length) break;
    if (String(n.data.text ?? "").trim()) break;
    targets.push(n.id);
  }
  // more to lay than pages to take it: new pages to the right of the last
  let last = g.nodes[targets[targets.length - 1]];
  const count = siblings.length;
  const made: GraphNode[] = [];
  while (targets.length < parts.length) {
    const page = makeNode("page", last.x + last.w + 40, last.y, { parent: first.parent, title: `Page ${count + made.length + 1}`, status: first.status });
    made.push(page);
    targets.push(page.id);
    last = page;
  }
  graph.set((x) => {
    const nodes = { ...x.nodes };
    for (const p of made) nodes[p.id] = p;
    targets.forEach((id, i) => {
      nodes[id] = { ...nodes[id], data: { ...nodes[id].data, text: parts[i] ?? "" }, from };
    });
    return { ...x, nodes, order: [...x.order, ...made.map((p) => p.id)] };
  });
}

/** A card's height is whatever its content needs. The engine measures the
 *  card the browser laid out and keeps it on the node, so bounds, fits,
 *  marquees and drops all agree with what is on screen. It is a fact
 *  about the layout, not an edit: no journal entry, and the document is
 *  not dirtied by it. */
export function measure(id: string, h: number) {
  const n = graph.get().nodes[id];
  if (!n || Math.abs(n.h - h) < 0.5) return;
  graph.set((g) => (g.nodes[id] ? { ...g, nodes: { ...g.nodes, [id]: { ...g.nodes[id], h } } } : g));
}

/** How wide a card is, set by hand. A document fact, so it is journalled
 *  — one entry for a drag, coalesced by the card it is about. */
export function setWidth(id: string, w: number) {
  const next = Math.round(Math.max(200, Math.min(760, w)));
  commit(
    "Width",
    () => graph.set((g) => (g.nodes[id] && g.nodes[id].w !== next ? { ...g, nodes: { ...g.nodes, [id]: { ...g.nodes[id], w: next } } } : g)),
    `w:${id}`,
  );
}

export const selectAll = () => graph.set((g) => ({ ...g, selection: [...g.order], edgeSelection: [] }));

/** Remove whatever is selected — nodes take their wires with them. */
export function deleteSelected() {
  commit("Delete", () => deleteSelectedNow());
}
function deleteSelectedNow() {
  graph.set((g) => {
    if (!g.selection.length && !g.edgeSelection.length) return g;
    const gone = descendants(g, g.selection);
    const nodes = { ...g.nodes };
    for (const id of gone) delete nodes[id];
    const edges: Record<string, Edge> = {};
    for (const e of Object.values(g.edges)) {
      if (gone.has(e.from.node) || gone.has(e.to.node) || g.edgeSelection.includes(e.id)) continue;
      edges[e.id] = e;
    }
    return { nodes, order: g.order.filter((id) => !gone.has(id)), edges, selection: [], edgeSelection: [] };
  });
}

/* ── edges ── */
/** Can this output feed this input? Same type, different node. */
export function canConnect(from: PortRef, to: PortRef) {
  if (from.node === to.node) return false;
  const a = portOf(from, "out");
  const b = portOf(to, "in");
  return !!a && !!b && a.type === b.type;
}

/** Connect; an input holds one wire, so whatever fed it before lets go. */
export function connect(from: PortRef, to: PortRef) {
  commit("Connect", () => connectNow(from, to));
}
/** the unjournaled form, for a drag that begins and ends elsewhere */
export function connectNow(from: PortRef, to: PortRef) {
  if (!canConnect(from, to)) return;
  graph.set((g) => {
    const edges: Record<string, Edge> = {};
    for (const e of Object.values(g.edges)) {
      if (e.to.node === to.node && e.to.port === to.port) continue;
      edges[e.id] = e;
    }
    const id = newId("e");
    edges[id] = { id, from, to };
    return { ...g, edges };
  });
}

export function disconnect(id: string) {
  commit("Disconnect", () => disconnectNow(id));
}
export function disconnectNow(id: string) {
  graph.set((g) => {
    if (!g.edges[id]) return g;
    const edges = { ...g.edges };
    delete edges[id];
    return { ...g, edges, edgeSelection: g.edgeSelection.filter((e) => e !== id) };
  });
}

export const edgeInto = (to: PortRef): Edge | undefined =>
  Object.values(graph.get().edges).find((e) => e.to.node === to.node && e.to.port === to.port);

/* ── geometry ── */
export function bounds(nodes: Rect[]): Rect | null {
  if (!nodes.length) return null;
  const x0 = Math.min(...nodes.map((n) => n.x));
  const y0 = Math.min(...nodes.map((n) => n.y));
  const x1 = Math.max(...nodes.map((n) => n.x + n.w));
  const y1 = Math.max(...nodes.map((n) => n.y + n.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
