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

export interface GraphNode extends Rect {
  id: string;
  kind: NodeKind;
  title: string;
  data: Record<string, string | number>;
  /** an image the node holds, shown in its well */
  asset?: string;
  /** creation order, for lists that should not follow the stack */
  seq: number;
  /** the node this one lives inside; null at the root */
  parent: string | null;
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
  return { id: newId(), kind, title: def.title, x, y, ...def.size, data: { ...def.data }, seq: nextSeq(), parent: null, ...extra };
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
