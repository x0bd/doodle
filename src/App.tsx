import { useEffect } from "react";
import { Canvas } from "./canvas/Canvas";
import { Head } from "./shell/Head";
import { Navigator } from "./shell/Navigator";
import { Inspector } from "./shell/Inspector";
import { Foot } from "./shell/Foot";
import { Settings } from "./shell/Settings";
import { Bar } from "./shell/Bar";
import { ui, togglePanes } from "./state/ui";
import { listenToMenu } from "./platform/menu";
import { newGraph, restoreLast } from "./state/doc";
import { fitAll } from "./canvas/view";

export function App() {
  const { navigator, inspector } = ui.use();
  useEffect(listenToMenu, []);
  // the last graph if it is still there — with its view — else the template, framed
  useEffect(() => {
    let live = true;
    restoreLast().then((restored) => {
      if (!live) return;
      if (!restored) {
        newGraph();
        requestAnimationFrame(fitAll);
      }
    });
    return () => {
      live = false;
    };
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
    <div className="win">
      <Canvas />
      <Head />
      {navigator && <Navigator />}
      {inspector && <Inspector />}
      <Bar />
      <Foot />
      <Settings />
    </div>
  );
}
