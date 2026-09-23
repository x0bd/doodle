/**
 * The document: which folder the graph lives in, whether it has changed
 * since it was written, and how the last write went. Saving is never
 * promised until Rust confirms it.
 */
import { FRAMES } from "../graph/kinds";
import { createStore } from "./store";
import { graph, type GraphState } from "./graph";
import { camera, type Camera } from "../canvas/camera";
import { history, reset as resetHistory } from "./history";
import { nav, resetNav } from "./nav";
import { restoreJobs, forgetJobs } from "./jobs";
import { inTauri, takeOpened, setRecentMenu, loadGraph, pickOpenDir, pickOpenFile, pickSaveDir, pickSaveFile, saveGraph, graphExists, writeAsset, duplicateGraph, revealPath, writeText, exportArchive, importArchive, confirmAsk } from "../platform/fs";
import { templateById, type TemplateId } from "../graph/templates";
import { PLACES } from "../graph/kinds";
import { prov, resetProv, rekey, type Prov } from "./prov";
import { asMarkdown } from "./reading";

export type SaveState = "idle" | "saving" | "saved" | "failed";

export interface Bible {
  tone: string;
  rules: string;
  avoid: string;
}
export const EMPTY_BIBLE: Bible = { tone: "", rules: "", avoid: "" };

export interface DocState {
  path: string | null;
  name: string;
  dirty: boolean;
  save: SaveState;
  error?: string;
  /** the project's own rules — theme, tone, what to avoid — carried into every request */
  bible: Bible;
}

const LAST = "doodle.lastPath";
const SEEN = "doodle.recent.v1";

/** the graphs this machine has opened, newest first — a path and the name
 *  it went by, so the welcome can offer them without touching the disk */
export interface Seen {
  path: string;
  name: string;
  at: number;
}

export function recent(): Seen[] {
  try {
    const raw = localStorage.getItem(SEEN);
    return raw ? (JSON.parse(raw) as Seen[]) : [];
  } catch {
    return [];
  }
}

function remember(path: string, name: string) {
  try {
    const next = [{ path, name, at: Date.now() }, ...recent().filter((r) => r.path !== path)].slice(0, 8);
    localStorage.setItem(SEEN, JSON.stringify(next));
  } catch {
    /* a private window; nothing to remember into */
  }
  recentMenu();
}

/** one the disk no longer has */
export function forget(path: string) {
  try {
    localStorage.setItem(SEEN, JSON.stringify(recent().filter((r) => r.path !== path)));
  } catch {
    /* fine */
  }
  recentMenu();
}

/** the same list on the platform's File › Open Recent */
export function recentMenu() {
  void setRecentMenu(recent().map((r) => r.name)).catch(() => {});
}

export async function openRecent(n: number) {
  const r = recent()[n];
  if (!r) return;
  if (await graphExists(r.path)) await openFrom(r.path);
  else {
    forget(r.path);
    await confirmAsk(`“${r.name}” is no longer where it was. It has been taken off the list.`, "Open Recent", "Alright");
  }
}

export function clearRecent() {
  try {
    localStorage.setItem(SEEN, "[]");
  } catch {
    /* fine */
  }
  recentMenu();
}

export const doc = createStore<DocState>({ path: null, name: "Untitled", dirty: false, save: "idle", bible: EMPTY_BIBLE });

let bibleTimer: number | undefined;
export function setBible(patch: Partial<Bible>) {
  doc.set((d) => ({ ...d, bible: { ...d.bible, ...patch }, dirty: true }));
  const path = doc.get().path;
  if (!path) return;
  clearTimeout(bibleTimer);
  bibleTimer = window.setTimeout(() => write(path), 800);
}

/** the bible as words for a request, or nothing */
export function bibleText(): string {
  const b = doc.get().bible;
  return [b.tone && `Tone: ${b.tone}`, b.rules && `Rules: ${b.rules}`, b.avoid && `Avoid: ${b.avoid}`].filter(Boolean).join("\n");
}

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
  bible?: Bible;
  /** where every generated thing came from, by what it produced */
  provenance?: Record<string, Prov>;
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
    bible: doc.get().bible,
    provenance: prov.get(),
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
  rekey(moves); // the records follow their outputs into the folder
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
    remember(path, nameOf(path));
  } catch {
    /* fine */
  }
  await write(path);
  return doc.get().save === "saved";
}

/** What is written here, out of the app: the place you are in — the book,
 *  or the chapter — as Markdown, in the order it reads. Where the user
 *  says, and then shown to them in the Finder. */
export async function exportText() {
  if (!inTauri) return;
  const g = graph.get();
  const focus = nav.get().focus;
  const here = focus && g.nodes[focus] && PLACES.has(g.nodes[focus].kind) ? focus : null;
  const d = doc.get();
  const name = here ? g.nodes[here].title : d.name;
  const text = asMarkdown(g, here, d.name);
  const path = await pickSaveFile(name, "md", "Export as Markdown");
  if (!path) return;
  await writeText(path, text);
  await revealPath(path);
}

/** The whole project as one file: every file it holds, each with its hash
 *  in a manifest. It must be on disk first — an archive of what was never
 *  saved would be a lie. */
export async function exportArchiveFile() {
  if (!inTauri) return;
  const d = doc.get();
  if (!d.path) {
    if (!(await confirmAsk("The project has to be saved before it can be archived. Save it now?", "Archive", "Save"))) return;
    if (!(await save())) return;
  }
  const dir = doc.get().path!;
  const name = doc.get().name;
  const path = await pickSaveFile(name, "doodlebox", "Archive project");
  if (!path) return;
  try {
    await exportArchive(dir, path, name);
    await revealPath(path);
  } catch (e) {
    doc.set((x) => ({ ...x, save: "failed", error: String(e) }));
  }
}

/** An archive back into a project: every file checked against the manifest
 *  before a byte is written, then opened as it was. */
export async function importArchiveFile() {
  if (!inTauri) return;
  const from = await pickOpenFile("doodlebox", "Open archive");
  if (from) await importArchiveFrom(from);
}

/** A project or an archive the Finder handed over — the last of them, as
 *  there is one window. Says whether there was one. */
export async function openHandedOver(): Promise<boolean> {
  const paths = await takeOpened().catch(() => [] as string[]);
  const path = paths.at(-1);
  if (!path) return false;
  if (path.endsWith(".doodlebox")) await importArchiveFrom(path);
  else if (!(await openFrom(path))) await confirmAsk(`“${nameOf(path)}” could not be opened. ${doc.get().error ?? ""}`.trim(), "Open", "Alright");
  return true;
}

async function importArchiveFrom(from: string) {
  const name = from.split("/").pop()?.replace(/\.doodlebox$/, "") ?? "Imported";
  const dir = await pickSaveDir(name);
  if (!dir) return;
  try {
    const got = await importArchive(from, dir);
    await openFrom(got.dir);
  } catch (e) {
    doc.set((x) => ({ ...x, save: "failed", error: String(e) }));
    await confirmAsk(String(e).replace(/^Error: /, ""), "That archive could not be opened", "Alright");
  }
}

export async function saveAs() {
  if (!inTauri) return;
  const path = await pickSaveDir(doc.get().name);
  if (!path) return;
  doc.set((d) => ({ ...d, path, name: nameOf(path) }));
  try {
    localStorage.setItem(LAST, path);
    remember(path, nameOf(path));
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
    if (n && (n.seq == null || n.parent === undefined || !n.status)) nodes[id] = { ...n, seq: n.seq ?? i + 1, parent: n.parent ?? null, status: n.status ?? "canon" };
    // a generator from before frames: the frame nearest its width and height
    const m = nodes[id];
    if (m?.kind === "generate" && m.data.frame === undefined) {
      const r = Number(m.data.width ?? 1024) / Number(m.data.height ?? 1024);
      const frame = Object.entries(FRAMES).sort(([, a], [, b]) => Math.abs(a[0] / a[1] - r) - Math.abs(b[0] / b[1] - r))[0][0];
      nodes[id] = { ...m, data: { ...m.data, frame } };
    }
  });
  graph.set({ nodes, order: file.order, edges: file.edges, selection: [], edgeSelection: [] });
  resetNav(file.views ?? {});
  if (!file.views?.root && file.camera) camera.set(file.camera);
  resetHistory();
  resetProv(file.provenance ?? {});
  doc.set({ path, name: file.name ?? (path ? nameOf(path) : "Untitled"), dirty: false, save: path ? "saved" : "idle", bible: { ...EMPTY_BIBLE, ...(file.bible ?? {}) } });
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
    remember(path, nameOf(path));
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
  resetProv();
  doc.set({ path: null, name: `Untitled ${t.name.toLowerCase()}`, dirty: false, save: "idle", bible: EMPTY_BIBLE });
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

/** A copy of the folder beside this one, then opened. */
export async function duplicate() {
  const path = doc.get().path;
  if (!path || !inTauri) return;
  if (doc.get().dirty) await write(path);
  const copy = await duplicateGraph(path);
  await openFrom(copy);
}

export async function reveal() {
  const path = doc.get().path;
  if (path && inTauri) await revealPath(path);
}
