/**
 * Gathering onto a board (PLAN.md M3.3): files dropped on a board, or
 * added through File › Import… inside one, read (`readMaterial`), kept in
 * the project, and laid out (`board.ts`) as clippings — one journal entry.
 * A document's words stay with its clipping (pages apart by a form feed),
 * so the clipping opens to them, and the file itself is kept in `assets/`
 * so it opens wherever the original went.
 */
import { graph, makeNode, childrenOf, type GraphNode } from "./graph";
import { commit } from "./history";
import { say, retell, hush } from "./notice";
import { doc, save, mayLeave, newGraph } from "./doc";
import { closeChooser } from "./ui";
import { enter } from "./nav";
import { fitAll } from "../canvas/view";
import { buildFromBoard } from "./build";
import { layOut, pictureSource, type Gathered, type Item } from "./board";
import { readMaterial } from "../readers";
import { importAsset, keepSource, readThumb, pickGather, PICTURES, importable } from "../platform/fs";
import { log, since } from "../platform/log";

/** a page break between a document's pages, in its clipping's words */
export const PAGE_BREAK = "\f";

/** a picture's height over its width, from its small copy */
async function ratioOf(dir: string, rel: string): Promise<number> {
  try {
    const url = await readThumb(dir, rel, 256);
    const img = new Image();
    img.src = url;
    await img.decode();
    return img.naturalHeight / img.naturalWidth || 1;
  } catch {
    return 1;
  }
}

const stem = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

/** Ask for documents and pictures, and lay them on the board from `at`. */
export async function gatherDialog(boardId: string, at?: { x: number; y: number }) {
  const paths = await pickGather();
  if (paths.length) await gatherInto(boardId, paths, at ?? freeSpot(boardId));
}

/** The book's board — the first at its root, or a new one beside its chapters. */
export function boardHere(): string {
  const g = graph.get();
  const root = childrenOf(g, null).map((id) => g.nodes[id]);
  const have = root.find((n) => n.kind === "board");
  if (have) return have.id;
  const right = root.length ? Math.max(...root.map((n) => n.x + n.w)) + 60 : 0;
  const top = root.length ? Math.min(...root.map((n) => n.y)) : 0;
  const board = makeNode("board", right, top, { title: "Board" });
  commit("Add a board", () => graph.set((x) => ({ ...x, nodes: { ...x.nodes, [board.id]: board }, order: [...x.order, board.id] })));
  return board.id;
}

/** where the board's next things go when nothing says: under what is there */
export function freeSpot(boardId: string) {
  const g = graph.get();
  const there = childrenOf(g, boardId).map((id) => g.nodes[id]);
  return there.length ? { x: Math.min(...there.map((n) => n.x)), y: Math.max(...there.map((n) => n.y + n.h)) + 120 } : { x: 0, y: 0 };
}

/** Read these files and lay them on the board `boardId`, from `at` (its units). */
export async function gatherInto(boardId: string, paths: string[], at: { x: number; y: number }) {
  const files = paths.filter((p) => PICTURES.test(p) || importable(p));
  if (!files.length) return void say("Doodle lays documents and pictures on a board — Markdown, text, Word, PDF, Fountain; JPEG, PNG, HEIC and the like.");
  let dir = doc.get().path;
  if (!dir) {
    if (!(await save())) return;
    dir = doc.get().path!;
  }
  const t0 = performance.now();
  const sources: Gathered[] = [];
  const loose: { path: string; item: Item }[] = [];
  const stop = new AbortController();
  let note: number | null = null;
  const tell = (text: string) => {
    if (note === null) note = say(text, { label: "Stop", run: () => stop.abort() });
    else retell(note, text);
  };
  const failed: string[] = [];
  try {
    for (const [i, path] of files.entries()) {
      stop.signal.throwIfAborted();
      const name = path.split("/").pop() ?? path;
      if (files.length > 3) tell(`Gathering ${i + 1} of ${files.length}: “${name}”…`);
      try {
        if (PICTURES.test(path)) {
          const a = await importAsset(dir, path);
          loose.push({ path, item: { what: "picture", title: stem(path), asset: a.rel, ratio: await ratioOf(dir, a.rel), from: name } });
          continue;
        }
        const m = await readMaterial(path, dir, { signal: stop.signal, onPage: (at, of, model) => tell(`Reading “${name}”: scanned page ${at} of ${of}, with ${model}…`) });
        const source = await keepSource(dir, path);
        const text = m.pages ? m.pages.map((p) => p.text).join(`\n\n${PAGE_BREAK}\n\n`) : m.text;
        const items: Item[] = [{ what: "document", title: m.name, text, source, from: name, pages: m.pages?.length ?? 0 }];
        for (const rel of m.pictures) items.push({ what: "picture", title: `${m.name} — picture`, asset: rel, ratio: await ratioOf(dir, rel), source, from: name });
        sources.push({ name: m.name, items });
      } catch (e) {
        if (stop.signal.aborted) throw e;
        failed.push(name);
        log("gather", `${name.split(".").pop()} failed: ${String(e).replace(/^Error: /, "")}`, "warn");
      }
    }
  } catch {
    return void say("Stopped — nothing was laid on the board.");
  } finally {
    if (note !== null) hush(note);
  }
  if (loose.length) sources.push({ name: pictureSource(loose.map((l) => l.path)), items: loose.map((l) => l.item) });
  if (!sources.length) return void say(`${failed.length === 1 ? `“${failed[0]}”` : "Those"} could not be read.`);

  const g = graph.get();
  const there = childrenOf(g, boardId).map((id) => g.nodes[id]);
  const laid = layOut(sources, at, there);
  const made: GraphNode[] = [
    ...laid.groups.map((b) => makeNode("group", b.x, b.y, { title: b.title, w: b.w, h: b.h, parent: boardId })),
    ...laid.items.map((it) =>
      makeNode("clip", it.x, it.y, {
        title: it.title,
        w: it.w,
        h: it.h,
        parent: boardId,
        ...(it.asset ? { asset: it.asset } : {}),
        data: { what: it.what, text: it.text ?? "", source: it.source ?? "", from: it.from ?? "", page: it.page ?? 0, pages: it.pages ?? 0, ratio: it.ratio ?? 0, note: "" },
      }),
    ),
  ];
  commit("Gather", () =>
    graph.set((x) => ({
      ...x,
      nodes: { ...x.nodes, ...Object.fromEntries(made.map((n) => [n.id, n])) },
      order: [...x.order, ...made.map((n) => n.id)],
      selection: made.filter((n) => n.kind === "clip").map((n) => n.id),
      edgeSelection: [],
    })),
  );
  const count = laid.items.length;
  log("gather", `${count} clippings (${laid.items.filter((i) => i.what === "picture").length} pictures), ${laid.groups.length} groups, ${failed.length} failed, ${since(t0)} ms`);
  const board = graph.get().nodes[boardId]?.title ?? "the board";
  say(
    `Laid ${count === 1 ? "one thing" : `${count} things`} on “${board}”${failed.length ? ` — ${failed.length === 1 ? `“${failed[0]}”` : `${failed.length} files`} could not be read` : ""}. ⌘Z takes ${count === 1 ? "it" : "them"} back.`,
  );
}

/** a passage's name: its first words */
export const passageTitle = (text: string) => {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, 6).join(" ").replace(/[,;:.]$/, "") + (words.length > 6 ? "…" : "");
};

/**
 * Clip a passage from a document clipping (PLAN.md M3.4): a clipping of
 * its own on the same board, beside the document — under the passages
 * already clipped from it — remembering the document and the page.
 */
export function clipPassage(docId: string, text: string, page: number): string | null {
  const g = graph.get();
  const d = g.nodes[docId];
  const words = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!d || !words) return null;
  const from = childrenOf(g, d.parent).map((id) => g.nodes[id]);
  const siblings = from.filter((n) => n.kind === "clip" && n.data.of === docId);
  const at = { x: d.x + d.w + 32, y: siblings.length ? Math.max(...siblings.map((n) => n.y + n.h)) + 16 : d.y };
  const others = from.filter((n) => n.kind !== "group");
  const laid = layOut([{ name: "", items: [{ what: "passage", title: passageTitle(words), text: words }] }], at, others);
  const p = laid.items[0];
  const node = makeNode("clip", p.x, p.y, {
    title: p.title,
    w: p.w,
    h: p.h,
    parent: d.parent,
    data: { what: "passage", text: words, source: String(d.data.source ?? ""), from: String(d.data.from ?? ""), page, pages: 0, ratio: 0, note: "", of: docId },
  });
  commit("Clip", () => graph.set((x) => ({ ...x, nodes: { ...x.nodes, [node.id]: node }, order: [...x.order, node.id] })));
  return node.id;
}

/**
 * Start from material (PLAN.md M3.5): a new book with a board, and these
 * files — or those asked for — laid on it; then the board, entered. A book
 * of files needs a home first, so it is saved (the one question asked).
 */
export async function startFromMaterial(paths?: string[]) {
  if (!(await mayLeave())) return;
  const files = paths ?? (await pickGather());
  if (!files.length) return;
  try {
    localStorage.setItem("doodle.welcomed.v1", String(Date.now()));
  } catch {
    /* a private window */
  }
  newGraph("material");
  closeChooser();
  const board = boardHere();
  if (!(await save())) return void say("The book is not saved yet — its material needs a home. Save it, then drop the files on its board.");
  await gatherInto(board, files, { x: 0, y: 0 });
  enter(board, () => requestAnimationFrame(fitAll));
  // what the board is for: the book's makings, proposed from it (M3.6)
  if (childrenOf(graph.get(), board).length)
    say("From here the writer can propose a cast, places, a style and an outline — you keep what fits.", { label: "Build from the board", run: () => void buildFromBoard(board) });
}
