import { useEffect } from "react";
import { Icon, CloseIcon } from "../icons";
import { ui, closeShortcuts } from "../state/ui";

const GROUPS: { name: string; keys: [string, string][] }[] = [
  {
    name: "The field",
    keys: [
      ["Scroll · Space-drag · middle-drag", "Pan"],
      ["Pinch · ⌘ scroll · − +", "Zoom"],
      ["⌘0 · ⌘1", "Fit · actual size"],
      ["Drag on empty · ⇧", "Select many · add"],
      ["Double-click empty · right-click", "Add here · the menu"],
      ["L held", "The lens"],
    ],
  },
  {
    name: "A node",
    keys: [
      ["⏎ · double-click", "Open as a page"],
      ["⎋", "Let go · rise"],
      ["Arrows · ⇧ arrows", "Nudge · by ten"],
      ["⌘D · ⌫", "Duplicate · delete"],
      ["⌥-drop on a card", "Move inside it"],
      ["C with two selected", "Connect them"],
    ],
  },
  {
    name: "Wires",
    keys: [
      ["Drag from a port", "A wire; it snaps"],
      ["Let go on the field", "Offer what takes it"],
      ["Drag off an input", "Pick its wire up"],
      ["Click · double-click", "Select · cut"],
    ],
  },
  {
    name: "The work",
    keys: [
      ["⏎ in the bar · /", "Run, bar away · bar back"],
      ["⌘⏎ · ⌘.", "Run · stop"],
      ["⌘K", "Search"],
      ["⌘Z · ⇧⌘Z", "Undo · redo"],
      ["⌘S · ⌘O · ⌘N", "Save · open · new"],
      ["Tab · ⌘,", "Panes · settings"],
      ["@ in a page", "Name a thing"],
    ],
  },
];

/** Every key Doodle answers to, on one sheet. */
export function Shortcuts() {
  const open = ui.use((s) => s.shortcuts);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), closeShortcuts());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="veil">
      <button className="veil-hit" onClick={closeShortcuts} aria-label="Close" tabIndex={-1} />
      <div className="sheet con keys" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <header className="con-head">
          <h2 className="con-name">Keyboard shortcuts</h2>
          <span className="con-fig" />
          <button className="con-btn" onClick={closeShortcuts} aria-label="Close" title="Close — Esc">
            <Icon icon={CloseIcon} size={13} strokeWidth={2} />
          </button>
        </header>
        <div className="keys-grid">
          {GROUPS.map((g) => (
            <section key={g.name} className="keys-group">
              <p className="group-head">{g.name}</p>
              <dl className="keys-list">
                {g.keys.map(([k, what]) => (
                  <div key={k} className="keys-row">
                    <dt className="px">{k}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
