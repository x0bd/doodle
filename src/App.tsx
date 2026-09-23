import { useEffect } from "react";
import { Canvas } from "./canvas/Canvas";
import { Head } from "./shell/Head";
import { Navigator } from "./shell/Navigator";
import { Inspector } from "./shell/Inspector";
import { Foot } from "./shell/Foot";
import { Settings } from "./shell/Settings";
import { Bar } from "./shell/Bar";
import { ui, togglePanes, openChooser } from "./state/ui";
import { listenToMenu } from "./platform/menu";
import { listenForAgent } from "./agent/tools";
import { doc, launch, openHandedOver, recentMenu } from "./state/doc";
import { fitAll } from "./canvas/view";
import { painted } from "./platform/log";
import { Welcome } from "./shell/Welcome";
import { Palette } from "./shell/Palette";
import { Shortcuts } from "./shell/Shortcuts";
import { Notice } from "./shell/Notice";
import { Versions } from "./shell/Versions";
import { onFileDrop, onOpened } from "./platform/fs";
import { attachFiles, attachTo } from "./state/assets";
import { nav, reading } from "./state/nav";

export function App() {
  const { navigator, inspector } = ui.use();
  const focus = nav.use((n) => n.focus);
  const read = ui.use((u) => u.read);
  const writing = reading(focus, read);
  useEffect(listenToMenu, []);
  useEffect(listenForAgent, []);
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
  // images dropped on the window: onto the node under them, or onto the page being written
  useEffect(() => {
    let off: (() => void) | undefined;
    onFileDrop(async (paths, at) => {
      const scale = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(at.x / scale, at.y / scale) as HTMLElement | null;
      const under = el?.closest<HTMLElement>("[data-node]")?.dataset.node;
      const focus = nav.get().focus;
      const target = under ?? focus;
      if (!target) return;
      const refs = await attachFiles(paths.filter((p) => /\.(png|jpe?g|webp|gif|avif)$/i.test(p)));
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
    <div className={`win${writing ? " writing" : ""}${navigator ? " nav-on" : ""}${inspector ? " ins-on" : ""}`}>
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
      <Notice />
    </div>
  );
}
