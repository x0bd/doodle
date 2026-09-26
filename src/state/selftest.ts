/**
 * A self-test the dev build runs when asked (`DOODLE_SELFTEST=flux pnpm
 * tauri dev`): the whole road a picture takes on this Mac — the page, the
 * provider, Rust, the picture maker, FLUX — without a click. A blank film,
 * its character given an appearance, a portrait drawn with FLUX, the
 * character opened; what happened goes to the log (`[selftest] …`). It
 * works in a new, unsaved graph of the dev build's own, never in a book.
 */
import { invoke } from "@tauri-apps/api/core";
import { graph, updateData } from "./graph";
import { jobs } from "./jobs";
import { ui, closeChooser } from "./ui";
import { newGraph } from "./doc";
import { enter } from "./nav";
import { generateLook, recipeOf } from "./looks";
import { provFor } from "./prov";
import { lookAgain } from "../providers/registry";
import { log } from "../platform/log";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let ran = false;

export async function selfTest() {
  // once: React's development mount calls this twice
  if (!import.meta.env.DEV || ran) return;
  ran = true;
  const what = await invoke<string | null>("selftest_mode").catch(() => null);
  if (what !== "flux") return;
  const say = (m: string) => log("selftest", m);
  // after the launch has opened whatever it opens
  await wait(5000);
  say("flux: start");
  newGraph("film", true);
  closeChooser();
  updateData("c1", { name: "Mara", description: "Seventeen, the lighthouse keeper's daughter: windburnt cheeks, dark hair tied back, a heavy oilskin coat." });
  ui.set((u) => ({ ...u, drawWith: "local" }));
  lookAgain();
  const t0 = performance.now();
  generateLook("c1", "portrait");
  enter("c1");
  const gen = recipeOf(graph.get(), "c1", "portrait")!.gen.id;
  let last = "";
  for (let i = 0; i < 600; i++) {
    await wait(500);
    const j = Object.values(jobs.get().jobs).find((x) => x.nodeId === gen);
    const now = `${j?.state} ${Math.round((j?.progress ?? 0) * 100)}% ${j?.note ?? ""} ${j?.provider ?? ""}`;
    if (now !== last) (say(`flux: ${now}`), (last = now));
    if (j && (j.state === "completed" || j.state === "failed" || j.state === "cancelled")) {
      const outs = j.outputs ?? [];
      const p = provFor(outs[0]);
      say(`flux: ${j.state} in ${Math.round(performance.now() - t0)} ms, ${outs.length} takes${j.error ? `, error: ${j.error}` : ""}`);
      if (p) say(`flux: made by ${p.provider} · ${p.model} · ${p.steps} steps · ${p.quantization} · ${p.licence} · seed ${p.seed}`);
      return;
    }
  }
  say("flux: gave up waiting");
}
