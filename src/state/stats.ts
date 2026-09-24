/**
 * Goals and stats (PLAN.md M2.5): how much of the book there is, how much
 * was written today, a daily goal, how many days in a row it was met, and
 * how long it takes to read.
 *
 * "Today" is the day's **net** change to the book's words — its count now
 * against the count at the day's first look (local midnight to midnight),
 * never below nothing: cutting a paragraph is not written words, but it
 * does not take away what was written either. The days are kept in the
 * project (`graph.json` → `stats`), so a streak goes with the book.
 */
import { createStore } from "./store";
import type { GraphState } from "./graph";
import { countWords, formOf } from "../writer/markup";

export interface Day {
  /** the book's words at the day's first look */
  base: number;
  /** and at its last */
  end: number;
}

export interface Stats {
  /** words a day; 0 is no goal */
  goal: number;
  /** by local date, `2026-09-24` */
  days: Record<string, Day>;
}

export const stats = createStore<Stats>({ goal: 0, days: {} });

/** the local date, as the ledger names it */
export function dayKey(t: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/** every word the book holds: its chapters and its pages, rejected ones not */
export function bookWords(g: Pick<GraphState, "nodes">): number {
  let n = 0;
  for (const x of Object.values(g.nodes)) {
    if (x.status === "rejected" || (x.kind !== "chapter" && x.kind !== "page")) continue;
    n += countWords(String(x.data.text ?? ""), formOf(x.data));
  }
  return n;
}

/** The ledger with today's count set: the day begins where the book stood
 *  the first time today it was looked at. The oldest days go past 400. */
export function noted(s: Stats, total: number, today = dayKey()): Stats {
  const had = s.days[today];
  if (had && had.end === total) return s;
  const days = { ...s.days, [today]: { base: had?.base ?? total, end: total } };
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete days[k];
  return { ...s, days };
}

export const written = (d: Day | undefined) => (d ? Math.max(0, d.end - d.base) : 0);

/** words written on a day */
export const wordsOn = (s: Stats, day = dayKey()) => written(s.days[day]);

/** Days in a row the goal was met (any words, with no goal), counting back
 *  from today — or from yesterday, while today is still under way. */
export function streak(s: Stats, today: Date = new Date()): number {
  const met = (k: string) => written(s.days[k]) >= Math.max(1, s.goal);
  const d = new Date(today);
  if (!met(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (met(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** reading time at 230 words a minute: "4 min", "2 h 5 min" */
export function readingTime(words: number): string {
  const m = Math.max(1, Math.round(words / 230));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

export const setGoal = (goal: number) => stats.set((s) => ({ ...s, goal: Math.max(0, Math.round(goal)) }));
