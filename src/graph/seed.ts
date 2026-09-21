/**
 * The images template: the mockup's graph, wired. The other templates —
 * book, manga, film — arrive with their kinds.
 */
import { makeNode, type Edge, type GraphNode } from "../state/graph";
import { FIXTURES } from "../providers/fixtures";

export function seedGraph(): { nodes: Record<string, GraphNode>; order: string[]; edges: Record<string, Edge> } {
  const nodes: GraphNode[] = [
    makeNode("model", 80, 140, { id: "n1" }),
    makeNode("prompt", 400, 40, {
      id: "n2",
      data: { text: "A black bear with a pink snout, minimalist style, soft gradients, clear blue sky" },
    }),
    makeNode("prompt", 400, 250, {
      id: "n3",
      title: "Negative",
      data: { text: "No text, unnecessary details, background objects, other animals or people." },
    }),
    makeNode("generate", 720, 120, { id: "n4" }),
    makeNode("preview", 1060, 100, { id: "n5", asset: FIXTURES.blackBear }),
  ];
  const edges: Edge[] = [
    { id: "e1", from: { node: "n1", port: "model" }, to: { node: "n4", port: "model" } },
    { id: "e2", from: { node: "n2", port: "text" }, to: { node: "n4", port: "positive" } },
    { id: "e3", from: { node: "n3", port: "text" }, to: { node: "n4", port: "negative" } },
    { id: "e4", from: { node: "n4", port: "image" }, to: { node: "n5", port: "image" } },
  ];
  return {
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    order: nodes.map((n) => n.id),
    edges: Object.fromEntries(edges.map((e) => [e.id, e])),
  };
}
