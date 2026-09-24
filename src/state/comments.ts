/**
 * Comments (PLAN.md M2.7): a remark on a passage, in the margin — tied to
 * its words the way a beat is (`anchors.ts`), so it stays with them through
 * edits around them, and never part of the book: not read, not exported,
 * not counted, not found. A comment is a node of its own kind, inside what
 * it is about; resolving it puts it away, reopening brings it back.
 */
import { createStore } from "./store";
import { graph, makeNode, addNode, updateData } from "./graph";
import { commit } from "./history";
import { say } from "./notice";
import type { Picked } from "../writer/Editor";

/** the words last chosen in a writer — what Edit › Add Comment is about */
export const picked = createStore<{ node: string; p: Picked } | null>(null);

/** the comment whose words are being written — its box takes the caret */
export const editing = createStore<string | null>(null);

/** whether resolved comments are shown in the margin (faded, to reopen) */
export const showResolved = createStore(false);

export function addComment(node: string, p: Picked) {
  if (!p.text.trim()) return;
  const c = makeNode("comment", 0, 0, { parent: node, title: "Comment", data: { text: "", resolved: 0 }, anchor: { node, text: p.text, at: p.at } });
  addNode(c);
  editing.set(c.id);
}

/** Edit › Add Comment (⌥⌘M): on the words chosen in the writer */
export function commentOnSelection() {
  const x = picked.get();
  if (!x || !x.p.text.trim()) return void say("Select the words the comment is about, then add it.");
  addComment(x.node, x.p);
}

export const resolveComment = (id: string, done: boolean) => updateData(id, { resolved: done ? 1 : 0 });

export function removeComment(id: string) {
  commit("Delete comment", () =>
    graph.set((g) => {
      const nodes = { ...g.nodes };
      delete nodes[id];
      return { ...g, nodes, order: g.order.filter((x) => x !== id), selection: g.selection.filter((x) => x !== id) };
    }),
  );
}
