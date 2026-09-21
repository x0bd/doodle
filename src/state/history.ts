/**
 * The journal. Every change to the graph is one entry — what it was, what
 * it became — so undo is a restore and redo is a restore the other way.
 * The graph is small enough that a snapshot IS the command; when it is
 * not, the entries grow inverses and nothing above this file changes.
 *
 * A drag is one entry (begin at pointer-down, end at pointer-up); a run of
 * typing into one field is one entry (entries with the same coalesce key
 * within a second merge).
 */
import { createStore } from "./store";
import { graph, type GraphState } from "./graph";

export type Snapshot = Pick<GraphState, "nodes" | "order" | "edges">;

interface Entry {
  label: string;
  before: Snapshot;
  after: Snapshot;
  key?: string;
  at: number;
}

export const history = createStore<{ undo: Entry[]; redo: Entry[]; seq: number }>({ undo: [], redo: [], seq: 0 });

export const snapshot = (): Snapshot => {
  const { nodes, order, edges } = graph.get();
  return { nodes, order, edges };
};

const same = (a: Snapshot, b: Snapshot) => a.nodes === b.nodes && a.order === b.order && a.edges === b.edges;

function restore(s: Snapshot) {
  graph.set((g) => ({
    ...g,
    ...s,
    selection: g.selection.filter((id) => s.nodes[id]),
    edgeSelection: g.edgeSelection.filter((id) => s.edges[id]),
  }));
}

function push(entry: Entry) {
  history.set((h) => {
    const last = h.undo[h.undo.length - 1];
    if (entry.key && last?.key === entry.key && entry.at - last.at < 1000) {
      // the same field, still being typed into: extend the last entry
      const merged = { ...last, after: entry.after, at: entry.at };
      return { undo: [...h.undo.slice(0, -1), merged], redo: [], seq: h.seq + 1 };
    }
    return { undo: [...h.undo, entry].slice(-200), redo: [], seq: h.seq + 1 };
  });
}

/** Run a change as one entry. */
export function commit(label: string, mutate: () => void, key?: string) {
  const before = snapshot();
  mutate();
  const after = snapshot();
  if (same(before, after)) return;
  push({ label, before, after, key, at: Date.now() });
}

/** A change that happens over time — a drag. Begin, mutate freely, end. */
export function begin() {
  return snapshot();
}
export function end(before: Snapshot, label: string) {
  const after = snapshot();
  if (same(before, after)) return;
  push({ label, before, after, at: Date.now() });
}

export function undo() {
  const h = history.get();
  const e = h.undo[h.undo.length - 1];
  if (!e) return;
  restore(e.before);
  history.set({ undo: h.undo.slice(0, -1), redo: [...h.redo, e], seq: h.seq + 1 });
}

export function redo() {
  const h = history.get();
  const e = h.redo[h.redo.length - 1];
  if (!e) return;
  restore(e.after);
  history.set({ undo: [...h.undo, e], redo: h.redo.slice(0, -1), seq: h.seq + 1 });
}

/** Forget everything — a new document. */
export function reset() {
  history.set({ undo: [], redo: [], seq: 0 });
}
