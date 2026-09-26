/**
 * FLUX on this Mac (PLAN.md M4.4): the local provider behind the port —
 * `doodle-imaged` (src-tauri/src/imaged.rs, src-tauri/imaged/), FLUX.2 klein
 * through mflux. Progress by the step; a real cancel (the run stops at the
 * next step); one model resident, let go after ten quiet minutes; a picture
 * made from references when it has them (FLUX.2's edit mode — a face, a
 * look, a board's pictures). If the picture maker dies mid-run, the run
 * fails with a sentence and the next one starts it again.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { inTauri, readBytes } from "../platform/fs";
import type { ImageRequest, ImageResult, Progress, Provider } from "./types";

export interface LocalStatus {
  uv: boolean;
  env: boolean;
  model: boolean;
  running: boolean;
}

/** what the picture maker says, a line at a time */
type Said = { event: string; id?: string; step?: number; steps?: number; path?: string; ms?: number; message?: string; line?: string };

export const localStatus = (): Promise<LocalStatus | null> => (inTauri ? invoke<LocalStatus>("imaged_status").catch(() => null) : Promise.resolve(null));

/** Make Doodle's environment for it (a Python of its own, mflux in it); each line of the work heard. */
export async function setUpLocal(onLine: (line: string) => void): Promise<void> {
  const off = await listen<Said>("imaged", (e) => e.payload.event === "setup" && onLine(e.payload.line ?? ""));
  try {
    await invoke("imaged_setup");
  } finally {
    off();
  }
}

/** the model, and how many steps it draws in */
const MODEL = "flux2-klein-4b";
const STEPS = 4;

let seq = 0;

const dataUrl = async (path: string) => {
  const bytes = await readBytes(path);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
};

export const local: Provider = {
  descriptor: { id: "local", name: "FLUX on this Mac", capabilities: ["image.generate"] },
  async status() {
    const s = await localStatus();
    return s?.env && s.model ? "available" : "unavailable";
  },
  async generateImage(req: ImageRequest, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<ImageResult> {
    const id = `i${Date.now().toString(36)}${++seq}`;
    const out = await invoke<string>("imaged_out", { id });
    const t0 = performance.now();
    // references as files: a face, a look, a board's pictures (in memory only, a picture is left out)
    const images = (req.images ?? []).map((p) => p.path).filter((x): x is string => !!x);
    let off: UnlistenFn | undefined;
    const done = new Promise<string>((resolve, reject) => {
      const stop = () => void invoke("imaged_send", { line: { op: "cancel", id } }).catch(() => undefined);
      signal.addEventListener("abort", stop);
      void listen<Said>("imaged", (e) => {
        const s = e.payload;
        if (s.event === "exited") return reject(new Error("The picture maker stopped. Run it again — it starts afresh."));
        if (s.id !== id) return;
        if (s.event === "progress" && s.steps) onProgress({ fraction: (s.step ?? 0) / s.steps, note: `${s.step}/${s.steps}` });
        else if (s.event === "done") resolve(s.path!);
        else if (s.event === "cancelled") reject(new DOMException("Cancelled", "AbortError"));
        else if (s.event === "error") reject(new Error(`FLUX: ${s.message}`));
      }).then((f) => {
        off = f;
        // listening before asking, so no line is missed
        onProgress({ fraction: 0, note: images.length ? `loading · ${images.length} reference${images.length === 1 ? "" : "s"}` : "loading" });
        return invoke("imaged_send", {
          line: { id, op: "generate", model: MODEL, prompt: req.prompt, seed: req.seed, steps: STEPS, width: req.width, height: req.height, images, out },
        }).catch(reject);
      });
    });
    try {
      const path = await done;
      return { asset: await dataUrl(path), seed: req.seed, elapsedMs: performance.now() - t0 };
    } finally {
      off?.();
    }
  },
};
