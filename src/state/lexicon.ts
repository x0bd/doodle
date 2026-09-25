/**
 * The book's own words (PLAN.md M2.8): what the spelling checker must not
 * mark — every name of the people, places, styles and shots in it (so
 * Mara and Tom Keel are never red), and the words the writer taught it
 * (kept in the project, `graph.json` → `words`). Words ignored are this
 * session's only.
 */
import { createStore } from "./store";
import type { GraphState } from "./graph";

/** the words taught to this book */
export const learned = createStore<string[]>([]);
/** the words ignored while it is open */
export const ignored = createStore<string[]>([]);

const NAMED = new Set(["character", "location", "object", "style", "shot"]);
const parts = (s: string) => s.split(/[^\p{L}\p{M}'’-]+/u).filter(Boolean);

/** Every word the book knows that a dictionary might not, lowercased. */
export function lexicon(g: Pick<GraphState, "nodes">, taught: string[] = [], passed: string[] = []): Set<string> {
  const out = new Set<string>();
  const add = (w: string) => {
    const k = w.toLowerCase().replace(/[’]/g, "'");
    out.add(k);
    // a possessive or a hyphenated name is known by its parts too
    out.add(k.replace(/'s$/, ""));
    for (const p of k.split("-")) if (p) out.add(p);
  };
  for (const n of Object.values(g.nodes)) {
    if (!NAMED.has(n.kind)) continue;
    for (const w of parts(n.title)) add(w);
    if (typeof n.data.name === "string") for (const w of parts(n.data.name)) add(w);
  }
  for (const w of taught) add(w);
  for (const w of passed) add(w);
  return out;
}

/** does the book know this word — as written, or as a possessive of one it knows */
export function knows(words: Set<string>, word: string): boolean {
  const k = word.toLowerCase().replace(/[’]/g, "'");
  return words.has(k) || words.has(k.replace(/'s$/, ""));
}

export const learn = (word: string) => learned.set((l) => (l.includes(word) ? l : [...l, word].sort()));
export const ignore = (word: string) => ignored.set((l) => (l.includes(word) ? l : [...l, word]));
