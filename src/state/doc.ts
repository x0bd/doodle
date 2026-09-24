/**
 * The document: which folder the graph lives in, whether it has changed
 * since it was written, and how the last write went. Saving is never
 * promised until Rust confirms it.
 */
import { FRAMES } from "../graph/kinds";
import { createStore } from "./store";
import { graph } from "./graph";
import { camera } from "../canvas/camera";
import { history, reset as resetHistory, commit, undo } from "./history";
import { nav, resetNav } from "./nav";
import { restoreJobs, forgetJobs } from "./jobs";
import { inTauri, askThree, listBackups, readBackup, setAside, unusedAssets, trashUnusedAssets, recoveryAppend, recoveryRead, recoveryClear, takeOpened, setRecentMenu, loadGraph, pickOpenDir, pickOpenFile, pickSaveDir, pickSaveFile, saveGraph, graphExists, writeAsset, duplicateGraph, revealPath, writeText, exportArchive, importArchive, confirmAsk } from "../platform/fs";
import { templateById, type TemplateId } from "../graph/templates";
import { PLACES } from "../graph/kinds";
import { prov, resetProv, rekey } from "./prov";
import { asMarkdown } from "./reading";
import { log, painted, since } from "../platform/log";
import { check, FORMAT, Unreadable, type Checked, type FileGraph } from "./integrity";
import { delta, replay, type Tracked } from "./recovery";
import { say, hushAll } from "./notice";
import { keepDaily, loadVersions, versions } from "./versions";
import { stats, noted as tally, bookWords } from "./stats";
const versionsDir = () => versions.get().dir;

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

function serialize(): string {
  const g = graph.get();
  const file: FileGraph = {
    format: "doodle-graph",
    version: FORMAT,
    name: doc.get().name,
    nodes: g.nodes,
    order: g.order,
    edges: g.edges,
    camera: camera.get(),
    views: { ...nav.get().views, [nav.get().focus ?? "root"]: camera.get() },
    bible: doc.get().bible,
    provenance: prov.get(),
    stats: stats.get(),
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
  // only ever the open document into its own file: a save scheduled for a
  // project that has since been left must not write what replaced it
  if (doc.get().path !== path) return;
  pendingSince = 0;
  doc.set((d) => ({ ...d, save: "saving" }));
  try {
    await materialize(path);
    if (doc.get().path !== path) throw new Error("The document changed while it was being saved");
    flushLog(); // what the log has not yet heard goes before the save's line is drawn
    const saved = tracked(); // taken in the same moment as the words the file gets
    const t0 = performance.now();
    const json = serialize();
    const t1 = performance.now();
    await saveGraph(path, json);
    noteSave(t1 - t0, since(t1), json.length);
    savedOver(path, saved);
    doc.set((d) => ({ ...d, dirty: false, save: "saved", error: undefined }));
  } catch (e) {
    doc.set((d) => ({ ...d, save: "failed", error: String(e) }));
    log("save", `failed: ${String(e).slice(0, 200)}`, "error");
  }
}

/** Saves happen every few seconds while writing; the log hears about each
 *  slow one (over 50 ms, the plan's bar) and a summary every fifty. */
const saves: number[] = [];
function noteSave(serializeMs: number, writeMs: number, bytes: number) {
  const ms = serializeMs + writeMs;
  if (ms > 50) log("save", `slow: ${ms.toFixed(1)} ms (serialize ${serializeMs.toFixed(1)}, write ${writeMs.toFixed(1)}), ${Math.round(bytes / 1024)} KB`, "warn");
  saves.push(ms);
  if (saves.length >= 50) {
    const s = [...saves].sort((a, b) => a - b);
    log("save", `50 saves: median ${s[25].toFixed(1)} ms, max ${s[49].toFixed(1)} ms, ${Math.round(bytes / 1024)} KB`);
    saves.length = 0;
  }
}

/** The save, timed and nothing else changed — for the benchmark (M1.9):
 *  the file written is the one that is open, as it is. */
export async function timeSave(): Promise<{ serialize: number; write: number; bytes: number } | null> {
  const path = doc.get().path;
  if (!inTauri || !path) return null;
  const t0 = performance.now();
  const json = serialize();
  const t1 = performance.now();
  await saveGraph(path, json);
  return { serialize: t1 - t0, write: since(t1), bytes: json.length };
}

/** Save now — asking where, if the graph has never been saved. */
export async function save(): Promise<boolean> {
  if (!inTauri) return false;
  const d = doc.get();
  const path = d.path ?? (await pickSaveDir(d.name));
  if (!path) return false;
  flushLog(); // an untitled graph's last lines go to its own log before it has a home
  doc.set((x) => ({ ...x, path, name: nameOf(path) }));
  if (versionsDir() !== path) void loadVersions(path);
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
  flushLog();
  doc.set((d) => ({ ...d, path, name: nameOf(path) }));
  if (versionsDir() !== path) void loadVersions(path);
  try {
    localStorage.setItem(LAST, path);
    remember(path, nameOf(path));
  } catch {
    /* fine */
  }
  await write(path);
}

/** Every change marks the document dirty; with a home, it is written soon
 *  after — when typing pauses, and at least every five seconds while it
 *  does not (the recovery log covers the moments in between). */
let pendingSince = 0;
history.subscribe(() => {
  // a journal emptied is a document being opened or begun, not an edit —
  // and at that moment `doc.path` is still the one being left
  if (history.get().seq === 0) return;
  doc.set((d) => (d.dirty ? d : { ...d, dirty: true }));
  const path = doc.get().path;
  if (!path) return;
  pendingSince ||= Date.now();
  clearTimeout(timer);
  timer = window.setTimeout(() => doc.get().path === path && write(path), Math.max(0, Math.min(600, pendingSince + 5000 - Date.now())));
});

/* ── today's words (M2.5): the ledger follows the book a moment after the
   typing pauses, and once a minute, so midnight turns the day over ── */
let counting: number | undefined;
const count = () => stats.set((s) => tally(s, bookWords(graph.get())));
graph.subscribe(() => {
  clearTimeout(counting);
  counting = window.setTimeout(count, 1000);
});
// one timer for the window, whatever replaced this module last (a hot
// patch once left one per copy, each counting into a store gone stale)
if (typeof window !== "undefined") {
  const w = window as unknown as { __doodleCount?: number };
  clearInterval(w.__doodleCount);
  w.__doodleCount = window.setInterval(count, 60_000);
}

/** A change that is not a journal entry but belongs in the file — the
 *  daily goal: written soon, as an edit would be. */
export function saveSoon() {
  doc.set((d) => (d.dirty ? d : { ...d, dirty: true }));
  const path = doc.get().path;
  if (!path) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => doc.get().path === path && write(path), 600);
}

/* ── the recovery log (PLAN.md M1.4; the lines themselves: recovery.ts) ── */

/** what the log so far is written against; null while nothing is logged */
let base: Tracked | null = null;
/** whether the never-saved graph's own log is the one being written */
let untitledLog = false;
let flushing: number | undefined;
/** appends, clears and reads, in the order they were asked for */
let chain: Promise<unknown> = Promise.resolve();
const queue = (f: () => Promise<unknown>) => (chain = chain.then(f).catch(() => undefined));

function tracked(): Tracked {
  const g = graph.get();
  const d = doc.get();
  return { nodes: g.nodes, order: g.order, edges: g.edges, bible: d.bible, name: d.name, provenance: prov.get() };
}

/** write down, now, what changed since the last line */
function flushLog() {
  clearTimeout(flushing);
  flushing = undefined;
  if (!base) return;
  const now = tracked();
  const line = delta(base, now);
  if (!line) return;
  base = now;
  const dir = doc.get().path;
  const text = JSON.stringify(line);
  queue(() => recoveryAppend(dir, text));
}

/** a change is on the disk within half a second of being made */
function noted() {
  if (base && flushing === undefined) flushing = window.setTimeout(flushLog, 400);
}
graph.subscribe(noted);
doc.subscribe(noted);
prov.subscribe(noted);

/** stop logging what is open — it is being left */
function leaveLog() {
  clearTimeout(timer);
  pendingSince = 0;
  hushAll();
  flushLog();
  // a save it was still waiting for is made now, from what it is at this
  // moment (if it fails, its log still has every change for the next open)
  const d = doc.get();
  if (inTauri && d.path && d.dirty) {
    const path = d.path;
    const json = serialize();
    queue(() => saveGraph(path, json).then(() => recoveryClear(path)));
  }
  base = null;
  if (untitledLog) queue(() => recoveryClear(null)); // a never-saved graph, put away by choice
  untitledLog = false;
}

/** what the file held after its last save (or as it opened) — what a
 *  daily version keeps of whatever this save changes */
let lastSaved: Tracked | null = null;

/** the file now holds `saved`: its log starts again from there */
function savedOver(path: string, saved: Tracked) {
  if (!inTauri) return;
  const before = lastSaved;
  lastSaved = saved;
  if (before) void keepDaily(path, before, saved);
  queue(() => recoveryClear(path));
  if (untitledLog) queue(() => recoveryClear(null));
  untitledLog = false;
  base = saved;
  noted();
}

/** a graph with no file under it: its log begins with the whole of it */
function logUntitled() {
  lastSaved = null;
  void loadVersions(null);
  if (!inTauri) return;
  base = tracked();
  untitledLog = true;
  const text = JSON.stringify({ t: Date.now(), base });
  queue(() => recoveryClear(null));
  queue(() => recoveryAppend(null, text));
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 60 * 24 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleString();
};

/** A project's log laid over it as it opens: what was changed after the
 *  last save, back — one journal entry, so ⌘Z takes it away again. */
async function recoverInto(path: string) {
  base = tracked();
  lastSaved = base;
  void loadVersions(path);
  const text = await recoveryRead(path).catch(() => null);
  const r = text ? replay(base, text) : null;
  if (!r) {
    if (text) queue(() => recoveryClear(path)); // it held nothing the file does not
    return;
  }
  commit("Recover", () => graph.set((g) => ({ ...g, nodes: r.state.nodes, order: r.state.order, edges: r.state.edges })));
  resetProv(r.state.provenance);
  doc.set((d) => ({ ...d, name: r.state.name, bible: r.state.bible, dirty: true }));
  say(`Recovered what was changed after the last save — the last of it ${ago(r.at)}.`, { label: "Undo", run: undo });
}

/** Whether what is open may be put away for something else. A project
 *  saves itself on the way out; a graph that was never saved and has been
 *  worked on is asked about, as the platform asks. */
export async function mayLeave(): Promise<boolean> {
  const d = doc.get();
  if (d.path || !d.dirty || !Object.keys(graph.get().nodes).length) return true;
  const a = await askThree(`Keep “${d.name}”? It has never been saved.`, "Doodle", "Save…", "Don't Save");
  if (a === "cancel") return false;
  if (a === "yes") return save();
  return true;
}

/** A never-saved graph's log, if it holds work — without opening it */
async function untitledWaiting() {
  if (!inTauri) return null;
  const text = await recoveryRead(null).catch(() => null);
  return text ? replay(null, text) : null;
}

/** On launch: a graph that was never saved and was being worked on when
 *  Doodle stopped, back as it was. Says whether there was one. */
export async function recoverUntitled(): Promise<boolean> {
  const r = await untitledWaiting();
  if (!r) return false;
  const s = r.state;
  load({ format: "doodle-graph", version: 1, name: s.name, nodes: s.nodes, order: s.order, edges: s.edges, camera: camera.get(), bible: s.bible, provenance: s.provenance }, null);
  doc.set((d) => ({ ...d, dirty: true }));
  base = tracked(); // the log goes on from where it stopped
  untitledLog = true;
  lastSaved = null;
  void loadVersions(null);
  say(`“${s.name}” was never saved; here it is as it was ${ago(r.at)}.`, { label: "Save…", run: () => void save() });
  return true;
}

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
  stats.set(tally(file.stats ?? { goal: 0, days: {} }, bookWords(graph.get())));
  doc.set({ path, name: file.name ?? (path ? nameOf(path) : "Untitled"), dirty: false, save: path ? "saved" : "idle", bible: { ...EMPTY_BIBLE, ...(file.bible ?? {}) } });
}

export async function openFrom(path: string): Promise<boolean> {
  if (doc.get().path !== path && !(await mayLeave())) return false;
  try {
    const t0 = performance.now();
    const got = await readSound(path);
    if (!got) return false;
    const read = since(t0);
    leaveLog();
    const t1 = performance.now();
    load(got.file, path);
    const loaded = since(t1);
    await painted();
    const n = Object.keys(got.file.nodes).length;
    const assets = new Set(Object.values(got.file.nodes).flatMap((x) => [x.asset, ...(x.outputs ?? []), ...(x.attachments ?? [])]).filter(Boolean)).size;
    log("open", `${since(t0)} ms to first paint (read + check ${read}, load ${loaded}), ${n} nodes, ${assets} pictures${got.fixes.length ? `, ${got.fixes.length} fixes` : ""}${got.said && !got.fixes.length ? ", from a backup" : ""}`);
    await recoverInto(path);
    await restoreJobs(path);
    try {
      localStorage.setItem(LAST, path);
      remember(path, nameOf(path));
    } catch {
      /* fine */
    }
    // what had to happen to open it is said last, over any other notice
    if (got.said) {
      say(got.said);
      doc.set((d) => ({ ...d, dirty: true }));
      void write(path); // the file is sound again from here
    }
    return true;
  } catch (e) {
    doc.set((d) => ({ ...d, save: "failed", error: String(e) }));
    return false;
  }
}

/** A project's graph as it can be trusted (PLAN.md M1.6): its own file,
 *  set right where it had to be — or, when that file is damaged, the newest
 *  backup that is sound, the damaged file kept aside. Nothing, with the
 *  reason said, when neither will do. */
async function readSound(path: string): Promise<(Checked & { said?: string }) | null> {
  const name = nameOf(path);
  let why: Unreadable;
  try {
    const got = check(await loadGraph(path));
    if (!got.fixes.length) return got;
    const kept = await setAside(path, "before").catch(() => null);
    const list = got.fixes.length > 1 ? `${got.fixes.slice(0, -1).join(", ")}, and ${got.fixes.at(-1)}` : got.fixes[0];
    return { ...got, said: `“${name}” was mended as it opened — ${list}.${kept ? " The file as it was is kept beside it." : ""}` };
  } catch (e) {
    why = e instanceof Unreadable ? e : new Unreadable("could not be read");
  }
  if (why.newer) {
    await confirmAsk(`“${name}” ${why.message}. Update Doodle to open it — nothing in it has been changed.`, "Open", "Alright");
    return null;
  }
  for (const b of await listBackups(path).catch(() => [] as string[])) {
    try {
      const got = check(await readBackup(path, b));
      const kept = await setAside(path, "damaged").catch(() => null);
      const at = new Date(Number(/graph-(\d+)/.exec(b)?.[1] ?? 0) * 1000);
      const when = at.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
      return {
        ...got,
        said: `“${name}” was damaged, so it opened from its backup of ${when}. ${kept ? "The damaged file is kept beside it; anything" : "Anything"} later may be in Versions.`,
      };
    } catch {
      /* an older one, then */
    }
  }
  await confirmAsk(`“${name}” ${why.message}, and none of its backups could be read either. Nothing has been changed.`, "Open", "Alright");
  return null;
}

/** File › Tidy Unused Pictures: the pictures nothing names — not the
 *  graph, its runs, its versions or what is not saved yet — found first
 *  and counted, then moved to the Trash only if the writer says so. */
export async function tidyAssets() {
  const path = doc.get().path;
  if (!inTauri || !path) return say("Only a saved project keeps pictures of its own.");
  if (doc.get().dirty) await write(path);
  const found = await unusedAssets(path).catch(() => null);
  if (!found) return say("The project's pictures could not be looked through.");
  if (!found.files.length) return say("Every picture in the project is used somewhere.");
  const n = found.files.length;
  const mb = found.bytes / 1048576;
  const size = mb >= 1 ? `${mb.toFixed(mb < 10 ? 1 : 0)} MB` : `${Math.max(1, Math.round(found.bytes / 1024))} KB`;
  const ok = await confirmAsk(
    `${n === 1 ? "One picture" : `${n} pictures`} (${size}) ${n === 1 ? "is" : "are"} used nowhere — not on the field, in a run, or in any version. Move ${n === 1 ? "it" : "them"} to the Trash?`,
    "Tidy unused pictures",
    "Move to Trash",
  );
  if (!ok) return;
  const moved = await trashUnusedAssets(path).catch(() => -1);
  say(moved < 0 ? "The pictures could not be moved to the Trash." : `Moved ${moved === 1 ? "one picture" : `${moved} pictures`} to the Trash.`);
}

export async function openDialog() {
  if (!inTauri) return;
  const path = await pickOpenDir();
  if (path) await openFrom(path);
}

/** A fresh graph from one of the templates. */
export function newGraph(template: TemplateId = "images") {
  leaveLog();
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
  stats.set(tally({ goal: 0, days: {} }, bookWords(graph.get())));
  doc.set({ path: null, name: template === "sample" ? t.name : `Untitled ${t.name.toLowerCase()}`, dirty: false, save: "idle", bible: EMPTY_BIBLE });
  logUntitled();
}

/** What the window opens on, decided once per page — React's development
 *  double mount must not decide it twice (the second time the Finder's
 *  hand-over was already taken, and the welcome covered what it opened).
 *  Something handed over; else a never-saved graph that was being worked
 *  on; else the last graph. Says whether anything opened. */
let launched: Promise<boolean> | undefined;
export function launch(): Promise<boolean> {
  return (launched ??= openHandedOver().then(async (handed) => {
    if (!handed) return (await recoverUntitled()) || restoreLast();
    // the Finder's choice wins, but unsaved work is never hidden
    const kept = await untitledWaiting();
    if (kept) say(`“${kept.state.name}”, which was never saved, is kept.`, { label: "Open it", run: () => void openUntitled() });
    return true;
  }));
}

/** the kept never-saved graph, in place of what is open */
async function openUntitled() {
  if (!(await mayLeave())) return;
  leaveLog();
  await recoverUntitled();
}

/** Help › Open the Sample Book: the first run's book, any time after */
export async function openSample() {
  if (!(await mayLeave())) return;
  newGraph("sample");
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
