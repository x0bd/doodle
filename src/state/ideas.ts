/**
 * Things the agent proposes to add — beats, notes, characters, places —
 * as ghosts on the page they were proposed for, the way proposed shots
 * are (shots.ts). Kept, one becomes a node, one journal entry; a beat
 * that names the passage it came from is tied to it, so the page marks
 * where it sits. Dropped, it is gone. Nothing here is the document until
 * the writer keeps it (plan §11.3: the assistant observes and proposes).
 */
import { createStore } from "./store";
import { graph, childrenOf, makeNode, type GraphNode } from "./graph";
import { commit } from "./history";
import { locate } from "./anchors";
import { doc, setBible } from "./doc";
import { plain, formOf } from "../writer/markup";
import type { NodeKind } from "../graph/kinds";

export type IdeaKind = "beat" | "note" | "character" | "location" | "object" | "comment" | "bible";

export interface Idea {
  kind: IdeaKind;
  title: string;
  text: string;
  /** the words of the parent this came from, to tie it to them */
  quote?: string;
  why?: string;
  /** for the bible: what to add to each of its parts */
  bible?: { tone?: string; rules?: string; avoid?: string };
}

export interface IdeaSet {
  id: string;
  /** the node they are proposed for: a beat goes inside it; a character or
   *  a place goes beside it, at its level */
  nodeId: string;
  items: Idea[];
  by: string;
}

export const ideas = createStore<Record<string, IdeaSet>>({});
let seq = 0;

export function offer(nodeId: string, items: Idea[], by: string): number {
  const clean = items.filter((i) => i.title?.trim() || i.text?.trim()).slice(0, 24);
  if (!clean.length) return 0;
  const id = `i${++seq}`;
  ideas.set((s) => ({ ...s, [id]: { id, nodeId, items: clean, by } }));
  return clean.length;
}

export const ideasFor = (all: Record<string, IdeaSet>, nodeId: string) => Object.values(all).filter((s) => s.nodeId === nodeId);

const KIND: Record<Exclude<IdeaKind, "bible">, NodeKind> = { beat: "note", note: "note", character: "character", location: "location", object: "object", comment: "comment" };

/** the bible's words added to, never replaced: what it says stays, the new goes after */
function toBible(idea: Idea) {
  const b = doc.get().bible;
  const add = idea.bible ?? {};
  const join = (had: string, more?: string) => (!more?.trim() ? had : !had.trim() ? more.trim() : had.includes(more.trim()) ? had : `${had.trim()}\n${more.trim()}`);
  setBible({ tone: join(b.tone, add.tone), rules: join(b.rules, add.rules), avoid: join(b.avoid, add.avoid) });
}

/** where the quoted words sit in the host's words as read (markup away,
 *  in the quote too — a model copies the asterisks), if they do */
function tie(host: GraphNode, quote?: string) {
  const form = formOf(host.data);
  const want = plain(quote?.trim() ?? "", form).trim();
  if (!want) return undefined;
  const words = plain(String(host.data.text ?? ""), form);
  const anchor = { node: host.id, text: want, at: Math.max(0, words.indexOf(want)) };
  return locate(words, anchor) ? anchor : undefined;
}

function made(set: IdeaSet, idea: Idea, offset: number): GraphNode | undefined {
  const g = graph.get();
  const host = g.nodes[set.nodeId];
  if (!host) return undefined;
  if (idea.kind === "bible") return undefined;
  const kind = KIND[idea.kind];
  if (kind === "note") {
    const n = childrenOf(g, host.id).length + offset;
    const node = makeNode("note", 60 + n * 260, 60, { parent: host.id, title: idea.title.slice(0, 60) || `Beat ${n + 1}`, data: { text: idea.text } });
    // a beat that says where it came from is tied there, if the words are
    const anchor = tie(host, idea.quote);
    if (anchor) node.anchor = anchor;
    return node;
  }
  // a remark in the margin, on its words; one whose words are not there is a remark on the whole
  if (kind === "comment") {
    const anchor = tie(host, idea.quote) ?? { node: host.id, text: plain(String(host.data.text ?? ""), formOf(host.data)).slice(0, 60), at: 0 };
    return makeNode("comment", 0, 0, { parent: host.id, title: "Comment", data: { text: [idea.text, idea.why].filter(Boolean).join("\n\n"), resolved: 0, by: set.by }, anchor });
  }
  // a character, a place or a thing lives beside what it was proposed for
  const x = host.x + (offset + 1) * 40;
  const y = host.y + host.h + 60 + offset * 30;
  return makeNode(kind, x, y, {
    parent: host.parent,
    title: idea.title.slice(0, 60),
    status: "draft",
    data: { name: idea.title, description: idea.text },
  });
}

/** Keep one: it becomes a node. */
export function keepIdea(id: string, index: number) {
  const set = ideas.get()[id];
  const idea = set?.items[index];
  if (!set || !idea) return;
  if (idea.kind === "bible") return void (toBible(idea), dropIdea(id, index));
  const node = made(set, idea, 0);
  if (!node) return;
  commit("Keep", () => graph.set((x) => ({ ...x, nodes: { ...x.nodes, [node.id]: node }, order: [...x.order, node.id] })));
  dropIdea(id, index);
}

/** Keep them all: one journal entry. */
export function keepAllIdeas(id: string) {
  const set = ideas.get()[id];
  if (!set) return;
  set.items.filter((it) => it.kind === "bible").forEach(toBible);
  const nodes = set.items.map((it, i) => made(set, it, i)).filter((n): n is GraphNode => !!n);
  commit("Keep all", () =>
    graph.set((x) => ({ ...x, nodes: { ...x.nodes, ...Object.fromEntries(nodes.map((n) => [n.id, n])) }, order: [...x.order, ...nodes.map((n) => n.id)] })),
  );
  dismissIdeas(id);
}

export function dropIdea(id: string, index: number) {
  ideas.set((s) => {
    const set = s[id];
    if (!set) return s;
    const items = set.items.filter((_, i) => i !== index);
    const next = { ...s };
    if (items.length) next[id] = { ...set, items };
    else delete next[id];
    return next;
  });
}

export function dismissIdeas(id: string) {
  ideas.set((s) => {
    const next = { ...s };
    delete next[id];
    return next;
  });
}
