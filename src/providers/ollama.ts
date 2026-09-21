/**
 * Ollama, on this machine. Text only — Ollama does not draw — so it
 * answers `text.generate` (prompt rewriting, later) and reports itself
 * available when the local server answers. Shaped now; used later.
 */
import type { Provider, TextRequest } from "./types";

const BASE = "http://localhost:11434";

let installed: string[] = [];
/** families that write prose; OCR and embedding models do not */
const WRITERS = /^(llama|gemma|qwen|mistral|mixtral|phi|deepseek|command|granite|smollm|tinyllama)/i;
const writers = () => installed.filter((m) => WRITERS.test(m));

/** the model asked for if it is installed, else the first writer that is */
function resolve(want?: string): string {
  const name = want?.replace(/^ollama\s*·\s*/i, "").trim();
  if (name && name !== "Default" && installed.some((m) => m === name || m.startsWith(`${name}:`))) return name;
  return writers()[0] ?? name ?? "llama3.2";
}

export const ollama: Provider = {
  descriptor: { id: "ollama", name: "Ollama", capabilities: ["text.generate"] },
  async status() {
    try {
      const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!r.ok) return "unavailable";
      const data = (await r.json()) as { models?: { name: string }[] };
      installed = (data.models ?? []).map((m) => m.name);
      // up, but with nothing that writes — the mock is the better answer
      return writers().length ? "available" : "unavailable";
    } catch {
      return "unavailable";
    }
  },
  async generateText(req: TextRequest, signal: AbortSignal): Promise<string> {
    const r = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: resolve(req.model), prompt: req.prompt, system: req.system, stream: false }),
      signal,
    });
    if (!r.ok) throw new Error(`Ollama: ${r.status}`);
    const data = (await r.json()) as { response: string };
    return data.response;
  },
};
