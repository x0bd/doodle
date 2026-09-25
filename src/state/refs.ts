/**
 * References (the studio, 2026-09-25): what rides into a picture's request
 * to say how it should look — a picture by its ref, or a node that stands
 * for pictures: a board (its pictures, as a moodboard), a style (its
 * references), someone, somewhere or something (their picture), a clipping.
 * Kept on a generator as `data.refs` (JSON). Pure.
 */
import { childrenOf, type GraphNode } from "./graph";

/** what a reference is: a picture by its ref, or a node — a board (its
 *  pictures, as mood), a style (its references), someone or somewhere or
 *  something (their picture), a clipping (its picture) */
export type Ref = { picture: string } | { node: string };

export const refsOf = (gen: GraphNode): Ref[] => {
  try {
    const r = JSON.parse(String(gen.data.refs ?? "[]"));
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
};
export const same = (a: Ref, b: Ref) => ("picture" in a && "picture" in b && a.picture === b.picture) || ("node" in a && "node" in b && a.node === b.node);

/** the pictures a node stands for, when it is a reference — at most `max` */
export function picturesOfNode(n: GraphNode, g: { nodes: Record<string, GraphNode>; order: string[] }, max = 6): string[] {
  if (n.kind === "board")
    return childrenOf(g as never, n.id)
      .map((id) => g.nodes[id])
      .filter((c) => c.kind === "clip" && c.data.what === "picture" && c.asset)
      .map((c) => c.asset!)
      .slice(0, max);
  if (n.kind === "style") return (n.attachments ?? []).slice(0, max);
  return n.asset ? [n.asset] : [];
}

