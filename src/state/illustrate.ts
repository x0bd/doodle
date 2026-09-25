/**
 * Illustrate a passage (PLAN.md M5.3): words chosen in a chapter → a brief
 * made of them, naming (with `@`) who, where and what the passage names —
 * or, when it names no one, whoever the chapter names most — so their
 * pictures ride into the request (M5.2) and the picture has the people in
 * it looking like themselves. The brief is tied to the passage; a
 * generator made for it runs at once. Its takes wait under the chapter's
 * words, each a key away from being a figure beside the passage (M5.4).
 */
import { graph, childrenOf, makeNode, type GraphNode, type GraphState } from "./graph";
import { commit } from "./history";
import { enqueue } from "./jobs";
import { doc, save } from "./doc";
import { say } from "./notice";
import { namedIn, appearances } from "./appears";
import { figureAfter, figureLine } from "../writer/markup";
import { inTauri, writeAsset } from "../platform/fs";
import type { Picked } from "../writer/Editor";
import { KINDS } from "../graph/kinds";

const LOOKED = new Set(["character", "location", "object"]);
/** a book's pictures are wider than they are tall, unless asked */
const FRAME = "3:2";
const TAKES = 2;

/** the generators made to illustrate a chapter's passages, oldest first */
export const illustrationsOf = (g: GraphState, host: string) =>
  childrenOf(g, host)
    .map((id) => g.nodes[id])
    .filter((n) => n.kind === "generate" && n.data.illustrates)
    .sort((a, b) => a.seq - b.seq);

/** the brief an illustration was made from */
export const briefOf = (g: { nodes: Record<string, GraphNode> }, gen: GraphNode) => g.nodes[String(gen.data.illustrates)];

/** Illustrate the chosen words of a chapter or page. */
export function illustrate(hostId: string, p: Picked) {
  const g = graph.get();
  const host = g.nodes[hostId];
  const passage = p.text.trim();
  if (!host || !passage) return;
  const known = Object.values(g.nodes).filter((n) => LOOKED.has(n.kind) && n.status !== "rejected");
  let cast = namedIn(passage, known);
  // no one named in the passage: whoever the chapter names most
  if (!cast.some((n) => n.kind === "character")) {
    const most = known
      .filter((n) => n.kind === "character")
      .map((n) => ({ n, count: appearances(n, [host as GraphNode & { status: string; seq: number; parent: string | null }])[0]?.count ?? 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)[0];
    if (most) cast = [most.n, ...cast];
  }
  const n = illustrationsOf(g, hostId).length + 1;
  const words = passage.length > 48 ? `${passage.slice(0, 48).replace(/\s+\S*$/, "")}…` : passage;
  const brief = makeNode("prompt", 60 + (n - 1) * 380, 900, {
    parent: hostId,
    title: `Illustration ${n}`,
    status: "draft",
    anchor: { node: hostId, text: p.text, at: p.at },
    data: { text: [passage, cast.length ? `In it: ${cast.map((c) => `@${c.title}`).join(", ")}.` : ""].filter(Boolean).join("\n\n") },
  });
  const gen = makeNode("generate", 60 + (n - 1) * 380, 1100, {
    parent: hostId,
    title: `Illustration ${n}`,
    status: "draft",
    data: { ...KINDS.generate.data, frame: FRAME, count: TAKES, control: "Random", illustrates: brief.id, quote: words },
  });
  const edge = { id: `e${brief.id}`, from: { node: brief.id, port: "text" }, to: { node: gen.id, port: "positive" } };
  commit("Illustrate", () =>
    graph.set((x) => ({ ...x, nodes: { ...x.nodes, [brief.id]: brief, [gen.id]: gen }, order: [...x.order, brief.id, gen.id], edges: { ...x.edges, [edge.id]: edge } })),
  );
  enqueue([gen.id]);
  say(`Illustrating “${words}”${cast.length ? ` with ${cast.map((c) => c.title).join(", ")}` : ""} — the takes arrive under the words.`);
}

/** A take into the words, as a figure after the passage it illustrates. */
export async function takeIntoWords(hostId: string, genId: string, take: string) {
  const g = graph.get();
  const host = g.nodes[hostId];
  const gen = g.nodes[genId];
  if (!host || !gen) return;
  let src = take;
  // a take still in memory is given a home in the project first
  if (src.startsWith("data:") && inTauri) {
    if (!doc.get().path && !(await save())) return;
    src = (await writeAsset(doc.get().path!, src)).rel;
  }
  const quote = briefOf(g, gen)?.anchor?.text ?? "";
  const text = String(graph.get().nodes[hostId]?.data.text ?? "");
  commit("Into the words", () =>
    graph.set((x) => ({ ...x, nodes: { ...x.nodes, [hostId]: { ...x.nodes[hostId], data: { ...x.nodes[hostId].data, text: figureAfter(text, quote, figureLine({ src })) } } } })),
  );
}
