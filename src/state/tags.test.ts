import { describe, expect, it } from "vitest";
import { normTag, parseTags, tagsIn, withTags, withoutTag, hasTag } from "./tags";
import { findNodes } from "./search";
import type { GraphNode } from "./graph";

const node = (id: string, tags?: string[], title = id): GraphNode => ({ id, kind: "clip", title, x: 0, y: 0, w: 1, h: 1, seq: 1, parent: null, status: "draft", data: { what: "picture" }, ...(tags ? { tags } : {}) });

describe("tags", () => {
  it("are kept lowercase, without their #", () => {
    expect(normTag("  #Harbour  Light ")).toBe("harbour light");
    expect(parseTags("harbour, #Mara ,  sea")).toEqual(["harbour", "mara", "sea"]);
    expect(parseTags("#harbour #the sea")).toEqual(["harbour", "the sea"]);
    expect(parseTags("dusk")).toEqual(["dusk"]);
  });

  it("are added once, taken off cleanly, and counted", () => {
    const a = withTags(node("a"), ["Harbour", "harbour", "sea"]);
    expect(a.tags).toEqual(["harbour", "sea"]);
    expect(hasTag(a, "#HARBOUR")).toBe(true);
    const b = withoutTag(withoutTag(a, "harbour"), "sea");
    expect(b.tags).toBeUndefined();
    expect(tagsIn([a, node("b", ["sea"]), node("c", ["sea", "mara"])])).toEqual([
      { tag: "sea", n: 3 },
      { tag: "harbour", n: 1 },
      { tag: "mara", n: 1 },
    ]);
  });

  it("⌘K finds by tag: #harbour finds what carries it; a plain word finds it too", () => {
    const g = { nodes: { a: node("a", ["harbour"], "Sunset"), b: node("b", ["sea"], "Harbour wall"), c: node("c") }, order: ["a", "b", "c"] };
    expect(findNodes(g, "#harbour").map((n) => n.id)).toEqual(["a"]);
    expect(findNodes(g, "#har").map((n) => n.id)).toEqual(["a"]);
    expect(findNodes(g, "harbour").map((n) => n.id).sort()).toEqual(["a", "b"]);
  });
});
