/**
 * Anchors. A beat made from a passage stays tied to the words it came
 * from. The tie is the words themselves — quoted, with the offset they
 * were taken at — not an index that a single keystroke would break, so
 * it survives ordinary editing and says so honestly when it cannot.
 */
import type { GraphNode, GraphState } from "./graph";
import { childrenOf, graph } from "./graph";
import { commit } from "./history";
import { createStore } from "./store";
import { plain, formOf } from "../writer/markup";

export interface Anchor {
  /** whose words these are */
  node: string;
  /** the words themselves, as they were when the tie was made */
  text: string;
  /** where they were then — a hint, for when the same words appear twice */
  at: number;
}

export interface Found {
  start: number;
  end: number;
  /** the words moved but read the same; the tie held */
  shifted: boolean;
  /** found by their shape, not to the letter — the passage was edited */
  loose: boolean;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** every place `needle` sits in `hay`, whole-string */
function all(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i);
  return out;
}

/** the one nearest to where it used to be */
const nearest = (places: number[], at: number) =>
  places.reduce((best, p) => (Math.abs(p - at) < Math.abs(best - at) ? p : best), places[0]);

/**
 * Where the anchored words are now, if they still are. To the letter
 * first; then ignoring how the whitespace fell; then by the first and
 * last few words, which finds a passage that was edited in the middle.
 */
export function locate(text: string, anchor: Anchor): Found | null {
  const want = anchor.text;
  if (!want.trim()) return null;

  const exact = all(text, want);
  if (exact.length) {
    const start = nearest(exact, anchor.at);
    return { start, end: start + want.length, shifted: start !== anchor.at, loose: false };
  }

  // the same words, spaced differently: match on a squashed copy and map back
  const map: number[] = [];
  let flat = "";
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (space || !flat) continue;
      space = true;
      continue;
    }
    if (space) {
      flat += " ";
      map.push(i);
      space = false;
    }
    flat += c;
    map.push(i);
  }
  const flatWant = squash(want);
  const soft = all(flat, flatWant);
  if (soft.length) {
    const i = nearest(soft, 0);
    const start = map[i] ?? 0;
    const end = (map[i + flatWant.length - 1] ?? start) + 1;
    return { start, end, shifted: true, loose: false };
  }

  // edited in the middle: hold it by its ends
  const words = flatWant.split(" ");
  if (words.length >= 8) {
    const head = words.slice(0, 4).join(" ");
    const tail = words.slice(-4).join(" ");
    const h = flat.indexOf(head);
    const t = h >= 0 ? flat.indexOf(tail, h + head.length) : -1;
    if (h >= 0 && t >= 0) {
      const start = map[h] ?? 0;
      const end = (map[t + tail.length - 1] ?? start) + 1;
      return { start, end, shifted: true, loose: true };
    }
  }
  return null;
}

export interface Tied {
  node: GraphNode;
  anchor: Anchor;
  found: Found | null;
}

/** the children of this node that are tied to its words, in the order
 *  they appear in them; the adrift ones last, in their own order */
export function tiedTo(g: GraphState, id: string): Tied[] {
  // the words as read — markup away — since that is what was selected
  const n0 = g.nodes[id];
  const text = n0 ? plain(String(n0.data.text ?? ""), formOf(n0.data)) : "";
  const out: Tied[] = [];
  for (const c of childrenOf(g, id)) {
    const n = g.nodes[c];
    const a = n.anchor;
    if (a && a.node === id) out.push({ node: n, anchor: a, found: locate(text, a) });
  }
  return out.sort((a, b) => {
    if (!a.found && !b.found) return a.node.seq - b.node.seq;
    if (!a.found) return 1;
    if (!b.found) return -1;
    return a.found.start - b.found.start;
  });
}

/** Tie a node to a passage of its parent's words. */
export function tie(id: string, node: string, text: string, at: number) {
  commit("Tie", () =>
    graph.set((g) => (g.nodes[id] ? { ...g, nodes: { ...g.nodes, [id]: { ...g.nodes[id], anchor: { node, text, at } } } } : g)),
  );
}

/** Let a node go: it keeps its words, it is simply no longer tied. */
export function untie(id: string) {
  commit("Untie", () =>
    graph.set((g) => {
      const n = g.nodes[id];
      if (!n?.anchor) return g;
      const { anchor: _gone, ...rest } = n;
      return { ...g, nodes: { ...g.nodes, [id]: rest as GraphNode } };
    }),
  );
}

/** What the pointer is doing with a tie, while it does it: the beat under
 *  it, and the beat waiting for a passage to be chosen. Never remembered. */
export const held = createStore<{ beat: string | null; tying: string | null }>({ beat: null, tying: null });
export const holdBeat = (beat: string | null) => held.set((h) => ({ ...h, beat }));
export const askToTie = (tying: string | null) => held.set((h) => ({ ...h, tying }));
