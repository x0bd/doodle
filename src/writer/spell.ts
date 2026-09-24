/**
 * Asking the Mac about spelling (`spell.rs`), a paragraph at a time: what
 * it said is kept by the paragraph's words, so typing in one asks again
 * about that one alone — gathered, a moment after the typing pauses, into
 * one question. Outside the app (a browser) nothing is asked and nothing
 * is marked.
 */
import { invoke } from "@tauri-apps/api/core";
import { createStore } from "../state/store";
import { inTauri } from "../platform/fs";

type Ranges = [number, number][];
const said = new Map<string, Ranges>();
const asking = new Set<string>();
let timer: number | undefined;

/** turns over whenever an answer arrives — decorations are drawn again */
export const spellTick = createStore(0);

/** where a paragraph's misspelt words are, if the Mac has said; asked if not */
export function misspelt(par: string): Ranges | undefined {
  if (!inTauri || !par.trim()) return undefined;
  const hit = said.get(par);
  if (hit) return hit;
  asking.add(par);
  clearTimeout(timer);
  timer = window.setTimeout(ask, 350);
  return undefined;
}

async function ask() {
  const list = [...asking];
  asking.clear();
  if (!list.length) return;
  try {
    const r = await invoke<Ranges[]>("spell_check", { paragraphs: list });
    list.forEach((p, i) => said.set(p, r[i] ?? []));
    if (said.size > 6000) for (const k of [...said.keys()].slice(0, 2000)) said.delete(k);
    spellTick.set((n) => n + 1);
  } catch {
    /* no answer: nothing marked */
  }
}

export const guesses = (word: string) => (inTauri ? invoke<string[]>("spell_guesses", { word }).catch(() => []) : Promise.resolve([] as string[]));
