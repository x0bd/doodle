/**
 * ChatGPT, through the Codex CLI on this machine. The CLI holds the login;
 * Doodle asks Rust to run it. Text and images both — the CLI has an image
 * tool of its own. Every call carries Codex's own preamble (~10k tokens),
 * so this is for scenes and pictures, not for every keystroke.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { inTauri } from "../platform/fs";
import type { ImageRequest, ImageResult, Picture, Progress, Provider, TextRequest } from "./types";

export interface CodexStatus {
  found: boolean;
  path?: string;
  auth?: string;
  version?: string;
}

export const codexStatus = () => invoke<CodexStatus>("codex_status");

/** pictures as Codex reads them: the file where there is one (Rust makes
 *  the 1024 copy), else the bytes, which Rust writes to a scratch file */
const shown = (pics: Picture[] | undefined) => (pics?.length ? pics.map((p) => p.path ?? p.data).filter((x): x is string => !!x) : null);

type CodexEvent =
  | { kind: "delta"; turnId: string; delta: string }
  | { kind: "done"; turnId: string; text: string; status: string; error?: string }
  | { kind: "failed"; turnId: string; error: string }
  | { kind: "tool"; turnId: string; tool: string; status: string }
  | { kind: "message"; turnId: string };

/** A turn on the app server: words as they come, the whole at the end.
 *  Cancel interrupts the turn. */
async function turn(req: TextRequest, onDelta: ((t: string) => void) | undefined, signal: AbortSignal): Promise<string> {
  const handle = await invoke<{ thread_id: string; turn_id: string }>("codex_turn", {
    prompt: req.prompt,
    system: req.system ?? null,
    schema: req.schema ?? null,
    images: shown(req.images),
    tools: !!req.tools,
    instructions: req.instructions ?? null,
  });
  return new Promise<string>((resolve, reject) => {
    let off: UnlistenFn | undefined;
    let acc = "";
    const finish = (fn: () => void) => {
      off?.();
      signal.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => {
      void invoke("codex_interrupt", { threadId: handle.thread_id, turnId: handle.turn_id }).catch(() => undefined);
      finish(() => reject(new DOMException("Cancelled", "AbortError")));
    };
    signal.addEventListener("abort", onAbort);
    listen<CodexEvent>("codex", (e) => {
      const ev = e.payload;
      if (ev.turnId !== handle.turn_id) return;
      if (ev.kind === "delta") {
        acc += ev.delta;
        onDelta?.(acc);
      } else if (ev.kind === "done") {
        if (ev.status === "failed") finish(() => reject(new Error(ev.error ?? "Codex failed")));
        else if (ev.status === "interrupted") finish(() => reject(new DOMException("Cancelled", "AbortError")));
        else finish(() => resolve(ev.text || acc));
      } else if (ev.kind === "message") {
        // the agent speaks again, after a tool: its words start over
        acc = "";
      } else if (ev.kind === "tool") {
        req.onTool?.(ev.tool);
      } else if (ev.kind === "failed") {
        finish(() => reject(new Error(ev.error)));
      }
    }).then((f) => {
      off = f;
      if (signal.aborted) onAbort();
    });
  });
}

export const codex: Provider = {
  descriptor: { id: "codex", name: "ChatGPT", capabilities: ["text.generate", "image.generate"] },
  async status() {
    if (!inTauri) return "unavailable";
    try {
      const s = await codexStatus();
      if (!s.found) return "unavailable";
      return s.auth ? "available" : "needs-auth";
    } catch {
      return "unavailable";
    }
  },
  async generateText(req: TextRequest, signal: AbortSignal): Promise<string> {
    return turn(req, undefined, signal);
  },
  async streamText(req: TextRequest, onDelta: (t: string) => void, signal: AbortSignal): Promise<string> {
    return turn(req, onDelta, signal);
  },
  async generateImage(req: ImageRequest, onProgress: (p: Progress) => void): Promise<ImageResult> {
    const t0 = performance.now();
    onProgress({ fraction: 0.1, note: "asking" });
    const parts = [req.prompt, req.negative && `Avoid: ${req.negative}.`, `${req.width}×${req.height}.`].filter(Boolean);
    const r = await invoke<{ data_url: string; path: string }>("codex_image", { prompt: parts.join(" "), seed: req.seed, images: shown(req.images) });
    onProgress({ fraction: 1, note: "done" });
    return { asset: r.data_url, seed: req.seed, elapsedMs: performance.now() - t0 };
  },
};
