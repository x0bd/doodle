import { describe, expect, it } from "vitest";
import { check, FORMAT, Unreadable } from "./integrity";

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
