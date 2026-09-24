/**
 * A passage to show: a find's hit (M2.6) — which card, and where in its
 * words as they are written. The writer showing that card's words selects
 * it and brings it into view (`Prose` → `Editor`'s `reveal`).
 */
import { createStore } from "./store";

export interface Reveal {
  node: string;
  /** where, in the words as written (Markdown and all) */
  start: number;
  end: number;
  key: number;
}

export const reveal = createStore<Reveal | null>(null);
let n = 0;
export const revealAt = (node: string, start: number, end: number) => reveal.set({ node, start, end, key: ++n });
