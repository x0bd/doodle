/**
 * Where you are. A node can be entered — it becomes the workspace, and
 * the field shows what it holds. Depth is a stack of ids from the root;
 * every workspace keeps its own view so leaving and returning finds it
 * where it was. Zoom changes size; entering changes what is there.
 */
import { createStore } from "./store";
import { camera, type Camera } from "../canvas/camera";
import { graph, clearSelection, select } from "./graph";

export interface NavState {
  /** the entered node, or null for the root */
  focus: string | null;
  /** each workspace's last view, by node id ("root" for the top) */
  views: Record<string, Camera>;
}

export const nav = createStore<NavState>({ focus: null, views: {} });

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

export function enter(id: string, onArrive?: () => void) {
  if (!graph.get().nodes[id]) return;
  park();
  clearSelection();
  nav.set((n) => ({ ...n, focus: id }));
  const saved = nav.get().views[key(id)];
  if (saved) camera.set(saved);
  else onArrive?.();
}

/** up one level; the node just left is selected again */
export function rise(onArrive?: () => void) {
  const f = nav.get().focus;
  if (!f) return;
  const parent = graph.get().nodes[f]?.parent ?? null;
  riseTo(parent, onArrive);
  select([f]);
}

export function riseTo(id: string | null, onArrive?: () => void) {
  park();
  clearSelection();
  nav.set((n) => ({ ...n, focus: id }));
  const saved = nav.get().views[key(id)];
  if (saved) camera.set(saved);
  else onArrive?.();
}

export function resetNav(views: Record<string, Camera> = {}) {
  nav.set({ focus: null, views });
  if (views.root) camera.set(views.root);
}
