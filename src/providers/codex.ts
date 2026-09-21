/**
 * ChatGPT, through the Codex CLI on this machine. The CLI holds the login;
 * Doodle asks Rust to run it. Text and images both — the CLI has an image
 * tool of its own. Every call carries Codex's own preamble (~10k tokens),
 * so this is for scenes and pictures, not for every keystroke.
 */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../platform/fs";
import type { ImageRequest, ImageResult, Progress, Provider, TextRequest } from "./types";

export interface CodexStatus {
  found: boolean;
  path?: string;
  auth?: string;
  version?: string;
}

export const codexStatus = () => invoke<CodexStatus>("codex_status");

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
  async generateText(req: TextRequest): Promise<string> {
    return invoke<string>("codex_text", { prompt: req.prompt, system: req.system ?? null });
  },
  async generateImage(req: ImageRequest, onProgress: (p: Progress) => void): Promise<ImageResult> {
    const t0 = performance.now();
    onProgress({ fraction: 0.1, note: "asking" });
    const parts = [req.prompt, req.negative && `Avoid: ${req.negative}.`, `${req.width}×${req.height}.`].filter(Boolean);
    const r = await invoke<{ data_url: string; path: string }>("codex_image", { prompt: parts.join(" "), seed: req.seed });
    onProgress({ fraction: 1, note: "done" });
    return { asset: r.data_url, seed: req.seed, elapsedMs: performance.now() - t0 };
  },
};
