import { describe, expect, it } from "vitest";
import { lexicon, knows } from "./lexicon";
import type { GraphNode } from "./graph";

const n = (id: string, kind: string, title: string, data: Record<string, string> = {}) => ({ id, kind, title, data }) as unknown as GraphNode;

describe("the book's own words", () => {
  const g = {
    nodes: {
      a: n("a", "character", "Mara", { name: "Mara Quillon" }),
      b: n("b", "character", "Tom Keel"),
      c: n("c", "location", "Saint-Ives-under-Tor"),
      d: n("d", "chapter", "Zyxwv"), // a chapter's title is not a name the checker must learn
    },
  };
  const words = lexicon(g, ["gloaming"], ["xylo"]);
  it("knows every name of the people and places, by its parts", () => {
    for (const w of ["Mara", "Quillon", "Keel", "Tom", "Saint", "Ives", "Tor", "saint-ives-under-tor"]) expect(knows(words, w)).toBe(true);
    expect(knows(words, "Zyxwv")).toBe(false);
  });
  it("knows a possessive of a name, and the words taught and ignored", () => {
    expect(knows(words, "Mara's")).toBe(true);
    expect(knows(words, "Keel’s")).toBe(true);
    expect(knows(words, "Gloaming")).toBe(true);
    expect(knows(words, "xylo")).toBe(true);
    expect(knows(words, "lihgt")).toBe(false);
  });
});
