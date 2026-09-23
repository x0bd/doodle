/**
 * Finding things by what they say (⌘K): a card's name, its kind, its words
 * and its fields, one lowercase haystack each. The palette and the
 * benchmark (M1.9) run the same function.
 */
import { KINDS } from "../graph/kinds";
import type { GraphNode, GraphState } from "./graph";

export function findNodes(g: Pick<GraphState, "nodes" | "order">, query: string, limit = 12): GraphNode[] {
  const needle = query.trim().toLowerCase();
  return g.order
    .map((id) => g.nodes[id])
    .filter((n) => {
      if (!needle) return true;
      const words = `${n.title} ${KINDS[n.kind].title} ${n.data.text ?? ""} ${n.data.description ?? ""} ${n.data.name ?? ""}`.toLowerCase();
      return words.includes(needle);
    })
    .sort((a, b) => {
      const ta = a.title.toLowerCase().startsWith(needle) ? 0 : 1;
      const tb = b.title.toLowerCase().startsWith(needle) ? 0 : 1;
      return ta - tb || a.seq - b.seq;
    })
    .slice(0, limit);
}
