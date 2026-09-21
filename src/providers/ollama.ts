/**
 * Ollama, on this machine. Text only — Ollama does not draw — so it
 * answers `text.generate` (prompt rewriting, later) and reports itself
 * available when the local server answers. Shaped now; used later.
 */
import type { Provider, TextRequest } from "./types";

const BASE = "http://localhost:11434";

export const ollama: Provider = {
  descriptor: { id: "ollama", name: "Ollama", capabilities: ["text.generate"] },
  async status() {
    try {
      const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return r.ok ? "available" : "unavailable";
    } catch {
      return "unavailable";
    }
  },
  async generateText(req: TextRequest, signal: AbortSignal): Promise<string> {
    const r = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: req.model ?? "llama3.2", prompt: req.prompt, system: req.system, stream: false }),
      signal,
    });
    if (!r.ok) throw new Error(`Ollama: ${r.status}`);
    const data = (await r.json()) as { response: string };
    return data.response;
  },
};
