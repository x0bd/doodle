/**
 * Help › Make a Diagnostics Bundle (PLAN.md M1.8): a zip a friend can send
 * when something went wrong — Doodle's logs, the Mac it runs on, and a
 * report of what is open **by size only**: how many cards of each kind,
 * how many words, pictures, versions, who was found to write and draw. No
 * title, no word of the writing, no prompt, no path; Rust takes home
 * folder names out of everything it packs (`logs.rs`).
 */
import { invoke } from "@tauri-apps/api/core";
import { graph } from "./graph";
import { report } from "./report";
import { doc } from "./doc";
import { versions } from "./versions";
import { say } from "./notice";
import { ui } from "./ui";
import { providers } from "../providers/registry";
import { probe } from "../providers/found";
import { inTauri, pickSaveFile, revealPath } from "../platform/fs";

export async function makeDiagnostics() {
  if (!inTauri) return;
  const day = new Date().toISOString().slice(0, 10);
  const out = await pickSaveFile(`Doodle diagnostics ${day}`, "zip", "Save diagnostics");
  if (!out) return;
  const found = await probe().catch(() => ({}) as Record<string, { chip: string }>);
  const text = report(graph.get(), {
    saved: !!doc.get().path,
    versions: versions.get().list.length,
    providers: Object.fromEntries(providers.map((p) => [p.descriptor.id, found[p.descriptor.id]?.chip ?? "?"])),
    theme: ui.get().theme,
  });
  try {
    await invoke<number>("diagnostics_bundle", { out, report: text });
    await revealPath(out);
    say("The diagnostics bundle is in the Finder. It holds sizes and timings — none of your words.");
  } catch (e) {
    say(`The bundle could not be made: ${String(e).replace(/^Error: /, "")}`);
  }
}
