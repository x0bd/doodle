import { useEffect, useState } from "react";
import { Icon, CloseIcon, BookIcon, MangaIcon, FilmIcon, ImageIcon, GraphIcon, type IconSvgElement } from "../icons";
import { TEMPLATES, type TemplateId } from "../graph/templates";
import { ui, closeChooser } from "../state/ui";
import { newGraph, openDialog, openFrom, recent, forget, mayLeave, type Seen } from "../state/doc";
import { graph } from "../state/graph";
import { fitAll } from "../canvas/view";
import { graphExists, inTauri } from "../platform/fs";

const GLYPH: Record<TemplateId, IconSvgElement> = { images: ImageIcon, film: FilmIcon, manga: MangaIcon, book: BookIcon };

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** where a graph lives, without its own name on the end */
const under = (path: string) => path.split("/").slice(-2, -1)[0] ?? "";

/** The welcome: the whole window, once, before there is anything to look
 *  at. What you were working on, then what you could start. Nothing is
 *  drawn — the groups are held apart by distance and by tone. */
export function Welcome() {
  const open = ui.use((s) => s.chooser);
  const empty = graph.use((g) => g.order.length === 0);
  const [seen, setSeen] = useState<Seen[]>([]);

  useEffect(() => {
    if (open) setSeen(recent());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !empty) {
        e.preventDefault();
        closeChooser();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, empty]);

  if (!open) return null;

  /** starting something new: a graph never saved is asked about first */
  const ask = mayLeave;

  const pick = async (id: TemplateId) => {
    if (!(await ask())) return;
    newGraph(id);
    closeChooser();
    requestAnimationFrame(fitAll);
  };

  const go = async (r: Seen) => {
    if (!(await ask())) return;
    if (inTauri && !(await graphExists(r.path))) {
      forget(r.path);
      setSeen(recent());
      return;
    }
    if (await openFrom(r.path)) closeChooser();
  };

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Doodle">
      {/* the title line still moves the window, and nothing else does */}
      <div className="welcome-drag" data-tauri-drag-region />
      {!empty && (
        <button className="welcome-x pill-icon" onClick={closeChooser} aria-label="Close" title="Close — Esc">
          <Icon icon={CloseIcon} size={14} strokeWidth={2} />
        </button>
      )}
      <div className="welcome-sheet">
        <header className="welcome-head">
          <span className="welcome-mark">DD</span>
          <div>
            <h1 className="welcome-name">Doodle</h1>
            <p className="welcome-note">A recursively zoomable creative document.</p>
          </div>
        </header>

        <div className="welcome-cols">
          <section className="welcome-col">
            <h2 className="welcome-of">Start</h2>
            <div className="list">
              {TEMPLATES.map((t) => (
                <button key={t.id} className={`welcome-row list-row tpl-${t.id}`} onClick={() => void pick(t.id)}>
                  <span className="welcome-glyph">
                    <Icon icon={GLYPH[t.id]} size={15} strokeWidth={1.7} />
                  </span>
                  <span className="welcome-what">
                    <span className="welcome-title">{t.name}</span>
                    <span className="welcome-sub">{t.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="welcome-col">
            <h2 className="welcome-of">{seen.length ? "Lately" : "Open"}</h2>
            <div className="list">
              {seen.map((r) => (
                <button key={r.path} className="welcome-row list-row" onClick={() => void go(r)} title={r.path}>
                  <span className="welcome-glyph plain">
                    <Icon icon={GraphIcon} size={15} strokeWidth={1.7} />
                  </span>
                  <span className="welcome-what">
                    <span className="welcome-title">{r.name}</span>
                    <span className="welcome-sub">
                      {ago(r.at)}
                      {under(r.path) && ` · in ${under(r.path)}`}
                    </span>
                  </span>
                </button>
              ))}
              <button className="welcome-row list-row quiet" onClick={() => void openDialog()}>
                <span className="welcome-glyph plain" />
                <span className="welcome-what">
                  <span className="welcome-title">Open a graph…</span>
                  <span className="welcome-sub">A Doodle project, or double-click one in the Finder</span>
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
