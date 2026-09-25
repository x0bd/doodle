/**
 * Search by meaning (PLAN.md M6.2): the book in passages (`passages.ts`),
 * each read once by the embedding model (`readers/embed.ts`) into a vector,
 * kept by the passage's hash — in memory, and in the webview's IndexedDB so
 * it outlives a relaunch. Nothing is written into the project: the same
 * words are the same vector whichever book they are in. A question is a
 * vector too; the passages nearest it are the answer.
 *
 * The index keeps up by itself while Ollama writes (a pause after the last
 * edit), and catches up before any search.
 */
import { graph, type GraphNode } from "./graph";
import { ui } from "./ui";
import { passagesOf, type Passage } from "./passages";
import { embedder, embed, alike } from "../readers/embed";
import { KINDS } from "../graph/kinds";
import { log, since } from "../platform/log";
import { recall, keep } from "../platform/kept";

/** passages read at once: enough to keep the model busy, few enough to stop soon */
const BATCH = 24;

const vectors = new Map<string, Float32Array>();

let running: Promise<Passage[]> | null = null;

/**
 * Bring the index up to the book: the passages there are now, each with
 * a vector — the ones not read before, read now. `onProgress` hears how
 * far it has come.
 */
export async function indexBook(model: string, signal?: AbortSignal, onProgress?: (done: number, of: number) => void): Promise<Passage[]> {
  const all = passagesOf(graph.get().order.map((id) => graph.get().nodes[id]).filter(Boolean), model);
  for (const [k, v] of await recall<Float32Array>("vectors", all.map((p) => p.key).filter((k) => !vectors.has(k)))) vectors.set(k, v);
  const want = [...new Map(all.filter((p) => !vectors.has(p.key)).map((p) => [p.key, p])).values()];
  if (!want.length) return all;
  const t0 = performance.now();
  for (let i = 0; i < want.length; i += BATCH) {
    signal?.throwIfAborted();
    onProgress?.(i, want.length);
    const part = want.slice(i, i + BATCH);
    const vs = await embed(part.map((p) => p.text), model, "passage", signal);
    const pairs = part.map((p, k) => [p.key, vs[k]] as [string, Float32Array]);
    for (const [k, v] of pairs) vectors.set(k, v);
    void keep("vectors", pairs);
  }
  onProgress?.(want.length, want.length);
  log("meaning", `read ${want.length} passages of ${all.length} with ${model}, ${since(t0)} ms`);
  return all;
}

export interface Found {
  node: GraphNode;
  text: string;
  page?: number;
  score: number;
}

/**
 * The passages nearest a question — at most `count`, and no more than
 * `each` from any one node, so one long chapter does not crowd out the book.
 */
export interface Search {
  /** how many passages at most (6) */
  count?: number;
  /** no more than this many from any one node (3) */
  each?: number;
  /** only passages in the nodes this says yes to */
  only?: (n: GraphNode) => boolean;
  signal?: AbortSignal;
  onProgress?: (done: number, of: number) => void;
}

export async function searchMeaning(question: string, { count = 6, each = 3, only, signal, onProgress }: Search = {}): Promise<Found[] | null> {
  const model = await embedder();
  if (!model) return null;
  // one reading at a time: the one going in the background finishes, then
  // whatever it had not reached (nothing is read twice — each batch is kept)
  await running?.catch(() => {});
  const fresh = await indexBook(model, signal, onProgress);
  const [q] = await embed([question], model, "question", signal);
  const g = graph.get();
  const scored = fresh
    .filter((p) => g.nodes[p.node] && vectors.has(p.key) && (!only || only(g.nodes[p.node])))
    .map((p) => ({ p, score: alike(q, vectors.get(p.key)!) }))
    .sort((a, b) => b.score - a.score);
  const per = new Map<string, number>();
  const out: Found[] = [];
  for (const { p, score } of scored) {
    if (out.length >= count) break;
    const n = per.get(p.node) ?? 0;
    if (n >= each) continue;
    per.set(p.node, n + 1);
    out.push({ node: g.nodes[p.node], text: p.text, page: p.page, score });
  }
  return out;
}

/** where a passage is, as the agent is told it: the path down to its node */
export function whereIs(n: GraphNode): string {
  const g = graph.get();
  const path: string[] = [];
  for (let c: GraphNode | undefined = n; c; c = c.parent ? g.nodes[c.parent] : undefined) path.unshift(c.title);
  return `${path.join(" › ")} (${KINDS[n.kind].title.toLowerCase()}, id ${n.id})`;
}

/**
 * Keep the index up while Ollama writes: a pause after the last change
 * to the book, then the passages not yet read. The ChatGPT writer does not
 * need it at the moment of a search enough to spend the machine on it
 * unasked; a search catches up either way.
 */
let timer: number | undefined;
let behind: AbortController | null = null;
export function keepIndexed(pause = 8000) {
  let last = graph.get().nodes;
  const stop = graph.subscribe(() => {
    const now = graph.get().nodes;
    if (now === last) return;
    last = now;
    behind?.abort();
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (ui.get().writeWith !== "ollama" || running) return;
      const model = await embedder();
      if (!model) return;
      behind = new AbortController();
      try {
        running = indexBook(model, behind.signal);
        await running;
      } catch {
        /* stopped by the next change, or Ollama went away: the next pause tries again */
      } finally {
        running = null;
        behind = null;
      }
    }, pause);
  });
  return () => {
    stop();
    clearTimeout(timer);
    behind?.abort();
  };
}
