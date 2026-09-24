import { describe, expect, it } from "vitest";
import { check, FORMAT, Unreadable } from "./integrity";
import { plain } from "../writer/markup";
import { locate } from "./anchors";

const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "note", x: 0, y: 0, w: 240, h: 176, title: id, data: { text: id }, seq: 1, parent: null, status: "canon", ...extra });
const good = {
  format: "doodle-graph",
  version: 1,
  name: "Book",
  nodes: { a: card("a"), b: card("b", { parent: "a" }) },
  order: ["a", "b"],
  edges: { e: { id: "e", from: { node: "a", port: "text" }, to: { node: "b", port: "text" } } },
  camera: { x: 0, y: 0, zoom: 1 },
};
const text = (o: unknown) => JSON.stringify(o);
const why = (t: string) => {
  try {
    check(t);
    return null;
  } catch (e) {
    return e as Unreadable;
  }
};

describe("integrity", () => {
  it("a sound graph passes untouched", () => {
    const { file, fixes } = check(text(good));
    expect(fixes).toEqual([]);
    expect(file.order).toEqual(["a", "b"]);
    expect(file.version).toBe(FORMAT);
  });

  it("a cut-short file, or one that is not a graph, is damaged — a backup is better", () => {
    const cut = text(good).slice(0, 80);
    expect(why(cut)?.newer).toBe(false);
    expect(why(text({ hello: 1 }))?.message).toMatch(/not a Doodle graph/);
    expect(why(text({ ...good, nodes: "gone" }))?.message).toMatch(/lost its cards/);
  });

  it("a newer format is refused as newer, not damaged", () => {
    const e = why(text({ ...good, version: FORMAT + 1 }));
    expect(e?.newer).toBe(true);
  });

  it("a file from before versions is brought up to the current format", () => {
    const { version: _v, ...old } = good;
    expect(check(text(old)).file.version).toBe(FORMAT);
  });

  it("sets right the order, loose wires, lost parents and cycles — and says so", () => {
    const bad = {
      ...good,
      nodes: {
        a: card("a", { parent: "b" }),
        b: card("b", { parent: "a" }), // a and b inside each other
        c: card("c", { parent: "gone" }),
        d: { kind: "hologram" },
      },
      order: ["a", "a", "ghost"],
      edges: { e: good.edges.e, f: { id: "f", from: { node: "ghost", port: "text" }, to: { node: "a", port: "text" } } },
    };
    const { file, fixes } = check(text(bad));
    expect(Object.keys(file.nodes).sort()).toEqual(["a", "b", "c"]);
    expect(file.order).toEqual(["a", "b", "c"]);
    expect(Object.keys(file.edges)).toEqual(["e"]);
    expect(file.nodes.c.parent).toBeNull();
    // the cycle is broken, one of them at the top
    expect([file.nodes.a.parent, file.nodes.b.parent]).toContain(null);
    expect(fixes.join(" · ")).toMatch(/could not read.*at the top.*order.*wire/);
  });

  it("fills in a card's missing parts", () => {
    const { file, fixes } = check(text({ ...good, nodes: { a: { kind: "note", data: { text: "x" } } }, order: ["a"], edges: {} }));
    expect(file.nodes.a).toMatchObject({ id: "a", x: 0, w: 240, title: "Note", status: "canon", parent: null });
    expect(fixes[0]).toMatch(/filled in/);
  });
});

describe("format 2: the chapter is the manuscript (D1)", () => {
  const v1 = {
    format: "doodle-graph",
    version: 1,
    name: "Book",
    nodes: {
      ch: { id: "ch", kind: "chapter", x: 0, y: 0, w: 280, h: 236, title: "One", data: { summary: "The ship" }, seq: 1, parent: null, status: "canon" },
      w: { id: "w", kind: "write", x: 0, y: 0, w: 300, h: 300, title: "Writer", data: {}, seq: 2, parent: "ch", status: "canon" },
      p2: { id: "p2", kind: "page", x: 400, y: 0, w: 300, h: 400, title: "Page 2", data: { text: "The ship was **gone** by noon." }, seq: 4, parent: "ch", status: "canon", attachments: ["assets/x.png"] },
      p1: { id: "p1", kind: "page", x: 0, y: 0, w: 300, h: 400, title: "Page 1", data: { text: "Mara woke.\n\nShe counted gulls." }, seq: 3, parent: "ch", status: "canon" },
      b: { id: "b", kind: "note", x: 0, y: 0, w: 240, h: 150, title: "Beat", data: { text: "gone" }, seq: 5, parent: "p2", status: "canon", anchor: { node: "p2", text: "ship was gone", at: 4 } },
      loose: { id: "loose", kind: "page", x: 0, y: 900, w: 300, h: 400, title: "Loose", data: { text: "A page on its own." }, seq: 6, parent: null, status: "canon" },
    },
    order: ["ch", "w", "p2", "p1", "b", "loose"],
    edges: { e: { id: "e", from: { node: "w", port: "text" }, to: { node: "p1", port: "text" } } },
    camera: { x: 0, y: 0, zoom: 1 },
  };

  it("joins a chapter's pages, in their order, into its words — no word lost", () => {
    const { file, fixes } = check(JSON.stringify(v1));
    expect(file.version).toBe(2);
    expect(file.nodes.ch.data.text).toBe("Mara woke.\n\nShe counted gulls.\n\nThe ship was **gone** by noon.");
    expect(file.nodes.ch.data.summary).toBe("The ship");
    expect(file.nodes.p1).toBeUndefined();
    expect(file.nodes.p2).toBeUndefined();
    expect(file.nodes.loose.kind).toBe("page"); // not in a chapter: left alone
    expect(file.order).toEqual(["ch", "w", "b", "loose"]);
    expect(file.nodes.ch.attachments).toEqual(["assets/x.png"]);
    expect(fixes[0]).toMatch(/joined into one manuscript/);
  });

  it("a beat tied to a page is tied to the same words in the chapter", () => {
    const { file } = check(JSON.stringify(v1));
    const b = file.nodes.b;
    expect(b.parent).toBe("ch");
    expect(b.anchor?.node).toBe("ch");
    const words = plain(String(file.nodes.ch.data.text));
    expect(words.slice(b.anchor!.at, b.anchor!.at + "ship was gone".length)).toBe("ship was gone");
    expect(locate(words, b.anchor!)).not.toBeNull();
  });

  it("a writer that fed a page feeds its chapter", () => {
    const { file } = check(JSON.stringify(v1));
    expect(file.edges.e.to).toEqual({ node: "ch", port: "text" });
  });

  it("a chapter with no pages gets empty words, and nothing is said", () => {
    const { file, fixes } = check(JSON.stringify({ ...v1, nodes: { ch: v1.nodes.ch }, order: ["ch"], edges: {} }));
    expect(file.nodes.ch.data.text).toBe("");
    expect(fixes).toEqual([]);
  });
});
