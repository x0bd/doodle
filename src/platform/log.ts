/**
 * Doodle's log (`logs.rs`), from the page. What goes in is what happened,
 * how big it was and how long it took — node counts, bytes, milliseconds,
 * a provider's name — never a word of anyone's writing, never a prompt,
 * never a path under the person's home folder (a project is named by its
 * size, not its title). A friend can send the file without sending a book.
 */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./fs";

export type Level = "info" | "warn" | "error";

export function log(area: string, message: string, level: Level = "info") {
  if (!inTauri) return console.info(`[${area}] ${message}`);
  void invoke("log_event", { level, area, message }).catch(() => {});
}

export const logPath = () => (inTauri ? invoke<string | null>("log_path") : Promise.resolve(null));

/** milliseconds since `t`, to one decimal */
export const since = (t: number) => Math.round((performance.now() - t) * 10) / 10;

/** after the next paint — the time a change takes to be seen */
export const painted = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
