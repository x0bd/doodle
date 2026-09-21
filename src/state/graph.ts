/**
 * The graph on the field. Nodes with a place and a size; the selection
 * beside it. Mutations go through the functions here so the command bus
 * (step 4) can take them over without the surface changing.
 */
import { createStore } from "./store";
import type { Rect } from "../canvas/camera";
import { FIXTURES } from "../providers/fixtures";

export type NodeKind = "note";

export interface GraphNode extends Rect {
  id: string;
  kind: NodeKind;
  title: string;
  /** an image the node holds, shown in its well */
  asset?: string;
}

export interface GraphState {
  nodes: Record<string, GraphNode>;
  order: string[];
  selection: string[];
}

const seed: GraphNode[] = [
  { id: "n1", kind: "note", title: "Model", x: 80, y: 120, w: 220, h: 120 },
  { id: "n2", kind: "note", title: "Prompt", x: 400, y: 40, w: 220, h: 150 },
  { id: "n3", kind: "note", title: "Negative", x: 400, y: 260, w: 220, h: 120 },
  { id: "n4", kind: "note", title: "Image Generator", x: 720, y: 140, w: 240, h: 260 },
  { id: "n5", kind: "note", title: "Preview", x: 1060, y: 100, w: 260, h: 300, asset: FIXTURES.blackBear },
];

export const graph = createStore<GraphState>({
  nodes: Object.fromEntries(seed.map((n) => [n.id, n])),
  order: seed.map((n) => n.id),
  selection: [],
});

export const select = (ids: string[]) => graph.set((g) => ({ ...g, selection: ids }));
export const clearSelection = () => graph.set((g) => (g.selection.length ? { ...g, selection: [] } : g));
export const toggleSelect = (id: string) =>
  graph.set((g) => ({
    ...g,
    selection: g.selection.includes(id) ? g.selection.filter((s) => s !== id) : [...g.selection, id],
  }));

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

export function bounds(nodes: GraphNode[]): Rect | null {
  if (!nodes.length) return null;
  const x0 = Math.min(...nodes.map((n) => n.x));
  const y0 = Math.min(...nodes.map((n) => n.y));
  const x1 = Math.max(...nodes.map((n) => n.x + n.w));
  const y1 = Math.max(...nodes.map((n) => n.y + n.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
