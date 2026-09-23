import { describe, expect, it } from "vitest";
import { due, restoreInto, subtree, touched, wordsOf, type Sub, type VersionMeta } from "./versions";
import type { GraphNode } from "./graph";

const n = (id: string, kind: string, parent: string | null, data: Record<string, string> = {}, title = id) =>
  ({ id, kind, parent, title, data, x: 0, y: 0, w: 300, h: 200, seq: 1, status: "canon" }) as unknown as GraphNode;

/** a chapter of two pages, a beat inside the first, and a character outside */
const book: Sub = {
  nodes: {
    ch: n("ch", "chapter", null, { summary: "" }, "Chapter 1"),
    p1: n("p1", "page", "ch", { text: "Mara woke." }),
    p2: n("p2", "page", "ch", { text: "The ship was gone." }),
    b1: n("b1", "note", "p1", { text: "a beat" }),
    mara: n("mara", "character", null, { name: "Mara", description: "A pilot." }),
  },
  order: ["ch", "p1", "p2", "b1", "mara"],
  edges: {
    e1: { id: "e1", from: { node: "mara", port: "character" }, to: { node: "p1", port: "text" } },
    e2: { id: "e2", from: { node: "p1", port: "text" }, to: { node: "p2", port: "text" } },
  },
};

const edit = (s: Sub, id: string, text: string): Sub => ({ ...s, nodes: { ...s.nodes, [id]: { ...s.nodes[id], data: { ...s.nodes[id].data, text } } } });

describe("versions", () => {
  it("a chapter's version holds it, its pages and what they hold, and the wires between them", () => {
    const sub = subtree(book, "ch");
    expect(Object.keys(sub.nodes).sort()).toEqual(["b1", "ch", "p1", "p2"]);
    expect(Object.keys(sub.edges)).toEqual(["e2"]);
    expect(wordsOf(sub, "ch")).toContain("Mara woke.\n\nThe ship was gone.");
    expect(wordsOf(book, "mara")).toBe("Name: Mara\n\nDescription: A pilot.");
  });

  it("an edit on a page touches the page and the chapter it is in, not what is beside it", () => {
    expect([...touched(book, edit(book, "p2", "The ship was there."))].sort()).toEqual(["ch", "p2"]);
    expect([...touched(book, edit(book, "b1", "a sharper beat"))].sort()).toEqual(["b1", "ch", "p1"]);
    // a card measured, or moved, is not an edit
    const moved = { ...book, nodes: { ...book.nodes, p1: { ...book.nodes.p1, x: 90, h: 410 } } };
    expect(touched(book, moved).size).toBe(0);
  });

  it("a page deleted from a chapter changes the chapter; a new one changes only its chapter", () => {
    const { p2: _gone, ...rest } = book.nodes;
    expect([...touched(book, { ...book, nodes: rest })].sort()).toEqual(["ch", "p2"]);
    const added = { ...book, nodes: { ...book.nodes, p3: n("p3", "page", "ch", { text: "new" }) } };
    expect([...touched(book, added)]).toEqual(["ch"]);
  });

  it("one daily version a day per node", () => {
    const today: VersionMeta = { id: "v1", node: "ch", kind: "chapter", title: "", at: Date.now(), reason: "daily", words: 0 };
    const yesterday = { ...today, id: "v0", node: "p1", at: Date.now() - 36 * 3600 * 1000 };
    const kept = { ...today, id: "v2", node: "p2", reason: "kept" as const };
    expect(due(["ch", "p1", "p2"], [today, yesterday, kept]).sort()).toEqual(["p1", "p2"]);
  });

  it("a restore puts the chapter back as it was, leaves the rest, and keeps it where it now sits", () => {
    const old = subtree(book, "ch");
    let now = edit(book, "p1", "Mara woke late.");
    now = { ...now, nodes: { ...now.nodes, p3: n("p3", "page", "ch", { text: "added since" }), ch: { ...now.nodes.ch, x: 500 } }, order: [...now.order, "p3"] };
    const { b1: _b, ...noBeat } = now.nodes;
    now = { ...now, nodes: noBeat, order: now.order.filter((i) => i !== "b1") };
    const back = restoreInto(now, old, "ch");
    expect(back.nodes.p1.data.text).toBe("Mara woke.");
    expect(back.nodes.p3).toBeUndefined();
    expect(back.nodes.b1).toBeDefined();
    expect(back.nodes.mara).toBe(book.nodes.mara);
    expect(back.nodes.ch.x).toBe(500);
    expect(back.order).toEqual(["ch", "p1", "p2", "mara", "b1"]);
    expect(Object.keys(back.edges).sort()).toEqual(["e1", "e2"]);
  });
});
