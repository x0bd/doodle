import { describe, expect, it } from "vitest";
import { delta, replay, type Tracked } from "./recovery";
import type { GraphNode } from "./graph";

const node = (id: string, text: string) => ({ id, kind: "note", x: 0, y: 0, w: 200, h: 100, title: id, data: { text } }) as unknown as GraphNode;

const saved: Tracked = {
  nodes: { a: node("a", "one"), b: node("b", "two") },
  order: ["a", "b"],
  edges: {},
  bible: { tone: "", rules: "", avoid: "" },
  name: "Book",
  provenance: {},
};

/** as the stores do it: what changes is a new object, the rest is shared */
const edit = (s: Tracked, id: string, text: string): Tracked => ({ ...s, nodes: { ...s.nodes, [id]: node(id, text) } });

const log = (...states: Tracked[]) =>
  states
    .slice(1)
    .map((s, i) => delta(states[i], s))
    .filter(Boolean)
    .map((l) => JSON.stringify(l))
    .join("\n");

describe("recovery log", () => {
  it("writes only what changed", () => {
    const next = edit(saved, "a", "one more");
    const l = delta(saved, next)!;
    expect(Object.keys(l.nodes!)).toEqual(["a"]);
    expect(l.order).toBeUndefined();
    expect(delta(next, next)).toBeNull();
  });

  it("replays typing, a new node and a deletion onto the saved file", () => {
    const s1 = edit(saved, "a", "one m");
    const s2 = edit(s1, "a", "one more words");
    const s3 = { ...edit(s2, "c", "three"), order: ["a", "b", "c"] };
    const s4 = { ...s3, nodes: Object.fromEntries(Object.entries(s3.nodes).filter(([k]) => k !== "b")), order: ["a", "c"] };
    const r = replay(saved, log(saved, s1, s2, s3, s4))!;
    expect(r.changes).toBe(4);
    expect(r.state.nodes.a.data.text).toBe("one more words");
    expect(r.state.nodes.b).toBeUndefined();
    expect(r.state.order).toEqual(["a", "c"]);
  });

  it("skips the line a crash cut short and keeps the ones before it", () => {
    const s1 = edit(saved, "a", "kept");
    const s2 = edit(s1, "a", "kept, and lost");
    const text = log(saved, s1, s2);
    const cut = text.slice(0, text.length - 12);
    expect(replay(saved, cut)!.state.nodes.a.data.text).toBe("kept");
  });

  it("says nothing when the log holds only what the file has", () => {
    const s1 = edit(saved, "a", "saved already");
    const text = log(saved, s1);
    expect(replay(s1, text)).toBeNull();
    expect(replay(saved, "")).toBeNull();
  });

  it("does not count a card's measured height as work to recover", () => {
    const measured = { ...saved, nodes: { ...saved.nodes, a: { ...saved.nodes.a, h: 137 } } };
    expect(replay(saved, log(saved, measured))).toBeNull();
    const typed = edit(measured, "b", "and words");
    expect(replay(saved, log(saved, measured, typed))).not.toBeNull();
  });

  it("rebuilds a graph that was never saved from its base line", () => {
    const base = JSON.stringify({ t: 1, base: saved });
    const s1 = edit(saved, "b", "written before the crash");
    const r = replay(null, `${base}\n${log(saved, s1)}`)!;
    expect(r.state.nodes.b.data.text).toBe("written before the crash");
    expect(replay(null, base)).toBeNull(); // a base with nothing after it: nothing to recover
    const measured = { ...saved, nodes: { ...saved.nodes, a: { ...saved.nodes.a, h: 90 } } };
    expect(replay(null, `${base}\n${log(saved, measured)}`)).toBeNull(); // nor a base only measured
  });

  it("trims an order and edges that name nodes no line gave", () => {
    const s1 = { ...saved, order: ["a", "b", "ghost"], edges: { e: { id: "e", from: { node: "ghost", port: "text" }, to: { node: "a", port: "text" } } } } as unknown as Tracked;
    const r = replay(saved, log(saved, s1))!;
    expect(r.state.order).toEqual(["a", "b"]);
    expect(r.state.edges).toEqual({});
  });
});
