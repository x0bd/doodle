import { useEffect } from "react";
import { Head } from "./shell/Head";
import { Navigator } from "./shell/Navigator";
import { Inspector } from "./shell/Inspector";
import { Foot } from "./shell/Foot";
import { Settings } from "./shell/Settings";
import { Bar } from "./shell/Bar";
import { ui, togglePanes } from "./state/ui";
import { listenToMenu } from "./platform/menu";

export function App() {
  const { navigator, inspector } = ui.use();
  useEffect(listenToMenu, []);
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
      <Head />
      <div className="sub" data-tauri-drag-region>
        image generation v3
      </div>
      {navigator && <Navigator />}
      {inspector && <Inspector />}
      <Bar />
      <Foot />
      <Settings />
    </div>
  );
}
