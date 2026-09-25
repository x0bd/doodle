/**
 * Chapter gists (PLAN.md M6.2): what happens in each chapter, in a few
 * sentences, written by the local writer in the background and kept fresh
 * — a chapter's gist belongs to its words (a hash of them), so an edited
 * chapter is read again, an unchanged one never. They are kept beside the
 * vectors (`platform/kept.ts`), not in the project: the author's own line
 * for a chapter (`summary`) is theirs; a gist is the agent's.
 *
 * The agent sees them in `doodle_outline`, so a long book has a shape
 * before a word of it is read; a page continued starts from the gist of
 * the chapter before when the author has not written its line.
 *
 * Only while Ollama writes — free, on this Mac — and only when nothing
 * else is asking it: a draft, a job, a search stops the one being written.
 */
import { graph, type GraphNode } from "./graph";
import { ui } from "./ui";
import { hash } from "./passages";
import { recall, keep } from "../platform/kept";
import { pick } from "../providers/registry";
import { log, since } from "../platform/log";

const MIN_WORDS = 250;
const SYSTEM =
  "You keep notes for a novelist on their own book. Summarise the chapter you are given in three to five sentences: who is in it, where it happens, what happens, and what has changed by its end. Plain prose, present tense, names as the book writes them. No judgement, no advice, nothing the chapter does not say.";

const gists = new Map<string, string>();
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const keyOf = (n: GraphNode) => hash(`gist\n${n.title}\n${String(n.data.text ?? "")}`);

/** A chapter's gist, if it has been written for its words as they are. */
export const gistOf = (n: GraphNode): string | undefined => gists.get(keyOf(n));

/** the chapters whose gist is missing or stale, in reading order */
function wanting(): GraphNode[] {
  const g = graph.get();
  return g.order
    .map((id) => g.nodes[id])
    .filter((n) => n?.kind === "chapter" && n.status !== "rejected" && words(String(n.data.text ?? "")) >= MIN_WORDS && !gists.has(keyOf(n)))
    .sort((a, b) => a.seq - b.seq);
}

/** Write one chapter's gist with the writer asked for. */
export async function writeGist(n: GraphNode, signal?: AbortSignal): Promise<string | null> {
  const { provider } = await pick("text.generate", ui.get().writeWith);
  if (provider.descriptor.id !== "ollama") return null;
  const text = String(n.data.text ?? "");
  const t0 = performance.now();
  const gist = (
    await provider.generateText!(
      // a chapter is long: the window is made to hold it, and room to answer
      { prompt: `Chapter "${n.title}"\n\n${text}`, system: SYSTEM, think: false, context: Math.min(65536, Math.max(8192, Math.ceil(words(text) * 1.5) + 1024)) },
      signal ?? new AbortController().signal,
    )
  ).trim();
  if (!gist) return null;
  const key = keyOf(n);
  gists.set(key, gist);
  void keep("gists", [[key, gist]]);
  log("gists", `"${n.title}": ${words(text)} words in ${since(t0)} ms`);
  return gist;
}

/**
 * Keep the gists fresh: a quiet minute after the last change, one chapter
 * at a time while nothing else wants the writer — `busy` says when
 * something does, and the one being written is stopped (it is written
 * again at the next quiet minute).
 */
export function keepGists(busy: () => boolean, quiet = 60_000) {
  let timer: number | undefined;
  let going: AbortController | null = null;
  let last = graph.get().nodes;
  const run = async () => {
    if (going || ui.get().writeWith !== "ollama") return;
    const all = wanting();
    for (const [k, v] of await recall<string>("gists", all.map(keyOf))) gists.set(k, v);
    going = new AbortController();
    try {
      for (const n of wanting()) {
        if (busy() || going.signal.aborted) break;
        await writeGist(n, going.signal);
      }
    } catch {
      /* stopped, or Ollama went away: the next quiet minute tries again */
    } finally {
      going = null;
    }
  };
  const later = () => {
    clearTimeout(timer);
    timer = window.setTimeout(run, quiet);
  };
  const stopGraph = graph.subscribe(() => {
    const now = graph.get().nodes;
    if (now === last) return;
    last = now;
    later();
  });
  // what was written before this launch, there from the start
  void recall<string>("gists", wanting().map(keyOf)).then((m) => m.forEach((v, k) => gists.set(k, v)));
  // stopped the moment something else wants the writer
  const watch = window.setInterval(() => busy() && going?.abort(), 500);
  later();
  return () => {
    stopGraph();
    clearTimeout(timer);
    clearInterval(watch);
    going?.abort();
  };
}
