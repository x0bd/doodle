/**
 * What Doodle has to tell the person, under the head — things they should
 * know that did not come from what they just did (work recovered, a file
 * opened from its backup, an unsaved graph kept). One shows at a time; the
 * rest wait their turn, each until it is answered or put away, so nothing
 * said at launch covers something else said at launch.
 */
import { createStore } from "./store";

export interface Notice {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

/** the one showing first, then those waiting */
export const notices = createStore<Notice[]>([]);
let seq = 0;

/** Say it; the id takes it back (`hush(id)`) when it stops being true. */
export function say(text: string, action?: Notice["action"]): number {
  const had = notices.get().find((n) => n.text === text);
  if (had) return had.id;
  const id = ++seq;
  notices.set((l) => [...l, { id, text, action }].slice(-4));
  return id;
}

/** put away the one showing (or, by id, that one) */
export function hush(id?: number) {
  notices.set((l) => (id === undefined ? l.slice(1) : l.filter((n) => n.id !== id)));
}

/** a new document: what was said about the last one no longer applies */
export function hushAll() {
  notices.set([]);
}
