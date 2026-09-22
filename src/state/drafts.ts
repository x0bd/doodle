/**
 * What the agent proposes. A draft belongs to a node and waits beneath its
 * text until it is accepted — then it is text, one journal entry — or
 * rejected, and gone. Nothing the agent says becomes the document on its
 * own.
 */
import { createStore } from "./store";
import { graph, updateData, childrenOf } from "./graph";
import { pick } from "../providers/registry";
import { ui } from "./ui";
import { bibleText } from "./doc";
import { expandMentions } from "../canvas/mentions";

export type Ask = "expand" | "continue" | "rewrite" | "ask";

export interface Draft {
  id: string;
  nodeId: string;
  ask: Ask;
  instruction: string;
  text: string;
  state: "thinking" | "ready" | "failed";
  error?: string;
  provider?: string;
}

export const drafts = createStore<Record<string, Draft>>({});
let seq = 0;
const controllers = new Map<string, AbortController>();

const PROMPTS: Record<Ask, string> = {
  expand: "Expand this into a fuller passage. Keep every fact; add texture, motion and detail.",
  continue: "Continue from where this leaves off, in the same voice.",
  rewrite: "Rewrite this — same meaning, better sentences.",
  ask: "",
};

/** what came before: the chapter's line, and the tail of the page before
 *  this one — so a page continues the book, not just itself */
function before(nodeId: string): string {
  const g = graph.get();
  const node = g.nodes[nodeId];
  if (!node || node.kind !== "page") return "";
  const parts: string[] = [];
  const parent = node.parent ? g.nodes[node.parent] : undefined;
  if (parent?.kind === "chapter") {
    const line = String(parent.data.summary ?? "").trim();
    parts.push(`Chapter "${parent.title}"${line ? `: ${line}` : ""}`);
  }
  const pages = g.order
    .map((id) => g.nodes[id])
    .filter((n) => n.parent === node.parent && n.kind === "page" && n.status !== "rejected")
    .sort((a, b) => a.seq - b.seq);
  const i = pages.findIndex((p) => p.id === nodeId);
  const prev = i > 0 ? pages[i - 1] : undefined;
  const tail = prev ? String(prev.data.text ?? "").trim().slice(-900) : "";
  if (prev && tail) parts.push(`The page before ("${prev.title}") ends:\n…${tail}`);
  return parts.join("\n\n");
}

/** Ask the agent about a node's text. The node's notes ride along as
 *  context; a page brings its chapter and the page before it. */
export async function propose(nodeId: string, ask: Ask, instruction = "") {
  const g = graph.get();
  const node = g.nodes[nodeId];
  if (!node) return;
  const id = `d${++seq}`;
  drafts.set((d) => ({ ...d, [id]: { id, nodeId, ask, instruction, text: "", state: "thinking" } }));
  const notes = childrenOf(g, nodeId)
    .map((c) => g.nodes[c])
    .filter((n) => n.data.text && n.status !== "rejected")
    .map((n) => `${n.title}: ${n.data.text}`)
    .join("\n");
  const prior = before(nodeId);
  const system = [PROMPTS[ask], instruction, bibleText(), prior && `What came before:\n${prior}`, notes && `Context:\n${notes}`].filter(Boolean).join("\n\n");
  const ctl = new AbortController();
  controllers.set(id, ctl);
  try {
    const { provider } = await pick("text.generate", ui.get().writeWith);
    drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], provider: provider.descriptor.name } } : d));
    const words = expandMentions(String(node.data[proseKey(node.kind)] ?? "")).trim();
    // a blank page continued begins from what came before
    const req = { prompt: words || (ask === "continue" ? "This page is blank. Begin it, carrying on from what came before." : words), system };
    // words as they come, when the provider can give them
    const onDelta = (partial: string) => drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], text: partial } } : d));
    const text = provider.streamText ? await provider.streamText(req, onDelta, ctl.signal) : await provider.generateText!(req, ctl.signal);
    drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], text, state: "ready" } } : d));
  } catch (e) {
    const cancelled = e instanceof DOMException && e.name === "AbortError";
    if (cancelled) reject(id);
    else drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], state: "failed", error: String(e) } } : d));
  } finally {
    controllers.delete(id);
  }
}

/** Stop a draft that is still being written. */
export function cancel(id: string) {
  controllers.get(id)?.abort();
}

/** where a kind keeps its words */
export const proseKey = (kind: string) => (kind === "character" || kind === "location" || kind === "style" || kind === "shot" ? "description" : kind === "chapter" ? "summary" : "text");

export function accept(id: string) {
  const d = drafts.get()[id];
  if (!d || d.state !== "ready") return;
  const node = graph.get().nodes[d.nodeId];
  if (!node) return;
  const key = proseKey(node.kind);
  const current = String(node.data[key] ?? "");
  const text = d.ask === "rewrite" ? d.text : `${current.trimEnd()}\n\n${d.text}`.trim();
  updateData(d.nodeId, { [key]: text });
  reject(id);
}

export function reject(id: string) {
  drafts.set((d) => {
    const next = { ...d };
    delete next[id];
    return next;
  });
}

export const draftsFor = (all: Record<string, Draft>, nodeId: string) => Object.values(all).filter((d) => d.nodeId === nodeId);
