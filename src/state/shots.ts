/**
 * Shots the agent proposes for a scene. They are ghosts — rows on the
 * scene's page, not nodes — until one is kept, and then it is a Shot
 * inside the scene, one journal entry. Rejected ones are gone. The
 * scene's beats, characters and style ride along as context.
 */
import { createStore } from "./store";
import { graph, childrenOf, makeNode, type GraphNode } from "./graph";
import { commit } from "./history";
import { pick } from "../providers/registry";
import { ui } from "./ui";
import { bibleText } from "./doc";
import { expandMentions } from "../canvas/mentions";

export interface ShotIdea {
  title: string;
  description: string;
  shotSize: string;
  lensMm: number;
  movement: string;
  durationMs: number;
  rationale?: string;
}

export interface Proposal {
  id: string;
  nodeId: string;
  state: "thinking" | "ready" | "failed";
  items: ShotIdea[];
  provider?: string;
  error?: string;
}

export const shots = createStore<Record<string, Proposal>>({});
let seq = 0;

const SIZES = ["ECU", "CU", "MCU", "MS", "MLS", "WS", "EWS"];
const MOVES = ["static", "pan", "tilt", "dolly-in", "dolly-out", "truck", "handheld", "crane"];

/** what the agent is asked for — and the shape it must answer in */
export function shotsContract(count: number, mood: string) {
  return [
    `Propose ${count} shots for this scene${mood ? `, ${mood}` : ""}.`,
    "Answer with a JSON array only — no prose before or after. Each item:",
    `{"title": string, "description": string (what the camera sees, one or two sentences), "shotSize": one of ${SIZES.join("/")}, "lensMm": number, "movement": one of ${MOVES.join("/")}, "durationMs": number, "rationale": string (why this shot, briefly)}`,
  ].join("\n");
}

/** the same, as a schema a provider can be held to */
export const SHOTS_SCHEMA = {
  type: "object",
  properties: {
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          shotSize: { type: "string", enum: SIZES },
          lensMm: { type: "number" },
          movement: { type: "string", enum: MOVES },
          durationMs: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["title", "description", "shotSize", "lensMm", "movement", "durationMs", "rationale"],
        additionalProperties: false,
      },
    },
  },
  required: ["shots"],
  additionalProperties: false,
};

/** the shot list in a reply — an object with `shots`, or the first array, however it is wrapped */
export function parseShots(text: string): ShotIdea[] {
  let raw: Partial<ShotIdea>[] | undefined;
  try {
    const o = JSON.parse(text);
    raw = Array.isArray(o) ? o : o?.shots;
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("No shot list in the answer");
    raw = JSON.parse(m[0]);
  }
  if (!Array.isArray(raw) || !raw.length) throw new Error("An empty shot list");
  return raw.map((r, i) => ({
    title: String(r.title ?? `Shot ${i + 1}`).slice(0, 80),
    description: String(r.description ?? "").slice(0, 600),
    shotSize: SIZES.includes(String(r.shotSize)) ? String(r.shotSize) : "MS",
    lensMm: Math.min(200, Math.max(8, Number(r.lensMm) || 35)),
    movement: MOVES.includes(String(r.movement)) ? String(r.movement) : "static",
    durationMs: Math.min(60000, Math.max(500, Number(r.durationMs) || 3000)),
    rationale: r.rationale ? String(r.rationale).slice(0, 300) : undefined,
  }));
}

function context(scene: GraphNode): string {
  const g = graph.get();
  const kids = childrenOf(g, scene.id).map((c) => g.nodes[c]).filter((k) => k.status !== "rejected");
  const beats = kids.filter((k) => k.kind === "note" && k.data.text).map((k) => `- ${k.title}: ${k.data.text}`);
  const cast = Object.values(g.nodes).filter((n) => n.kind === "character" && n.status !== "rejected").map((n) => `- ${n.data.name || n.title}: ${n.data.description}`);
  const looks = Object.values(g.nodes).filter((n) => n.kind === "style" && n.status !== "rejected").map((n) => `- ${n.title}: ${n.data.description}`);
  return [
    beats.length && `Beats:\n${beats.join("\n")}`,
    cast.length && `Characters:\n${cast.join("\n")}`,
    looks.length && `Style:\n${looks.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function proposeShots(nodeId: string, count = 6, mood = "") {
  const scene = graph.get().nodes[nodeId];
  if (!scene) return;
  const id = `s${++seq}`;
  shots.set((s) => ({ ...s, [id]: { id, nodeId, state: "thinking", items: [] } }));
  try {
    const { provider } = await pick("text.generate", ui.get().writeWith);
    shots.set((s) => (s[id] ? { ...s, [id]: { ...s[id], provider: provider.descriptor.name } } : s));
    const system = [shotsContract(count, mood), bibleText(), context(scene)].filter(Boolean).join("\n\n");
    const text = await provider.generateText!({ prompt: expandMentions(String(scene.data.text ?? "")), system, schema: SHOTS_SCHEMA }, new AbortController().signal);
    const items = parseShots(text);
    shots.set((s) => (s[id] ? { ...s, [id]: { ...s[id], items, state: "ready" } } : s));
  } catch (e) {
    shots.set((s) => (s[id] ? { ...s, [id]: { ...s[id], state: "failed", error: String(e) } } : s));
  }
}

/** Keep one: it becomes a Shot inside the scene. */
export function keepShot(pid: string, index: number) {
  const p = shots.get()[pid];
  const idea = p?.items[index];
  if (!idea) return;
  const g = graph.get();
  const n = childrenOf(g, p.nodeId).length;
  const node = makeNode("shot", 60 + n * 260, 60, {
    parent: p.nodeId,
    title: idea.title,
    data: { description: idea.description, shotSize: idea.shotSize, lensMm: idea.lensMm, movement: idea.movement, durationMs: idea.durationMs },
  });
  commit("Keep shot", () =>
    graph.set((x) => ({ ...x, nodes: { ...x.nodes, [node.id]: node }, order: [...x.order, node.id] })),
  );
  dropShot(pid, index);
}

export function keepAll(pid: string) {
  const p = shots.get()[pid];
  if (!p) return;
  const g = graph.get();
  let n = childrenOf(g, p.nodeId).length;
  const nodes = p.items.map((idea) =>
    makeNode("shot", 60 + n++ * 260, 60, {
      parent: p.nodeId,
      title: idea.title,
      data: { description: idea.description, shotSize: idea.shotSize, lensMm: idea.lensMm, movement: idea.movement, durationMs: idea.durationMs },
    }),
  );
  // one entry: all of them, or none
  commit("Keep shots", () =>
    graph.set((x) => ({
      ...x,
      nodes: { ...x.nodes, ...Object.fromEntries(nodes.map((k) => [k.id, k])) },
      order: [...x.order, ...nodes.map((k) => k.id)],
    })),
  );
  dismiss(pid);
}

export function dropShot(pid: string, index: number) {
  shots.set((s) => {
    const p = s[pid];
    if (!p) return s;
    const items = p.items.filter((_, i) => i !== index);
    if (!items.length) {
      const next = { ...s };
      delete next[pid];
      return next;
    }
    return { ...s, [pid]: { ...p, items } };
  });
}

export function dismiss(pid: string) {
  shots.set((s) => {
    const next = { ...s };
    delete next[pid];
    return next;
  });
}

export const proposalsFor = (all: Record<string, Proposal>, nodeId: string) => Object.values(all).filter((p) => p.nodeId === nodeId);
