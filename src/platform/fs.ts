/**
 * The document on disk, through Rust. The webview never touches the
 * filesystem itself; it asks, and it is told.
 */
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export const inTauri = "__TAURI_INTERNALS__" in window;

export const saveGraph = (dir: string, json: string) => invoke<void>("save_graph", { dir, json });
export const loadGraph = (dir: string) => invoke<string>("load_graph", { dir });
export const graphExists = (dir: string) => invoke<boolean>("graph_exists", { dir });

/** Ask where a new `.doodle` folder should go. */
export async function pickSaveDir(name: string): Promise<string | null> {
  const p = await save({ defaultPath: `${name}.doodle`, title: "Save graph" });
  if (!p) return null;
  return p.endsWith(".doodle") ? p : `${p}.doodle`;
}

/** Ask for an existing `.doodle` folder. */
export async function pickOpenDir(): Promise<string | null> {
  const p = await open({ directory: true, multiple: false, title: "Open graph" });
  return typeof p === "string" ? p : null;
}
