/**
 * Tags (PLAN.md M3.8): words the writer files things under — a clipping, a
 * character, a chapter — found by ⌘K (`#harbour`) and used to filter a
 * board, so only what carries the tag stays lit. The pure part here.
 */
import type { GraphNode } from "./graph";

/** a tag as it is kept: lowercase, no `#`, its spaces single */
export const normTag = (s: string) => s.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase().slice(0, 40);

/** what was typed (`harbour, #Mara  sea`) → tags; commas part them, as do spaces after a `#` */
export function parseTags(typed: string): string[] {
  const parts = typed.includes(",") ? typed.split(",") : typed.includes("#") ? typed.split(/\s(?=#)/) : [typed];
  return [...new Set(parts.map(normTag).filter(Boolean))];
}

export const hasTag = (n: GraphNode, tag: string) => !!n.tags?.includes(normTag(tag));

/** the tags among these, most used first, with how many carry each */
export function tagsIn(nodes: GraphNode[]): { tag: string; n: number }[] {
  const count = new Map<string, number>();
  for (const n of nodes) for (const t of n.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
}

/** a node with these tags added, or this one taken off */
export const withTags = (n: GraphNode, add: string[]): GraphNode => ({ ...n, tags: [...new Set([...(n.tags ?? []), ...add.map(normTag).filter(Boolean)])] });
export function withoutTag(n: GraphNode, tag: string): GraphNode {
  const out: GraphNode = { ...n, tags: (n.tags ?? []).filter((t) => t !== normTag(tag)) };
  if (!out.tags!.length) delete out.tags;
  return out;
}
