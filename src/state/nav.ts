/**
 * Where you are. A node can be entered — it becomes the workspace, and
 * the field shows what it holds. Depth is a stack of ids from the root;
 * every workspace keeps its own view so leaving and returning finds it
 * where it was. Zoom changes size; entering changes what is there.
 */
import { createStore } from "./store";
import { camera, type Camera } from "../canvas/camera";
import { graph, clearSelection, select } from "./graph";

export interface Arrival {
  dir: "in" | "out";
  /** where it came from, in screen px — the card entered, or the field's centre */
  x: number;
  y: number;
  at: number;
}

export interface NavState {
  /** the entered node, or null for the root */
  focus: string | null;
  /** each workspace's last view, by node id ("root" for the top) */
  views: Record<string, Camera>;
  /** the move just made, if it was the pointer's — the keyboard never animates */
  arrival: Arrival | null;
}

export const nav = createStore<NavState>({ focus: null, views: {}, arrival: null });

const arrive = (dir: "in" | "out", from?: { x: number; y: number }) =>
  from ? { dir, x: from.x, y: from.y, at: Date.now() } : null;
export const clearArrival = () => nav.set((n) => (n.arrival ? { ...n, arrival: null } : n));

const key = (id: string | null) => id ?? "root";

function park() {
  const f = nav.get().focus;
  nav.set((n) => ({ ...n, views: { ...n.views, [key(f)]: camera.get() } }));
}

/** the chain from the root down to the focus */
export function trail(): string[] {
  const g = graph.get();
  const out: string[] = [];
  let id = nav.get().focus;
  while (id && g.nodes[id]) {
    out.unshift(id);
    id = g.nodes[id].parent;
  }
  return out;
}

export function enter(id: string, onArrive?: () => void, from?: { x: number; y: number }) {
  if (!graph.get().nodes[id]) return;
  park();
  clearSelection();
  nav.set((n) => ({ ...n, focus: id, arrival: arrive("in", from) }));
  const saved = nav.get().views[key(id)];
  if (saved) camera.set(saved);
  else onArrive?.();
}

/** up one level; the node just left is selected again */
export function rise(onArrive?: () => void, from?: { x: number; y: number }) {
  const f = nav.get().focus;
  if (!f) return;
  const parent = graph.get().nodes[f]?.parent ?? null;
  riseTo(parent, onArrive, from);
  select([f]);
}

export function riseTo(id: string | null, onArrive?: () => void, from?: { x: number; y: number }) {
  park();
  clearSelection();
  nav.set((n) => ({ ...n, focus: id, arrival: arrive("out", from) }));
  const saved = nav.get().views[key(id)];
  if (saved) camera.set(saved);
  else onArrive?.();
}

export function resetNav(views: Record<string, Camera> = {}) {
  nav.set({ focus: null, views, arrival: null });
  if (views.root) camera.set(views.root);
}
