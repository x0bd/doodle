/**
 * Tags on the graph (PLAN.md M3.8): added and taken off as journal entries,
 * and the filter a board is looked at through — one tag, and only what
 * carries it stays lit. The filter belongs to the level it was set on.
 */
import { createStore } from "./store";
import { graph } from "./graph";
import { commit } from "./history";
import { nav } from "./nav";
import { withTags, withoutTag, parseTags, normTag } from "./tags";

export function addTags(ids: string[], typed: string) {
  const tags = parseTags(typed);
  if (!ids.length || !tags.length) return;
  commit("Tag", () => graph.set((g) => ({ ...g, nodes: { ...g.nodes, ...Object.fromEntries(ids.filter((id) => g.nodes[id]).map((id) => [id, withTags(g.nodes[id], tags)])) } })));
}

export function removeTag(ids: string[], tag: string) {
  commit("Untag", () => graph.set((g) => ({ ...g, nodes: { ...g.nodes, ...Object.fromEntries(ids.filter((id) => g.nodes[id]).map((id) => [id, withoutTag(g.nodes[id], tag)])) } })));
}

/** the tag the field is filtered by, and the level it was set on */
export const filtering = createStore<{ tag: string; at: string | null } | null>(null);

export function filterBy(tag: string | null) {
  filtering.set(tag ? { tag: normTag(tag), at: nav.get().focus } : null);
}

// the filter lets go when the level changes
nav.subscribe(() => {
  const f = filtering.get();
  if (f && f.at !== nav.get().focus) filtering.set(null);
});
