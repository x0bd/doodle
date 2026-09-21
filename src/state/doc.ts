/**
 * The document: which folder the graph lives in, whether it has changed
 * since it was written, and how the last write went. Saving is never
 * promised until Rust confirms it.
 */
import { createStore } from "./store";
import { graph, type GraphState } from "./graph";
import { camera, type Camera } from "../canvas/camera";
import { history, reset as resetHistory } from "./history";
import { inTauri, loadGraph, pickOpenDir, pickSaveDir, saveGraph, graphExists } from "../platform/fs";
import { templateById, type TemplateId } from "../graph/templates";

export type SaveState = "idle" | "saving" | "saved" | "failed";

export interface DocState {
  path: string | null;
  name: string;
  dirty: boolean;
  save: SaveState;
  error?: string;
}

const LAST = "doodle.lastPath";

export const doc = createStore<DocState>({ path: null, name: "Untitled", dirty: false, save: "idle" });

interface FileGraph {
  format: "doodle-graph";
  version: 1;
  name: string;
  nodes: GraphState["nodes"];
  order: GraphState["order"];
  edges: GraphState["edges"];
  camera: Camera;
}

function serialize(): string {
  const g = graph.get();
  const file: FileGraph = {
    format: "doodle-graph",
    version: 1,
    name: doc.get().name,
    nodes: g.nodes,
    order: g.order,
    edges: g.edges,
    camera: camera.get(),
  };
  return JSON.stringify(file, null, 2);
}

const nameOf = (path: string) => path.split("/").pop()!.replace(/\.doodle$/, "");

/* ── writing ── */
let timer: number | undefined;

async function write(path: string) {
  doc.set((d) => ({ ...d, save: "saving" }));
  try {
    await saveGraph(path, serialize());
    doc.set((d) => ({ ...d, dirty: false, save: "saved", error: undefined }));
  } catch (e) {
    doc.set((d) => ({ ...d, save: "failed", error: String(e) }));
  }
}

/** Save now — asking where, if the graph has never been saved. */
export async function save(): Promise<boolean> {
  if (!inTauri) return false;
  const d = doc.get();
  const path = d.path ?? (await pickSaveDir(d.name));
  if (!path) return false;
  doc.set((x) => ({ ...x, path, name: nameOf(path) }));
  try {
    localStorage.setItem(LAST, path);
  } catch {
    /* fine */
  }
  await write(path);
  return doc.get().save === "saved";
}

export async function saveAs() {
  if (!inTauri) return;
  const path = await pickSaveDir(doc.get().name);
  if (!path) return;
  doc.set((d) => ({ ...d, path, name: nameOf(path) }));
  try {
    localStorage.setItem(LAST, path);
  } catch {
    /* fine */
  }
  await write(path);
}

/** Every change marks the document dirty; with a home, it is written soon after. */
history.subscribe(() => {
  doc.set((d) => (d.dirty ? d : { ...d, dirty: true }));
  const path = doc.get().path;
  if (!path) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => write(path), 600);
});

/* ── reading ── */
function load(file: FileGraph, path: string | null) {
  const nodes = { ...file.nodes };
  file.order.forEach((id, i) => {
    if (nodes[id] && nodes[id].seq == null) nodes[id] = { ...nodes[id], seq: i + 1 };
  });
  graph.set({ nodes, order: file.order, edges: file.edges, selection: [], edgeSelection: [] });
  if (file.camera) camera.set(file.camera);
  resetHistory();
  doc.set({ path, name: file.name ?? (path ? nameOf(path) : "Untitled"), dirty: false, save: path ? "saved" : "idle" });
}

export async function openFrom(path: string): Promise<boolean> {
  try {
    const raw = await loadGraph(path);
    const file = JSON.parse(raw) as FileGraph;
    if (file.format !== "doodle-graph") throw new Error("Not a Doodle graph");
    load(file, path);
    try {
      localStorage.setItem(LAST, path);
    } catch {
      /* fine */
    }
    return true;
  } catch (e) {
    doc.set((d) => ({ ...d, save: "failed", error: String(e) }));
    return false;
  }
}

export async function openDialog() {
  if (!inTauri) return;
  const path = await pickOpenDir();
  if (path) await openFrom(path);
}

/** A fresh graph from one of the templates. */
export function newGraph(template: TemplateId = "images") {
  const t = templateById(template);
  const { nodes, edges } = t.build();
  graph.set({
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    order: nodes.map((n) => n.id),
    edges: Object.fromEntries(edges.map((e) => [e.id, e])),
    selection: [],
    edgeSelection: [],
  });
  resetHistory();
  doc.set({ path: null, name: `Untitled ${t.name.toLowerCase()}`, dirty: false, save: "idle" });
}

/** On launch: the last graph if it is still there, else the template. Tells
 *  the caller whether a saved camera came with it. */
export async function restoreLast(): Promise<boolean> {
  if (!inTauri) return false;
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST);
  } catch {
    /* fine */
  }
  if (!last) return false;
  if (!(await graphExists(last))) return false;
  return openFrom(last);
}
