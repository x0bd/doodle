import { useEffect } from "react";
import { Canvas } from "./canvas/Canvas";
import { Head } from "./shell/Head";
import { Navigator } from "./shell/Navigator";
import { Inspector } from "./shell/Inspector";
import { Foot } from "./shell/Foot";
import { Settings } from "./shell/Settings";
import { Bar } from "./shell/Bar";
import { ui, togglePanes, openChooser, setFocusing } from "./state/ui";
import { listenToMenu } from "./platform/menu";
import { listenForAgent } from "./agent/tools";
import { keepIndexed } from "./state/meaning";
import { keepGists } from "./state/gists";
import { drafts } from "./state/drafts";
import { jobs, pending } from "./state/jobs";
import { doc, launch, openHandedOver, recentMenu } from "./state/doc";
import { fitAll } from "./canvas/view";
import { painted } from "./platform/log";
import { Welcome } from "./shell/Welcome";
import { Palette } from "./shell/Palette";
import { Shortcuts } from "./shell/Shortcuts";
import { Notice } from "./shell/Notice";
import { Versions } from "./shell/Versions";
import { Find } from "./shell/Find";
import { Built } from "./shell/Built";
import { onFileDrop, onOpened, importable, PICTURES } from "./platform/fs";
import { importFiles } from "./state/importing";
import { gatherInto, freeSpot, startFromMaterial } from "./state/gather";
import { graph } from "./state/graph";
import { camera, toWorld } from "./canvas/camera";
import { attachFiles, attachTo } from "./state/assets";
import { nav, reading } from "./state/nav";

export function App() {
  const { navigator, inspector } = ui.use();
  const focus = nav.use((n) => n.focus);
  const read = ui.use((u) => u.read);
  const writing = reading(focus, read);
  // Focus only while writing: leaving the words leaves Focus too
  const focusing = ui.use((u) => u.focusing) && writing;
  const dim = ui.use((u) => u.dim);
  useEffect(() => {
    if (!writing && ui.get().focusing) setFocusing(false);
  }, [writing]);
  useEffect(() => {
    if (!focusing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        e.stopPropagation();
        setFocusing(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focusing]);
  useEffect(listenToMenu, []);
  useEffect(listenForAgent, []);
  useEffect(keepIndexed, []);
  // chapter gists while nothing else wants the local writer
  useEffect(() => keepGists(() => Object.values(drafts.get()).some((d) => d.state === "thinking") || pending(jobs.get()).length > 0), []);
  // what the Finder opened Doodle with; else a graph that was never saved
  // and was being worked on when Doodle stopped; else the last graph if it
  // is still there — with its view — else the templates
  useEffect(() => {
    let live = true;
    recentMenu();
    launch().then((opened) => {
      if (!live) return;
      if (!opened) openChooser();
      // a recovered graph that was never saved has no view of its own yet
      else if (!doc.get().path) void painted().then(fitAll);
    });
    return () => {
      live = false;
    };
  }, []);
  // and whatever the Finder hands over while it runs
  useEffect(() => {
    let off: (() => void) | undefined;
    onOpened(() => void openHandedOver()).then((f) => (off = f));
    return () => off?.();
  }, []);
  // a manuscript dropped on the window is imported into chapters; images go
  // onto the node under them, or onto the page being written
  useEffect(() => {
    let off: (() => void) | undefined;
    onFileDrop(async (paths, at) => {
      const scale = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(at.x / scale, at.y / scale) as HTMLElement | null;
      const under = el?.closest<HTMLElement>("[data-node]")?.dataset.node;
      const focus = nav.get().focus;
      // onto the welcome: a book begun from them
      if (ui.get().chooser) return void startFromMaterial(paths);
      // onto a board — the one open, or a board's card — everything is gathered on it
      const nodes = graph.get().nodes;
      if (under && nodes[under]?.kind === "board") return void gatherInto(under, paths, freeSpot(under));
      if (!under && focus && nodes[focus]?.kind === "board") return void gatherInto(focus, paths, toWorld(camera.get(), { x: at.x / scale, y: at.y / scale }));
      const target = under ?? focus;
      const pictures = paths.filter((p) => PICTURES.test(p));
      const texts = paths.filter(importable);
      if (texts.length) await importFiles(texts);
      if (!target || !pictures.length) return;
      const refs = await attachFiles(pictures);
      attachTo(target, refs);
    }).then((f) => (off = f));
    return () => off?.();
  }, []);

  // Tab hides and shows the panes — unless something is being typed into.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      togglePanes();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className={`win${writing ? " writing" : ""}${focusing ? ` focusing${dim ? " dim" : ""}` : `${navigator ? " nav-on" : ""}${inspector ? " ins-on" : ""}`}`}>
      <Canvas />
      <Head />
      {navigator && <Navigator />}
      {inspector && <Inspector />}
      <Bar />
      <Foot />
      <Settings />
      <Welcome />
      <Palette />
      <Shortcuts />
      <Versions />
      <Find />
      <Built />
      <Notice />
    </div>
  );
}
