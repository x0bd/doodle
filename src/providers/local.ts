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

/** what FLUX.2 klein 4B needs while it draws: its weights in bf16 and room to work */
const NEEDS = 20e9;
/** how much of the Mac the models may take between them, leaving the rest to everything else */
const SHARE = 0.85;

/**
 * The memory guard (M4.4): FLUX beside what Ollama holds must fit in this
 * Mac. If it would not, Ollama's models step aside — asked to let go now —
 * largest first, until it does; the writer loads again when next asked.
 * Says who stepped aside.
 */
export async function makeRoom(total: number, held: { name: string; size: number }[], unload: (name: string) => Promise<void>): Promise<string[]> {
  let using = held.reduce((a, m) => a + m.size, 0);
  const gone: string[] = [];
  for (const m of [...held].sort((a, b) => b.size - a.size)) {
    if (using + NEEDS <= total * SHARE) break;
    await unload(m.name);
    using -= m.size;
    gone.push(m.name);
  }
  return gone;
}

async function guard(): Promise<string[]> {
  const total = await invoke<number>("memory_total").catch(() => 0);
  if (!total) return [];
  try {
    const r = await fetch("http://localhost:11434/api/ps", { signal: AbortSignal.timeout(1500) });
    const { models } = (await r.json()) as { models?: { name: string; size_vram?: number; size?: number }[] };
    const held = (models ?? []).map((m) => ({ name: m.name, size: m.size_vram || m.size || 0 }));
    return await makeRoom(total, held, async (name) => {
      await fetch("http://localhost:11434/api/generate", { method: "POST", body: JSON.stringify({ model: name, keep_alive: 0 }) });
    });
  } catch {
    // Ollama not running: nothing to make room from
    return [];
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
    const aside = await guard();
    if (aside.length) onProgress({ fraction: 0, note: `${aside.map((n) => n.replace(/^hf\.co\/[^/]+\//, "").replace(/-GGUF.*$/, "")).join(", ")} stepped aside to make room` });
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
