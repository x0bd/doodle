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
import { briefing, runTool } from "../agent/tools";
import type { TextRequest } from "../providers/types";

export type Ask = "expand" | "continue" | "rewrite" | "ask";

/** a tool as the draft says it is being used */
const DOING: Record<string, string> = {
  doodle_here: "looking where you are",
  doodle_outline: "reading the outline",
  doodle_read: "reading",
  doodle_find: "searching",
  propose_beats: "proposing beats",
  propose_shots: "proposing shots",
  propose_text: "drafting",
  propose_characters: "proposing characters",
  propose_places: "proposing places",
};

export interface Draft {
  id: string;
  nodeId: string;
  ask: Ask;
  instruction: string;
  text: string;
  state: "thinking" | "ready" | "failed";
  error?: string;
  provider?: string;
  /** what the agent is doing, when it is working the document */
  doing?: string;
  /** the agent worked the document and this is its account of it — read,
   *  not kept: what it proposed waits on the page on its own */
  reply?: boolean;
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

/** what came before: for a chapter, the chapter before it — its line and
 *  how it ends; for a page, its chapter's line and the page before — so the
 *  words continue the book, not just themselves */
function before(nodeId: string): string {
  const g = graph.get();
  const node = g.nodes[nodeId];
  if (node?.kind === "chapter") {
    const all = g.order.map((id) => g.nodes[id]).filter((n) => n.parent === node.parent && n.kind === "chapter" && n.status !== "rejected").sort((a, b) => a.seq - b.seq);
    const prev = all[all.findIndex((c) => c.id === nodeId) - 1];
    if (!prev) return "";
    const line = String(prev.data.summary ?? "").trim();
    const tail = String(prev.data.text ?? "").trim().slice(-900);
    return [`The chapter before is "${prev.title}"${line ? `: ${line}` : ""}.`, tail && `It ends:\n…${tail}`].filter(Boolean).join("\n");
  }
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
    const req: TextRequest = { prompt: words || (ask === "continue" ? "This page is blank. Begin it, carrying on from what came before." : words), system };
    // a free ask works the document: it can read it and leave proposals
    if (ask === "ask") {
      req.tools = true;
      req.instructions = briefing(nodeId);
      req.runTool = (name, args) => runTool(name, args, provider.descriptor.name);
      req.onTool = (name) => drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], doing: DOING[name] ?? name, reply: true } } : d));
    }
    // words as they come, when the provider can give them
    const onDelta = (partial: string) => drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], text: partial } } : d));
    const text = provider.streamText ? await provider.streamText(req, onDelta, ctl.signal) : await provider.generateText!(req, ctl.signal);
    drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], text, state: "ready", doing: undefined } } : d));
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
export const proseKey = (kind: string) => (kind === "character" || kind === "location" || kind === "style" || kind === "shot" ? "description" : "text");

export function accept(id: string) {
  const d = drafts.get()[id];
  if (!d || d.state !== "ready" || d.reply) return;
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
