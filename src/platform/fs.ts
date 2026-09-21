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

export interface ImportedAsset {
  rel: string;
  name: string;
  bytes: number;
}
export const importAsset = (dir: string, path: string) => invoke<ImportedAsset>("import_asset", { dir, path });
export const readAsset = (dir: string, rel: string) => invoke<string>("read_asset", { dir, rel });

/** Files dropped on the window, as paths — the platform hands them over. */
export async function onFileDrop(handler: (paths: string[], at: { x: number; y: number }) => void) {
  if (!inTauri) return () => {};
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((e) => {
    if (e.payload.type === "drop") handler(e.payload.paths, e.payload.position);
  });
}

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
