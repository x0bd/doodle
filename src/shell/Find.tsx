import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, CloseIcon } from "../icons";
import { graph } from "../state/graph";
import { commit } from "../state/history";
import { findAll, replaceAll, type FindOptions, type Hit } from "../state/find";
import { revealAt } from "../state/reveal";
import { ui, closeFind } from "../state/ui";
import { nav, enter } from "../state/nav";
import { say } from "../state/notice";
import { KINDS } from "../graph/kinds";

const WHERE: Record<Hit["field"], string> = { text: "", summary: "its line", description: "description", name: "name", title: "title" };

/**
 * Find and replace across the book (PLAN.md M2.6, ⌘F): a card beside the
 * words, not a sheet over them — it stays while you go from hit to hit.
 * Every hit in context, by where it is; one goes to its words, selected;
 * Replace all is one journal entry (⌘Z takes it all back), and the beats
 * tied to what changed follow their words.
 */
export function Find() {
  const open = ui.use((u) => u.find);
  const g = graph.use();
  const [q, setQ] = useState("");
  const [to, setTo] = useState("");
  const [o, setO] = useState<FindOptions>({});
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => input.current?.select());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeFind();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const found = useMemo(() => (open && q ? findAll(g, q, o) : []), [open, g, q, o]);
  if (!open) return null;
  const hits = typeof found === "string" ? [] : found;
  const problem = typeof found === "string" && q ? found : null;
  // the hits by the card they are in, in the book's order
  const groups: { id: string; hits: Hit[] }[] = [];
  for (const h of hits) {
    const last = groups[groups.length - 1];
    if (last?.id === h.node) last.hits.push(h);
    else groups.push({ id: h.node, hits: [h] });
  }

  const go = (h: Hit) => {
    const n = g.nodes[h.node];
    if (!n) return;
    // in the manuscript, a chapter's words are already here; elsewhere, open the card
    const here = ui.get().read && n.kind === "chapter" && !nav.get().focus;
    if (!here && nav.get().focus !== n.id) enter(n.id);
    if (h.field === "text") requestAnimationFrame(() => revealAt(n.id, h.start, h.end));
  };
  const replaceOne = (h: Hit) => {
    const r = replaceAll(graph.get(), q, to, o, h);
    if (typeof r === "string" || !r.count) return;
    commit("Replace", () => graph.set((x) => ({ ...x, nodes: r.nodes })));
  };
  const replaceEvery = () => {
    const r = replaceAll(graph.get(), q, to, o);
    if (typeof r === "string") return say(r);
    if (!r.count) return;
    commit(`Replace ${r.count}`, () => graph.set((x) => ({ ...x, nodes: r.nodes })));
    say(`Replaced ${r.count === 1 ? "one" : r.count} — ⌘Z puts ${r.count === 1 ? "it" : "them all"} back.`);
  };
  const toggle = (k: keyof FindOptions) => setO((x) => ({ ...x, [k]: !x[k] }));

  return (
    <aside className="find card" aria-label="Find and replace">
      <div className="find-row">
        <input ref={input} className="find-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in the book" spellCheck={false} aria-label="Find" />
        <span className="find-n px">{q ? (problem ? "—" : hits.length >= 2000 ? "2000+" : hits.length) : ""}</span>
        <button className="pill-icon find-x" onClick={closeFind} aria-label="Close" title="Close — Esc">
          <Icon icon={CloseIcon} size={12} strokeWidth={2} />
        </button>
      </div>
      <div className="find-row">
        <input className="find-in" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Replace with" spellCheck={false} aria-label="Replace with" />
        <button className="pill pill-sm" onClick={replaceEvery} disabled={!hits.length}>
          Replace all
        </button>
      </div>
      <div className="find-opts" role="group" aria-label="How to match">
        <button className={`find-opt${o.cased ? " on" : ""}`} aria-pressed={!!o.cased} onClick={() => toggle("cased")} title="Match case">
          Aa
        </button>
        <button className={`find-opt${o.whole ? " on" : ""}`} aria-pressed={!!o.whole} onClick={() => toggle("whole")} title="Whole words">
          Whole words
        </button>
        <button className={`find-opt px${o.regex ? " on" : ""}`} aria-pressed={!!o.regex} onClick={() => toggle("regex")} title="A regular expression — $1 in the replacement is its first group">
          .*
        </button>
      </div>
      {problem && <p className="find-note">{problem}</p>}
      {q && !problem && !hits.length && <p className="find-note">Not in the book.</p>}
      {groups.length > 0 && (
        <div className="find-list">
          {groups.map((grp) => {
            const n = g.nodes[grp.id];
            return (
              <section key={grp.id} className="find-group">
                <p className="find-of">
                  <span>{n?.title}</span>
                  <span className="find-kind">{n ? KINDS[n.kind].title : ""}</span>
                </p>
                {grp.hits.map((h, i) => (
                  <div key={`${h.field}:${h.start}:${i}`} className="find-hit">
                    <button className="find-go" onClick={() => go(h)} title="Go to it">
                      {WHERE[h.field] && <span className="find-field">{WHERE[h.field]} · </span>}
                      <span>{h.before.length >= 40 ? "…" : ""}{h.before}</span>
                      <mark className="find-mark">{h.match}</mark>
                      <span>{h.after}</span>
                    </button>
                    <button className="pill pill-sm find-one" onClick={() => replaceOne(h)} title="Replace this one">
                      Replace
                    </button>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}
