/**
 * The document on disk, through Rust. The webview never touches the
 * filesystem itself; it asks, and it is told.
 */
import { invoke } from "@tauri-apps/api/core";
import { open, save, ask, message } from "@tauri-apps/plugin-dialog";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const saveGraph = (dir: string, json: string) => invoke<void>("save_graph", { dir, json });
export const loadGraph = (dir: string) => invoke<string>("load_graph", { dir });
export const graphExists = (dir: string) => invoke<boolean>("graph_exists", { dir });
export const duplicateGraph = (dir: string) => invoke<string>("duplicate_graph", { dir });
export async function revealPath(path: string) {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

export const saveRecord = (dir: string, name: "jobs", json: string) => invoke<void>("save_record", { dir, name, json });
export const loadRecord = (dir: string, name: "jobs") => invoke<string | null>("load_record", { dir, name });

export interface ImportedAsset {
  rel: string;
  name: string;
  bytes: number;
}
export const importAsset = (dir: string, path: string) => invoke<ImportedAsset>("import_asset", { dir, path });
export const readAsset = (dir: string, rel: string) => invoke<string>("read_asset", { dir, rel });
export const readThumb = (dir: string, rel: string, size: number) => invoke<string>("read_thumb", { dir, rel, size });
export const writeAsset = (dir: string, dataUrl: string) => invoke<ImportedAsset>("write_asset", { dir, dataUrl });

/** The recovery log (`recovery.rs`): a project's inside it, a never-saved
 *  graph's (`dir` null) in Doodle's own Application Support folder. */
export const recoveryAppend = (dir: string | null, lines: string) => invoke<void>("recovery_append", { dir, lines });
export const recoveryRead = (dir: string | null) => invoke<string | null>("recovery_read", { dir });
export const recoveryClear = (dir: string | null) => invoke<void>("recovery_clear", { dir });

/** Versions (`versions.rs`): one file each inside the project, and a list. */
export const versionSave = (dir: string, id: string, meta: string, body: string) => invoke<void>("version_save", { dir, id, meta, body });
export const versionIndex = (dir: string) => invoke<string>("version_index", { dir });
export const versionRead = (dir: string, id: string) => invoke<string>("version_read", { dir, id });

/** Integrity (`integrity.rs`): the backups to fall back on, a damaged file
 *  kept aside, the pictures nothing uses. */
export const listBackups = (dir: string) => invoke<string[]>("list_backups", { dir });
export const readBackup = (dir: string, name: string) => invoke<string>("read_backup", { dir, name });
export const setAside = (dir: string, why: "damaged" | "before") => invoke<string | null>("set_aside", { dir, why });
export const unusedAssets = (dir: string) => invoke<{ files: string[]; bytes: number }>("unused_assets", { dir });
export const trashUnusedAssets = (dir: string) => invoke<number>("trash_unused_assets", { dir });

/** Files dropped on the window, as paths — the platform hands them over. */
export async function onFileDrop(handler: (paths: string[], at: { x: number; y: number }) => void) {
  if (!inTauri) return () => {};
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((e) => {
    if (e.payload.type === "drop") handler(e.payload.paths, e.payload.position);
  });
}

/** Ask where a new `.doodle` folder should go. */
export const writeText = (path: string, text: string) => invoke<void>("write_text", { path, text });

export interface Imported { dir: string; name: string; files: number }
export const exportArchive = (dir: string, path: string, name: string) => invoke<number>("export_archive", { dir, path, name });
export const importArchive = (path: string, dir: string) => invoke<Imported>("import_archive", { path, dir });

/** Ask for an archive to read. */
export async function pickOpenFile(ext: string, title: string): Promise<string | null> {
  const p = await open({ multiple: false, title, filters: [{ name: "Doodle archive", extensions: [ext] }] });
  return typeof p === "string" ? p : null;
}

/** What Doodle can import into chapters (PLAN.md M2.9, M3.1). */
export const IMPORTS = ["md", "markdown", "txt", "fountain", "docx", "pdf"];
export const importable = (path: string) => /\.(md|markdown|mdown|txt|text|fountain|spmd|docx|pdf)$/i.test(path);
/** the pictures Doodle keeps — HEIC and TIFF made JPEGs on the way in */
export const PICTURES = /\.(png|jpe?g|webp|gif|avif|heic|heif|tiff?|bmp)$/i;

/** Ask for a manuscript to import. */
export async function pickImport(): Promise<string | null> {
  const p = await open({ multiple: false, title: "Import", filters: [{ name: "A manuscript", extensions: IMPORTS }] });
  return typeof p === "string" ? p : null;
}

export interface ImportedText { name: string; kind: string; text: string; pictures: string[] }
/** A file's words as Markdown (Fountain as it is), read by `import.rs`;
 *  with `dir`, a Word document's pictures are kept in the project. */
export const readImport = (path: string, dir: string | null = null) => invoke<ImportedText>("read_import", { path, dir });
/** A file's bytes (a PDF, for pdf.js). */
export const readBytes = async (path: string) => new Uint8Array(await invoke<ArrayBuffer>("read_bytes", { path }));

/** Ask where to put a file that is not the document — an export. */
export async function pickSaveFile(name: string, ext: string, title: string): Promise<string | null> {
  const p = await save({ defaultPath: `${name}.${ext}`, title, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (!p) return null;
  return p.endsWith(`.${ext}`) ? p : `${p}.${ext}`;
}

export async function pickSaveDir(name: string): Promise<string | null> {
  const p = await save({ defaultPath: `${name}.doodle`, title: "Save graph" });
  if (!p) return null;
  return p.endsWith(".doodle") ? p : `${p}.doodle`;
}

/** Ask for an existing project. A `.doodle` folder is a package the
 *  platform shows as one file (the bundle declares the type), so it is
 *  chosen as a file. */
export async function pickOpenDir(): Promise<string | null> {
  const p = await open({ multiple: false, title: "Open", filters: [{ name: "Doodle project", extensions: ["doodle"] }] });
  return typeof p === "string" ? p : null;
}

/** What the Finder handed over (a project double-clicked, an archive on the
 *  Dock icon) since last asked — and a word when more arrives. */
export const takeOpened = () => (inTauri ? invoke<string[]>("take_opened") : Promise.resolve([]));
export async function onOpened(handler: () => void) {
  if (!inTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("opened", handler);
}

/** File › Open Recent, by name, newest first. */
export const setRecentMenu = (names: string[]) => (inTauri ? invoke<void>("set_recent", { names }) : Promise.resolve());

/** A yes-or-no put to the user as the platform's own sheet. The web view
 *  has no working `confirm` — it answers no at once — so this is the one
 *  way to ask. In a browser, the browser's will do. */
export async function confirmAsk(message: string, title = "Doodle", ok = "OK"): Promise<boolean> {
  if (!inTauri) return window.confirm(message);
  return ask(message, { title, kind: "warning", okLabel: ok, cancelLabel: "Cancel" });
}

/** A three-way question as the platform's own sheet — Save / Don't Save /
 *  Cancel. In a browser, OK means the first, Cancel the last. */
export async function askThree(text: string, title: string, yes: string, no: string): Promise<"yes" | "no" | "cancel"> {
  if (!inTauri) return window.confirm(text) ? "yes" : "cancel";
  const r = String(await message(text, { title, kind: "warning", buttons: { yes, no, cancel: "Cancel" } }));
  return r === "Yes" || r === yes ? "yes" : r === "No" || r === no ? "no" : "cancel";
}
