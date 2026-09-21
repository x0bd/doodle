/**
 * The native menu bar reports each of Doodle's items by id; this is where
 * the ids become actions. Anything not listed here is a platform item and
 * the platform already did the work.
 */
import { listen } from "@tauri-apps/api/event";
import { openSettings, toggleInspector, toggleNavigator, togglePanes, toggleTheme } from "../state/ui";

const actions: Record<string, () => void> = {
  "app.settings": openSettings,
  "view.navigator": toggleNavigator,
  "view.inspector": toggleInspector,
  "view.panes": togglePanes,
  "view.theme": toggleTheme,
};

export function listenToMenu() {
  const off = listen<string>("menu", (e) => {
    const act = actions[e.payload];
    if (act) act();
    else console.info("[menu]", e.payload);
  });
  return () => {
    off.then((f) => f());
  };
}
