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
  /** ⌘K — never remembered */
  palette: boolean;
  /** the lens, held on from the cluster — never remembered */
  lens: boolean;
  /** the shortcuts sheet — never remembered */
  shortcuts: boolean;
  /** the prompt bar: out until Enter starts a run, back on / — never remembered */
  bar: boolean;
  /** the ask on a page: a key until opened — never remembered */
  ask: boolean;
  /** a place read as one column instead of a field — never remembered */
  read: boolean;
  /** the map, in the corner of the field */
  map: boolean;
  /** who draws and who writes when Queue is pressed */
  drawWith: string;
  writeWith: string;
}

const KEY = "doodle.ui.v1";
const base: UiState = { navigator: true, inspector: true, theme: "dark", motion: "full", settings: false, chooser: false, palette: false, lens: false, shortcuts: false, bar: true, ask: false, read: false, map: false, drawWith: "mock", writeWith: "mock" };

function load(): UiState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...base, ...JSON.parse(raw), settings: false, chooser: false, palette: false, lens: false, shortcuts: false, bar: true, ask: false, read: false } : base;
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
  const { settings: _settings, chooser: _chooser, palette: _palette, lens: _lens, shortcuts: _shortcuts, bar: _bar, ask: _ask, read: _read, ...rest } = ui.get();
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
export const openPalette = () => ui.set((s) => ({ ...s, palette: true }));
export const closePalette = () => ui.set((s) => ({ ...s, palette: false }));
export const toggleLens = () => ui.set((s) => ({ ...s, lens: !s.lens }));
export const openShortcuts = () => ui.set((s) => ({ ...s, shortcuts: true }));
export const closeShortcuts = () => ui.set((s) => ({ ...s, shortcuts: false }));
export const hideBar = () => ui.set((s) => ({ ...s, bar: false }));
export const showBar = () => ui.set((s) => ({ ...s, bar: true }));
export const showAsk = () => ui.set((s) => ({ ...s, ask: true }));
export const hideAsk = () => ui.set((s) => ({ ...s, ask: false }));
export const toggleAsk = () => ui.set((s) => ({ ...s, ask: !s.ask }));
export const toggleBar = () => ui.set((s) => ({ ...s, bar: !s.bar }));
/** reading puts the bar away; the field brings it back */
export const toggleRead = () => ui.set((s) => ({ ...s, read: !s.read, bar: s.read }));
export const setRead = (read: boolean) => ui.set((s) => ({ ...s, read, bar: !read }));
export const toggleMap = () => ui.set((s) => ({ ...s, map: !s.map }));
