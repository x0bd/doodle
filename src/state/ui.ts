import { createStore } from "./store";

export type Theme = "dark" | "light";

export interface UiState {
  navigator: boolean;
  inspector: boolean;
  theme: Theme;
}

const KEY = "doodle.ui.v1";

function load(): UiState {
  const base: UiState = { navigator: true, inspector: true, theme: "dark" };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...base, ...JSON.parse(raw) } : base;
  } catch {
    return base;
  }
}

export const ui = createStore<UiState>(load());

ui.subscribe(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ui.get()));
  } catch {
    /* a private window; nothing to remember into */
  }
  document.documentElement.classList.toggle("dark", ui.get().theme === "dark");
});
document.documentElement.classList.toggle("dark", ui.get().theme === "dark");

export const toggleNavigator = () => ui.set((s) => ({ ...s, navigator: !s.navigator }));
export const toggleInspector = () => ui.set((s) => ({ ...s, inspector: !s.inspector }));
/** Both panes: hide if either is showing, else show both. */
export const togglePanes = () =>
  ui.set((s) => {
    const showing = s.navigator || s.inspector;
    return { ...s, navigator: !showing, inspector: !showing };
  });
export const toggleTheme = () =>
  ui.set((s) => ({ ...s, theme: s.theme === "dark" ? "light" : "dark" }));
