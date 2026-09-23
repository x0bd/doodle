/**
 * The native menu bar reports each of Doodle's items by id; this is where
 * the ids become actions. Anything not listed here is a platform item and
 * the platform already did the work.
 */
import { listen } from "@tauri-apps/api/event";
import { openChooser, openPalette, openSettings, openShortcuts, toggleInspector, toggleNavigator, togglePanes, toggleTheme } from "../state/ui";
import { fitAll, zoomActual, zoomIn, zoomOut } from "../canvas/view";
import { painted } from "./log";
import { step } from "../state/nav";
import { openDialog, save, saveAs, duplicate, reveal, exportText, exportArchiveFile, importArchiveFile, openRecent, clearRecent, tidyAssets, openSample } from "../state/doc";
import { redo, undo } from "../state/history";
import { deleteSelected, duplicateSelected, selectAll } from "../state/graph";
import { clearQueue, enqueue } from "../state/jobs";
import { inTauri, revealPath } from "./fs";
import { logPath } from "./log";
import { measure } from "../state/bench";
import { makeDiagnostics } from "../state/diagnostics";
import { editorUndo, editorRedo } from "../writer/Editor";
import { keepVersionHere, openVersions } from "../state/versions";

const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

export const actions: Record<string, () => void> = {
  "app.settings": openSettings,
  "file.new": openChooser,
  "file.open": () => void openDialog(),
  "file.save": () => void save(),
  "file.save-as": () => void saveAs(),
  "file.export": () => void exportText(),
  "file.archive": () => void exportArchiveFile(),
  "file.unarchive": () => void importArchiveFile(),
  "file.duplicate": () => void duplicate(),
  "file.reveal": () => void reveal(),
  "file.keep-version": () => void keepVersionHere(),
  "file.versions": () => openVersions(),
  "file.tidy": () => void tidyAssets(),
  "view.search": openPalette,
  "view.prev": () => step(-1, () => requestAnimationFrame(fitAll)),
  "view.next": () => step(1, () => requestAnimationFrame(fitAll)),
  "help.shortcuts": openShortcuts,
  "help.measure": () => void measure(),
  "help.diagnostics": () => void makeDiagnostics(),
  "help.sample": () => void openSample().then(() => painted()).then(fitAll),
  "help.logs": () => void logPath().then((p) => (p ? revealPath(p) : undefined)),
  // inside a field the platform's own text undo applies; on the field, the journal's
  // a writer has its own history; any other field the platform's text undo
  "edit.undo": () => editorUndo() || (typing() ? document.execCommand("undo") : undo()),
  "edit.redo": () => editorRedo() || (typing() ? document.execCommand("redo") : redo()),
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

/** The menu bar's listener belongs to the window, not to a component.
 *  React's lifecycle — and a long run of hot patches over it — must never
 *  be able to leave the platform's own menu talking to nobody, which is
 *  exactly what happened once. It is attached once, kept on `window` so a
 *  replaced module can take back the old one first, and never removed. */
const KEPT = "__doodleMenu";
type Kept = { ready?: Promise<() => void> };

export function listenToMenu() {
  if (!inTauri) return devKeys();
  const w = window as unknown as Record<string, Kept | undefined>;
  const kept: Kept = w[KEPT] ?? {};
  w[KEPT] = kept;
  // one listener, ever: the one before is gone before this one arrives, even
  // when a second mount starts before the first has finished listening (as
  // React's development mount does) — two ran every menu item twice, and a
  // question asked on the way (Save changes?) was asked twice
  const before = kept.ready;
  kept.ready = (async () => {
    if (before) (await before)();
    return listen<string>("menu", (e) => {
      const act = actions[e.payload];
      const n = /^recent\.(\d+)$/.exec(e.payload);
      if (act) act();
      else if (n) void openRecent(Number(n[1]));
      else if (e.payload === "recent.clear") clearRecent();
      else console.info("[menu]", e.payload);
    });
  })();
  // the component may come and go; the listener stays
  return () => {};
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
      : k === "e" && e.shiftKey ? "file.export"
      : k === "s" ? "file.save"
      : k === "n" ? "file.new"
      : k === "k" ? "view.search"
      : k === "[" && e.shiftKey ? "view.prev"
      : k === "]" && e.shiftKey ? "view.next"
      : k === "/" ? "help.shortcuts"
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
