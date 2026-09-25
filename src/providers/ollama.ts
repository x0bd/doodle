/**
 * Ollama, on this machine. Text only — Ollama does not draw — so it
 * answers `text.generate`: drafts streamed word by word, structured
 * answers under a schema, and a free ask as an agent, with Doodle's own
 * tools (PLAN.md M6.1). Available when the local server answers and holds
 * a model that writes.
 */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../platform/fs";
import type { Provider, TextRequest } from "./types";

const BASE = "http://localhost:11434";

let installed: string[] = [];
/** whether the server answered the last time it was asked */
let answered = false;
/** the ones that only read — OCR, embeddings; every other model writes
 *  (a finetune pulled from Hugging Face is named for its maker, not its family) */
const READS_ONLY = /(ocr|embed|nomic-bert|bge-|minilm|mxbai|rerank|whisper)/i;
const writes = (m: string) => !READS_ONLY.test(m);
const writers = () => installed.filter(writes);
/** the ones that can look at a picture; the rest are given the words only */
const SEES = /(llava|vision|-vl|vl:|minicpm-v|moondream|gemma3|llama4|qwen2\.5vl|qwen3-vl|granite3\.2-vision|mistral-small3\.[12])/i;

/** the model asked for if it is installed, else the first writer that is */
function resolve(want?: string): string {
  const name = want?.replace(/^ollama\s*·\s*/i, "").trim();
  if (name && name !== "Default" && installed.some((m) => m === name || m.startsWith(`${name}:`))) return name;
  return writers()[0] ?? name ?? "llama3.2";
}

/** how many times the model may reach for the tools before it must answer */
const TURNS = 12;

interface Call {
  function: { name: string; arguments: Record<string, unknown> | string };
}
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: Call[];
  tool_name?: string;
}

/** Read Ollama's answer as it comes — one JSON object a line — handing
 *  on the words so far; the tool calls come whole, in their own lines.
 *  (A reader, not `for await`: the system WebKit cannot iterate a stream.) */
async function round(model: string, messages: Message[], req: TextRequest, tools: unknown[] | undefined, think: boolean | undefined, onDelta: (t: string) => void, signal: AbortSignal) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(tools ? { tools } : {}),
      ...(req.schema && !tools ? { format: req.schema } : {}),
      ...(req.context ? { options: { num_ctx: req.context } } : {}),
      ...(think !== undefined ? { think } : {}),
    }),
    signal,
  });
  if (!r.ok) throw new Error(`Ollama: ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`.trim());
  const reader = r.body!.getReader();
  const decoder = new TextDecoder();
  let content = "";
  const calls: Call[] = [];
  let rest = "";
  const line = (l: string) => {
    if (!l.trim()) return;
    const m = JSON.parse(l) as { message?: { content?: string; tool_calls?: Call[] }; error?: string };
    if (m.error) throw new Error(`Ollama: ${m.error}`);
    if (m.message?.tool_calls) calls.push(...m.message.tool_calls);
    if (m.message?.content) {
      content += m.message.content;
      onDelta(content);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    rest += decoder.decode(value, { stream: true });
    const lines = rest.split("\n");
    rest = lines.pop()!;
    lines.forEach(line);
  }
  line(rest);
  return { content, calls };
}

/** whether the model thinks first: off unless asked for — a draft is
 *  wanted now — and only said to a model that can (the others refuse the word) */
const thinks = new Map<string, boolean>();
async function canThink(model: string): Promise<boolean> {
  if (!thinks.has(model)) {
    try {
      const r = await fetch(`${BASE}/api/show`, { method: "POST", body: JSON.stringify({ model }), signal: AbortSignal.timeout(3000) });
      const d = (await r.json()) as { capabilities?: string[] };
      thinks.set(model, !!d.capabilities?.includes("thinking"));
    } catch {
      return false;
    }
  }
  return thinks.get(model)!;
}

/**
 * A turn with Ollama, through `/api/chat`: the words stream; with the
 * tools (a free ask), the model is told what Doodle's tools are, calls
 * them, is given what they said, and goes on — until it answers in words
 * (the draft shows only its latest), or has reached for them `TURNS` times
 * and is asked to answer without them.
 */
async function turn(req: TextRequest, onDelta: (t: string) => void, signal: AbortSignal): Promise<string> {
  const model = resolve(req.model);
  // a model that sees takes the pictures as bare base64; one that does not
  // still has the words that describe them
  const images = SEES.test(model) ? (req.images ?? []).map((p) => p.data?.split(",")[1]).filter((x): x is string => !!x) : [];
  const system = [req.instructions, req.system].filter(Boolean).join("\n\n");
  const messages: Message[] = [...(system ? [{ role: "system" as const, content: system }] : []), { role: "user", content: req.prompt, ...(images.length ? { images } : {}) }];
  const agent = req.tools && req.runTool && req.toolSpecs?.length;
  const tools = agent ? req.toolSpecs!.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })) : undefined;
  const think = (await canThink(model)) ? (req.think ?? false) : undefined;
  for (let n = 0; n <= TURNS; n++) {
    const { content, calls } = await round(model, messages, req, n < TURNS ? tools : undefined, think, onDelta, signal);
    if (!agent || !calls.length) return content;
    messages.push({ role: "assistant", content, tool_calls: calls });
    for (const c of calls) {
      signal.throwIfAborted();
      const name = c.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = typeof c.function.arguments === "string" ? JSON.parse(c.function.arguments) : (c.function.arguments ?? {});
      } catch {
        messages.push({ role: "tool", tool_name: name, content: "The arguments were not JSON." });
        continue;
      }
      req.onTool?.(name);
      const r = await req.runTool!(name, args);
      messages.push({ role: "tool", tool_name: name, content: r.error ? `Error: ${r.text}` : r.text });
    }
  }
  return "";
}

/** what the Providers screen says: whether it answered, and what it holds */
export const ollamaFound = () => ({
  answered,
  models: installed.map((name) => ({ name, writes: writes(name), sees: SEES.test(name) })),
});

/** where it is installed, if it is — "not running" and "not here" are
 *  different sentences */
export const ollamaWhere = () => (inTauri ? invoke<string | null>("ollama_where") : Promise.resolve(null));

export const ollama: Provider = {
  descriptor: { id: "ollama", name: "Ollama", capabilities: ["text.generate"] },
  async status() {
    try {
      answered = false;
      const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!r.ok) return "unavailable";
      answered = true;
      const data = (await r.json()) as { models?: { name: string }[] };
      installed = (data.models ?? []).map((m) => m.name);
      // up, but with nothing that writes — the mock is the better answer
      return writers().length ? "available" : "unavailable";
    } catch {
      return "unavailable";
    }
  },
  generateText: (req: TextRequest, signal: AbortSignal) => turn(req, () => {}, signal),
  streamText: (req: TextRequest, onDelta: (t: string) => void, signal: AbortSignal) => turn(req, onDelta, signal),
};
