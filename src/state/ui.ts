import { createStore } from "./store";

export type Theme = "dark" | "light" | "system";
export type Motion = "full" | "reduced";

export interface UiState {
  navigator: boolean;
  inspector: boolean;
  theme: Theme;
  motion: Motion;
  /** the settings sheet — never remembered */
  settings: boolean;
  /** the new-graph chooser — never remembered */
  chooser: boolean;
  /** who draws and who writes when Queue is pressed */
  drawWith: string;
  writeWith: string;
}

const KEY = "doodle.ui.v1";
const base: UiState = { navigator: true, inspector: true, theme: "dark", motion: "full", settings: false, chooser: false, drawWith: "mock", writeWith: "mock" };

function load(): UiState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...base, ...JSON.parse(raw), settings: false, chooser: false } : base;
  } catch {
    return base;
  }
}

export const ui = createStore<UiState>(load());

const dark = window.matchMedia("(prefers-color-scheme: dark)");
function apply() {
  const s = ui.get();
  const isDark = s.theme === "system" ? dark.matches : s.theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.classList.toggle("reduce-motion", s.motion === "reduced");
}
dark.addEventListener("change", apply);
apply();

ui.subscribe(() => {
  const { settings: _settings, chooser: _chooser, ...rest } = ui.get();
  try {
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* a private window; nothing to remember into */
  }
  apply();
});

export const toggleNavigator = () => ui.set((s) => ({ ...s, navigator: !s.navigator }));
export const toggleInspector = () => ui.set((s) => ({ ...s, inspector: !s.inspector }));
/** Both panes: hide if either is showing, else show both. */
export const togglePanes = () =>
  ui.set((s) => {
    const showing = s.navigator || s.inspector;
    return { ...s, navigator: !showing, inspector: !showing };
  });
export const setTheme = (theme: Theme) => ui.set((s) => ({ ...s, theme }));
export const toggleTheme = () =>
  ui.set((s) => ({ ...s, theme: document.documentElement.classList.contains("dark") ? "light" : "dark" }));
export const setMotion = (motion: Motion) => ui.set((s) => ({ ...s, motion }));
export const openSettings = () => ui.set((s) => ({ ...s, settings: true }));
export const closeSettings = () => ui.set((s) => ({ ...s, settings: false }));
export const openChooser = () => ui.set((s) => ({ ...s, chooser: true }));
export const closeChooser = () => ui.set((s) => ({ ...s, chooser: false }));
export const setDrawWith = (id: string) => ui.set((s) => ({ ...s, drawWith: id }));
export const setWriteWith = (id: string) => ui.set((s) => ({ ...s, writeWith: id }));
