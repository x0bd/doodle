import { useEffect, useRef, useState } from "react";
import { Icon, PlusIcon, MinusIcon } from "../icons";
import { stats, wordsOn, streak, readingTime, bookWords, setGoal } from "../state/stats";
import { graph } from "../state/graph";
import { nav } from "../state/nav";
import { saveSoon } from "../state/doc";
import { countWords, formOf } from "../writer/markup";

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The day's writing, in the foot while you write (PLAN.md M2.5): a ring
 * that fills toward the daily goal and the words written today. Opened:
 * today, this chapter, the book, how long each takes to read, the streak,
 * and the goal. Ink on the tint — the ring is a reading, not a reward.
 */
export function Goal() {
  const s = stats.use();
  const g = graph.use();
  const focus = nav.use((n) => n.focus);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // the day turns over at midnight even when nothing is typed
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const today = wordsOn(s);
  const share = s.goal ? Math.min(1, today / s.goal) : 0;
  const here = focus ? g.nodes[focus] : undefined;
  const chapter = here && (here.kind === "chapter" || here.kind === "page") ? countWords(String(here.data.text ?? ""), formOf(here.data)) : null;
  const book = bookWords(g);
  const days = streak(s);
  const r = 7;
  const c = 2 * Math.PI * r;
  const change = (by: number) => {
    setGoal(Math.max(0, s.goal + by));
    saveSoon();
  };

  return (
    <div className="goal" ref={box}>
      <button className="goal-key" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Today's writing">
        <svg className="goal-ring" width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <circle className="goal-track" cx="9" cy="9" r={r} />
          {s.goal > 0 && <circle className="goal-fill" cx="9" cy="9" r={r} strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 9 9)" />}
        </svg>
        <span className="goal-n px">{s.goal ? `${fmt(today)} / ${fmt(s.goal)}` : `${fmt(today)} today`}</span>
      </button>
      {open && (
        <div className="goal-pop card" role="dialog" aria-label="Today's writing">
          <div className="goal-rows">
            <p className="goal-row">
              <span>Today</span>
              <span className="px">{fmt(today)} words</span>
            </p>
            {chapter !== null && (
              <p className="goal-row">
                <span>{here!.title}</span>
                <span className="px">
                  {fmt(chapter)} · {readingTime(chapter)}
                </span>
              </p>
            )}
            <p className="goal-row">
              <span>The book</span>
              <span className="px">
                {fmt(book)} · {readingTime(book)}
              </span>
            </p>
            <p className="goal-row">
              <span>In a row</span>
              <span className="px">{days === 1 ? "1 day" : `${days} days`}</span>
            </p>
          </div>
          <div className="goal-set">
            <span>A day</span>
            <span className="goal-step">
              <button className="pill-icon" aria-label="Lower the goal" onClick={() => change(-250)} disabled={!s.goal}>
                <Icon icon={MinusIcon} size={13} strokeWidth={2} />
              </button>
              <span className="px goal-val">{s.goal ? fmt(s.goal) : "No goal"}</span>
              <button className="pill-icon" aria-label="Raise the goal" onClick={() => change(250)}>
                <Icon icon={PlusIcon} size={13} strokeWidth={2} />
              </button>
            </span>
          </div>
          <p className="goal-note">Today is what the book has gained since the day began. Cutting doesn't take back what you wrote.</p>
        </div>
      )}
    </div>
  );
}
