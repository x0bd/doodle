/**
 * Build from the board (PLAN.md M3.6). What was gathered — documents,
 * passages, notes, pictures (described by a model that sees, `vision.ts`) —
 * numbered and handed to the writer, who proposes what the book could be
 * built from: its cast, places, things, a style from the pictures, a
 * chapter outline, a bible. Each proposal names the numbers it came from.
 * They are ghosts on the board until kept; kept, a thing is a node that
 * remembers its clippings (`data.clips`, their ids) and opens them.
 */
import { createStore } from "./store";
export type { Proposal, ProposalKind, Built } from "./proposals";
import { graph, childrenOf, makeNode, type GraphNode } from "./graph";
import { commit } from "./history";
import { doc, setBible } from "./doc";
import { say, retell, hush } from "./notice";
import { ui } from "./ui";
import { placeAt } from "./importer";
import { pick } from "../providers/registry";
import { readThumb } from "../platform/fs";
import { eyes, describe, seeStyle, type SeenStyle } from "../readers/vision";
import { digest, parseBuild, BUILD_SYSTEM, BUILD_SCHEMA, type Built } from "./proposals";
import { log, since } from "../platform/log";

/** what has been proposed for each board, until kept or dropped */
export const built = createStore<Record<string, Built>>({});

/** Look at the board's pictures that have not been looked at, and keep what was seen on each. */
async function lookAt(pictures: GraphNode[], signal: AbortSignal, tell: (t: string) => void): Promise<string | null> {
  const unseen = pictures.filter((p) => !String(p.data.seen ?? "").trim() && p.asset);
  if (!unseen.length) return null;
  const by = await eyes();
  const dir = doc.get().path;
  if (!by || !dir) return null;
  const seen: Record<string, string> = {};
  for (const [i, p] of unseen.entries()) {
    signal.throwIfAborted();
    tell(`Looking at the pictures with ${by.name}: ${i + 1} of ${unseen.length}…`);
    try {
      const url = await readThumb(dir, p.asset!, 512);
      const words = await describe(url.slice(url.indexOf(",") + 1), by, signal);
      if (words) seen[p.id] = words;
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }
  // what was seen is kept on each picture, so it is looked at once — one entry, not one a picture
  if (Object.keys(seen).length)
    commit("Look at the pictures", () =>
      graph.set((g) => ({ ...g, nodes: Object.fromEntries(Object.entries(g.nodes).map(([id, n]) => [id, seen[id] ? { ...n, data: { ...n.data, seen: seen[id] } } : n])) })),
    );
  return by.name;
}

/** Read the board and propose what the book could be built from. */
export async function buildFromBoard(boardId: string) {
  const g0 = graph.get();
  const board = g0.nodes[boardId];
  if (!board) return;
  const t0 = performance.now();
  const stop = new AbortController();
  let note: number | null = null;
  const tell = (text: string) => {
    if (note === null) note = say(text, { label: "Stop", run: () => stop.abort() });
    else retell(note, text);
  };
  try {
    const pictures = childrenOf(g0, boardId).map((id) => g0.nodes[id]).filter((n) => n.kind === "clip" && n.data.what === "picture");
    const looked = await lookAt(pictures, stop.signal, tell);
    const g = graph.get();
    const { text, index } = digest(childrenOf(g, boardId).map((id) => g.nodes[id]));
    if (!index.length) return void say("The board is empty — drop documents and pictures on it first.");
    const { provider, fellBack } = await pick("text.generate", ui.get().writeWith);
    const name = provider.descriptor.id === "mock" ? "the stand-in" : ui.get().writeWith;
    tell(`Reading the board (${index.length} things) with ${name}…`);
    const answer = await provider.generateText!({ prompt: text, system: BUILD_SYSTEM, schema: BUILD_SCHEMA, context: 16384, think: false }, stop.signal);
    const items = parseBuild(answer, index);
    log("build", `${index.length} things, ${pictures.length} pictures${looked ? ` seen by ${looked}` : ""}, ${items.length} proposals by ${provider.descriptor.id}, ${since(t0)} ms`);
    if (!items.length) return void say("Nothing came back that could be read. Try again, or with another writer (Settings › Providers).");
    built.set((b) => ({ ...b, [boardId]: { board: boardId, by: name, items } }));
    if (fellBack) say(`${ui.get().writeWith} was not there — the stand-in proposed these.`);
  } catch (e) {
    if (stop.signal.aborted) return void say("Stopped — nothing was proposed.");
    log("build", `failed: ${String(e).replace(/^Error: /, "")}`, "warn");
    say(`The board could not be read: ${String(e).replace(/^Error: /, "")}`);
  } finally {
    if (note !== null) hush(note);
  }
}

/** where kept things go: the book's level, the board's */
const levelOf = (boardId: string) => graph.get().nodes[boardId]?.parent ?? null;

function drop(boardId: string, ids: string[]) {
  built.set((b) => {
    const set = b[boardId];
    if (!set) return b;
    const items = set.items.filter((i) => !ids.includes(i.id));
    const next = { ...b };
    if (items.length) next[boardId] = { ...set, items };
    else delete next[boardId];
    return next;
  });
}

/** Drop a proposal. */
export const dropProposal = (boardId: string, id: string) => drop(boardId, [id]);

/** Keep proposals: each a node beside the board (a chapter after the
 *  book's chapters; the bible into the book's bible), remembering its
 *  clippings — one journal entry. */
export function keepProposals(boardId: string, ids: string[]) {
  const set = built.get()[boardId];
  if (!set) return;
  const keep = set.items.filter((i) => ids.includes(i.id));
  if (!keep.length) return;
  const g = graph.get();
  const board = g.nodes[boardId];
  const level = levelOf(boardId);
  const here = childrenOf(g, level).map((id) => g.nodes[id]);
  const made: GraphNode[] = [];
  // the cast, places, things and style stand in a row under the board
  let x = board.x;
  const y = Math.max(board.y + board.h, ...here.filter((n) => n.kind !== "chapter").map((n) => n.y + n.h)) + 80;
  const chapters = keep.filter((k) => k.kind === "chapter");
  const at = placeAt(here, chapters.length);
  let ci = 0;
  for (const k of keep) {
    const clips = k.from.join(",");
    if (k.kind === "bible") continue;
    if (k.kind === "chapter") {
      const p = at[ci++];
      made.push(makeNode("chapter", p.x, p.y, { title: k.title, parent: level, data: { summary: k.text, text: "", clips } }));
      continue;
    }
    const kind = k.kind === "character" ? "character" : k.kind === "location" ? "location" : k.kind === "style" ? "style" : "note";
    const node = makeNode(kind, x, y, {
      title: k.title,
      parent: level,
      status: "draft",
      data:
        kind === "style"
          ? { description: k.text, palette: k.extra?.palette ?? "", lighting: k.extra?.lighting ?? "", clips }
          : kind === "note"
            ? { text: `${k.title}. ${k.text}`, clips }
            : { name: k.title, description: k.text, clips },
    });
    made.push(node);
    x += node.w + 40;
  }
  const bible = keep.find((k) => k.kind === "bible");
  commit("Keep from the board", () => {
    if (made.length) graph.set((s) => ({ ...s, nodes: { ...s.nodes, ...Object.fromEntries(made.map((n) => [n.id, n])) }, order: [...s.order, ...made.map((n) => n.id)] }));
  });
  if (bible?.extra) {
    const b = doc.get().bible;
    // what the book's bible already says stays; the board's words go after it
    const join = (had: string, add: string) => (had.trim() ? (add && !had.includes(add) ? `${had.trim()}\n${add}` : had) : add);
    setBible({ tone: join(b.tone, bible.extra.tone), rules: join(b.rules, bible.extra.rules), avoid: join(b.avoid, bible.extra.avoid) });
  }
  drop(boardId, ids);
  const n = made.length;
  if (n) say(`Kept ${n === 1 ? "one" : n} from the board — beside it, each with the clippings it came from. ⌘Z takes ${n === 1 ? "it" : "them"} back.`);
  if (bible) say("The board's tone, rules and what to avoid are in the book's bible now (the Inspector, at the top of the book).");
}

/**
 * Board → style (PLAN.md M3.7): pictures chosen on a board, looked at
 * together by a model that sees, and made a style — its palette, light
 * and medium in words, the pictures themselves its references
 * (`attachments`, which ride into image requests with it: `jobs.ts`).
 * It stands beside the board, remembering its clippings.
 */
export async function styleFromPictures(ids: string[]) {
  const g = graph.get();
  const pics = ids.map((id) => g.nodes[id]).filter((n) => n?.kind === "clip" && n.data.what === "picture" && n.asset);
  if (!pics.length) return void say("Choose pictures on the board first — the style is made from them.");
  const board = g.nodes[pics[0].parent ?? ""];
  const dir = doc.get().path;
  const by = await eyes();
  let seen: SeenStyle | null = null;
  if (by && dir) {
    const note = say(`Looking at ${pics.length === 1 ? "the picture" : `${pics.length} pictures`} with ${by.name}…`);
    try {
      const images = await Promise.all(pics.slice(0, 6).map(async (p) => {
        const url = await readThumb(dir, p.asset!, 512);
        return url.slice(url.indexOf(",") + 1);
      }));
      seen = await seeStyle(images, by);
    } catch (e) {
      log("style", `failed: ${String(e).replace(/^Error: /, "")}`, "warn");
    } finally {
      hush(note);
    }
  }
  // no eyes: what was seen of each, when the board was built, stands in
  const fallback = pics.map((p) => String(p.data.seen ?? "")).filter(Boolean).join(" ");
  const level = board?.parent ?? null;
  const here = childrenOf(graph.get(), level).map((id) => graph.get().nodes[id]);
  const x = board ? board.x + board.w + 60 : 0;
  const y = board ? board.y : 0;
  const clear = !here.some((n) => n.x < x + 300 && x < n.x + n.w && n.y < y + 260 && y < n.y + n.h);
  const node = makeNode("style", x, clear ? y : Math.max(...here.map((n) => n.y + n.h)) + 60, {
    title: seen?.name || "A style from the board",
    parent: level,
    status: "draft",
    asset: pics[0].asset,
    attachments: pics.map((p) => p.asset!),
    data: {
      description: [seen?.description, seen?.medium && `Medium: ${seen.medium}.`].filter(Boolean).join(" ") || fallback.slice(0, 400) || "The look of the pictures it was made from.",
      palette: seen?.palette ?? "",
      lighting: seen?.lighting ?? "",
      clips: pics.map((p) => p.id).join(","),
    },
  });
  commit("Make a style", () => graph.set((s) => ({ ...s, nodes: { ...s.nodes, [node.id]: node }, order: [...s.order, node.id] })));
  log("style", `${pics.length} pictures${by ? ` seen by ${by.name}` : ", not looked at"}`);
  say(`“${node.title}” is a style now, beside the board — its ${pics.length === 1 ? "picture rides" : `${pics.length} pictures ride`} with it into what it is wired to. ⌘Z takes it back.`);
}
