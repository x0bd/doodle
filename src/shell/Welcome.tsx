import { useEffect, useState } from "react";
import { Icon, CloseIcon, BookIcon, MangaIcon, FilmIcon, ImageIcon, GraphIcon, BoardIcon, type IconSvgElement } from "../icons";
import { startFromMaterial } from "../state/gather";
import { TEMPLATES, SAMPLE, type TemplateId } from "../graph/templates";
import { providers } from "../providers/registry";
import { probe, type Found } from "../providers/found";
import { ui, closeChooser } from "../state/ui";
import { newGraph, openDialog, openFrom, recent, forget, mayLeave, type Seen } from "../state/doc";
import { graph } from "../state/graph";
import { fitAll } from "../canvas/view";
import { enter } from "../state/nav";
import { graphExists, inTauri } from "../platform/fs";

const GLYPH: Record<TemplateId, IconSvgElement> = { images: ImageIcon, film: FilmIcon, manga: MangaIcon, book: BookIcon, sample: BookIcon, material: BoardIcon };

/** The first time Doodle opens on a Mac — nothing opened before, never
 *  welcomed — the welcome leads with the sample book and says what it
 *  found to write and draw with (PLAN.md M1.7). */
const WELCOMED = "doodle.welcomed.v1";
function firstRun() {
  try {
    return !localStorage.getItem(WELCOMED) && recent().length === 0;
  } catch {
    return false;
  }
}
function welcomed() {
  try {
    localStorage.setItem(WELCOMED, String(Date.now()));
  } catch {
    /* a private window */
  }
}

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
  const [first, setFirst] = useState(false);
  const [found, setFound] = useState<Record<string, Found> | null>(null);

  useEffect(() => {
    if (!open) return;
    setSeen(recent());
    const f = firstRun();
    setFirst(f);
    if (f) probe().then(setFound, () => setFound({}));
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

  const pick = async (id: TemplateId, blank = false) => {
    if (!(await ask())) return;
    welcomed();
    newGraph(id, blank);
    closeChooser();
    // a blank book is its first chapter, open to write in; the rest, the whole field
    if (blank && id === "book") enter("ch1");
    else requestAnimationFrame(fitAll);
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
  const openOne = async () => {
    welcomed();
    await openDialog();
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
            <p className="welcome-note">
              {first ? "A book, a film or a set of pictures as a field you can zoom into — and write inside." : "A recursively zoomable creative document."}
            </p>
          </div>
        </header>

        <div className="welcome-cols">
          <section className="welcome-col">
            <h2 className="welcome-of">Start</h2>
            <div className="list">
              {first && (
                <button className="welcome-row list-row lead tpl-book" onClick={() => void pick("sample")}>
                  <span className="welcome-glyph">
                    <Icon icon={BookIcon} size={15} strokeWidth={1.7} />
                  </span>
                  <span className="welcome-what">
                    <span className="welcome-title">{SAMPLE.name}</span>
                    <span className="welcome-sub">A sample book with a chapter already written. Open it and look around — a minute is enough.</span>
                  </span>
                </button>
              )}
              {/* from what you have: documents, notes, pictures — onto a board in a new book */}
              <button className="welcome-row list-row tpl-material" onClick={() => void (inTauri ? startFromMaterial() : undefined)} disabled={!inTauri}>
                <span className="welcome-glyph">
                  <Icon icon={BoardIcon} size={15} strokeWidth={1.7} />
                </span>
                <span className="welcome-what">
                  <span className="welcome-title">Start from material…</span>
                  <span className="welcome-sub">Your notes, drafts, research and pictures, laid on a board in a new book — or drop them here.</span>
                </span>
              </button>
              {/* each workflow starts blank — its parts, wired, empty — or as a worked example */}
              {TEMPLATES.map((t) => (
                <div key={t.id} className={`welcome-pair tpl-${t.id}`}>
                  <button className="welcome-row list-row" onClick={() => void pick(t.id, true)} title={`A new ${t.name.toLowerCase()}, empty`}>
                    <span className="welcome-glyph">
                      <Icon icon={GLYPH[t.id]} size={15} strokeWidth={1.7} />
                    </span>
                    <span className="welcome-what">
                      <span className="welcome-title">{t.name}</span>
                      <span className="welcome-sub">{t.blankNote ?? t.note}</span>
                    </span>
                  </button>
                  <button className="pill pill-sm welcome-example" onClick={() => void pick(t.id)} title={`${t.note} Filled in, to look around.`}>
                    Example
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="welcome-col">
            {first && (
              <>
                <h2 className="welcome-of">What it can use</h2>
                <div className="list welcome-found">
                  {providers.map((p) => {
                    const f = found?.[p.descriptor.id];
                    return (
                      <div key={p.descriptor.id} className="welcome-row list-row still">
                        <span className="welcome-what">
                          <span className="welcome-title">{p.descriptor.id === "mock" ? "The stand-in" : p.descriptor.name}</span>
                          <span className="welcome-sub">{f ? f.says.split(/(?<=\.)\s/)[0] : "Looking…"}</span>
                        </span>
                        <span className={`chip${f?.ready ? " on" : ""}`}>{f?.chip ?? "…"}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="welcome-sub welcome-aside">Nothing here is needed to write. Settings › Providers says how to add what is missing.</p>
              </>
            )}
            {!first && <h2 className="welcome-of">{seen.length ? "Lately" : "Open"}</h2>}
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
              <button className="welcome-row list-row quiet" onClick={() => void openOne()}>
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
