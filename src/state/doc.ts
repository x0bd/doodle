/**
 * The document: which folder the graph lives in, whether it has changed
 * since it was written, and how the last write went. Saving is never
 * promised until Rust confirms it.
 */
import { createStore } from "./store";
import { graph, type GraphState } from "./graph";
import { camera, type Camera } from "../canvas/camera";
import { history, reset as resetHistory } from "./history";
import { nav, resetNav } from "./nav";
import { restoreJobs, forgetJobs } from "./jobs";
import { inTauri, loadGraph, pickOpenDir, pickSaveDir, saveGraph, graphExists, writeAsset } from "../platform/fs";
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
  /** each workspace's last view, by node id; "root" for the top */
  views?: Record<string, Camera>;
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
    views: { ...nav.get().views, [nav.get().focus ?? "root"]: camera.get() },
  };
  return JSON.stringify(file, null, 2);
}

const nameOf = (path: string) => path.split("/").pop()!.replace(/\.doodle$/, "");

/* ── writing ── */
let timer: number | undefined;

/** Images still held as data URLs — outputs made before the graph had a
 *  home — go into assets/ so the file holds references, not pictures. */
async function materialize(path: string) {
  const g = graph.get();
  const moves = new Map<string, string>();
  const refs = new Set<string>();
  for (const n of Object.values(g.nodes)) {
    for (const r of [n.asset, ...(n.outputs ?? []), ...(n.attachments ?? [])]) if (r?.startsWith("data:")) refs.add(r);
  }
  for (const r of refs) {
    try {
      moves.set(r, (await writeAsset(path, r)).rel);
    } catch {
      /* it stays a data URL this time */
    }
  }
  if (!moves.size) return;
  const swap = (r: string | undefined) => (r && moves.get(r)) || r;
  graph.set((x) => {
    const nodes = { ...x.nodes };
    for (const id of Object.keys(nodes)) {
      const n = nodes[id];
      nodes[id] = { ...n, asset: swap(n.asset), outputs: n.outputs?.map((r) => swap(r)!), attachments: n.attachments?.map((r) => swap(r)!) };
    }
    return { ...x, nodes };
  });
}

async function write(path: string) {
  doc.set((d) => ({ ...d, save: "saving" }));
  try {
    await materialize(path);
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
    const n = nodes[id];
    if (n && (n.seq == null || n.parent === undefined)) nodes[id] = { ...n, seq: n.seq ?? i + 1, parent: n.parent ?? null };
  });
  graph.set({ nodes, order: file.order, edges: file.edges, selection: [], edgeSelection: [] });
  resetNav(file.views ?? {});
  if (!file.views?.root && file.camera) camera.set(file.camera);
  resetHistory();
  doc.set({ path, name: file.name ?? (path ? nameOf(path) : "Untitled"), dirty: false, save: path ? "saved" : "idle" });
}

export async function openFrom(path: string): Promise<boolean> {
  try {
    const raw = await loadGraph(path);
    const file = JSON.parse(raw) as FileGraph;
    if (file.format !== "doodle-graph") throw new Error("Not a Doodle graph");
    load(file, path);
    await restoreJobs(path);
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
  resetNav();
  forgetJobs();
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
