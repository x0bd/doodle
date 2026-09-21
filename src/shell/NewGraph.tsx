import { useEffect } from "react";
import { Icon, CloseIcon, BookIcon, MangaIcon, FilmIcon, ImageIcon, type IconSvgElement } from "../icons";
import { TEMPLATES, type TemplateId } from "../graph/templates";
import { ui, closeChooser } from "../state/ui";
import { doc, newGraph } from "../state/doc";
import { fitAll } from "../canvas/view";
import { graph } from "../state/graph";

const GLYPH: Record<TemplateId, IconSvgElement> = { images: ImageIcon, film: FilmIcon, manga: MangaIcon, book: BookIcon };

/** The chooser: the four base workflows, one to start from. */
export function NewGraph() {
  const open = ui.use((s) => s.chooser);
  const empty = graph.use((g) => g.order.length === 0);
  const dirty = doc.use((d) => d.dirty);

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

  const pick = (id: TemplateId) => {
    if (dirty && !empty && !window.confirm("Start a new graph? Unsaved changes will be lost.")) return;
    newGraph(id);
    closeChooser();
    requestAnimationFrame(fitAll);
  };

  return (
    <div className="veil">
      <button className="veil-hit" onClick={() => !empty && closeChooser()} aria-label="Close" tabIndex={-1} />
      <div className="sheet con chooser" role="dialog" aria-modal="true" aria-label="New graph">
        <header className="con-head">
          <h2 className="con-name">New graph</h2>
          <span className="con-fig" />
          {!empty && (
            <button className="con-btn" onClick={closeChooser} aria-label="Close" title="Close — Esc">
              <Icon icon={CloseIcon} size={13} strokeWidth={2} />
            </button>
          )}
        </header>
        <div className="tpls">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="tpl" onClick={() => pick(t.id)}>
              <span className="tpl-glyph">
                <Icon icon={GLYPH[t.id]} size={22} strokeWidth={1.6} />
              </span>
              <span className="tpl-name">{t.name}</span>
              <span className="tpl-note">{t.note}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
