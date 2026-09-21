/**
 * The native menu bar reports each of Doodle's items by id; this is where
 * the ids become actions. Anything not listed here is a platform item and
 * the platform already did the work.
 */
import { listen } from "@tauri-apps/api/event";
import { openSettings, toggleInspector, toggleNavigator, togglePanes, toggleTheme } from "../state/ui";
import { fitAll, zoomActual, zoomIn, zoomOut } from "../canvas/view";
import { newGraph, openDialog, save, saveAs } from "../state/doc";
import { redo, undo } from "../state/history";
import { deleteSelected, duplicateSelected, selectAll } from "../state/graph";
import { clearQueue, enqueue } from "../state/jobs";
import { inTauri } from "./fs";

const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

export const actions: Record<string, () => void> = {
  "app.settings": openSettings,
  "file.new": newGraph,
  "file.open": () => void openDialog(),
  "file.save": () => void save(),
  "file.save-as": () => void saveAs(),
  // inside a field the platform's own text undo applies; on the field, the journal's
  "edit.undo": () => (typing() ? document.execCommand("undo") : undo()),
  "edit.redo": () => (typing() ? document.execCommand("redo") : redo()),
  "edit.duplicate": () => !typing() && duplicateSelected(),
  "edit.delete": () => !typing() && deleteSelected(),
  "edit.select-all": () => (typing() ? document.execCommand("selectAll") : selectAll()),
  "graph.run": () => enqueue(),
  "graph.stop": clearQueue,
  "view.zoom-in": zoomIn,
  "view.zoom-out": zoomOut,
  "view.zoom-fit": fitAll,
  "view.zoom-100": zoomActual,
  "view.navigator": toggleNavigator,
  "view.inspector": toggleInspector,
  "view.panes": togglePanes,
  "view.theme": toggleTheme,
};

export function listenToMenu() {
  if (!inTauri) return devKeys();
  const off = listen<string>("menu", (e) => {
    const act = actions[e.payload];
    if (act) act();
    else console.info("[menu]", e.payload);
  });
  return () => {
    off.then((f) => f());
  };
}

/** In a browser there is no menu bar, so the accelerators are keys here. */
function devKeys() {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    const id =
      k === "z" ? (e.shiftKey ? "edit.redo" : "edit.undo")
      : k === "d" ? "edit.duplicate"
      : k === "a" ? "edit.select-all"
      : k === "s" ? "file.save"
      : k === "=" || k === "+" ? "view.zoom-in"
      : k === "-" ? "view.zoom-out"
      : k === "0" ? "view.zoom-fit"
      : k === "1" ? "view.zoom-100"
      : k === "," ? "app.settings"
      : k === "enter" ? "graph.run"
      : k === "." ? "graph.stop"
      : null;
    if (!id) return;
    if (typing() && (id === "edit.undo" || id === "edit.redo" || id === "edit.select-all")) return;
    e.preventDefault();
    actions[id]();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
