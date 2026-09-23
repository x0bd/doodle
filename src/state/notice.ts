/**
 * One sentence from Doodle to the person, under the head — something they
 * should know that did not come from what they just did (work recovered,
 * a project that could not be found). One at a time; it stays until it is
 * answered or put away.
 */
import { createStore } from "./store";

export interface Notice {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export const notice = createStore<Notice | null>(null);
let seq = 0;

export function say(text: string, action?: Notice["action"]) {
  notice.set({ id: ++seq, text, action });
}

export function hush() {
  notice.set(null);
}
