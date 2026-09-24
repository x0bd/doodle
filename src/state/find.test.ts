import { describe, expect, it } from "vitest";
import { findAll, replaceAll, pattern, type Hit } from "./find";
import type { GraphNode } from "./graph";

const n = (id: string, kind: string, data: Record<string, string>, extra: Partial<GraphNode> = {}) =>
  ({ id, kind, title: id, data, x: 0, y: 0, w: 1, h: 1, seq: 1, parent: null, status: "canon", ...extra }) as unknown as GraphNode;

const book = {
  nodes: {
    mara: n("mara", "character", { name: "Mara", description: "Mara keeps the light." }, { title: "Mara" }),
    ch1: n("ch1", "chapter", { summary: "Mara wakes.", text: "Mara woke. **Mara** counted gulls. Tamara did not.\n\nMARA said nothing." }),
    beat: n("beat", "note", { text: "Why is Mara up?" }, { parent: "ch1", anchor: { node: "ch1", text: "Mara counted gulls", at: 11 } }),
    gone: n("gone", "page", { text: "Mara, rejected." }, { status: "rejected" }),
  },
  order: ["mara", "ch1", "beat", "gone"],
};
const hits = (q: string, o = {}) => findAll(book, q, o) as Hit[];

describe("find across the book", () => {
  it("finds every place a name is written, in order, and leaves rejected cards be", () => {
    const h = hits("Mara");
    expect(h.map((x) => `${x.node}.${x.field}`)).toEqual([
      "mara.title", "mara.name", "mara.description",
      "ch1.summary", "ch1.text", "ch1.text", "ch1.text", "ch1.text",
      "beat.text",
    ]);
    expect(h[4]).toMatchObject({ match: "Mara", before: "" });
    expect(h[4].after.startsWith(" woke. **Mara** counted gulls.")).toBe(true);
  });

  it("case and whole words narrow it", () => {
    // in ch1: the summary's Mara, then the words' Mara, **Mara**, Tamara, MARA
    expect(hits("Mara", { cased: true }).filter((x) => x.node === "ch1").length).toBe(3); // not Tamara's "mara", not MARA
    expect(hits("Mara", { whole: true }).filter((x) => x.node === "ch1").length).toBe(4); // not Tamara
    expect(hits("Mara", { whole: true, cased: true }).filter((x) => x.node === "ch1").length).toBe(3);
  });

  it("a pattern, and a pattern that is not one", () => {
    expect(hits("gull[s]?", { regex: true }).length).toBe(1);
    expect(pattern("(", { regex: true })).toMatch(/^Not a pattern/);
    expect(pattern("x*", { regex: true })).toMatch(/matches nothing/);
    expect(pattern("", {})).toMatch(/Nothing/);
  });
});

describe("replace across the book", () => {
  it("renames a character everywhere, keeps the marks, and the tie follows its words", () => {
    const r = replaceAll(book, "Mara", "Maren", { whole: true, cased: true });
    if (typeof r === "string") throw new Error(r);
    expect(r.count).toBe(7); // the card's title, name and description; ch1's summary and two in its words; the beat
    expect(r.nodes.ch1.data.text).toBe("Maren woke. **Maren** counted gulls. Tamara did not.\n\nMARA said nothing.");
    expect(r.nodes.mara.title).toBe("Maren");
    expect(r.nodes.mara.data.name).toBe("Maren");
    expect(r.nodes.beat.anchor?.text).toBe("Maren counted gulls");
    expect(r.nodes.gone.data.text).toBe("Mara, rejected.");
    expect(book.nodes.ch1.data.text).toContain("Mara woke"); // the graph it was given is untouched
  });

  it("one hit alone", () => {
    const h = hits("Mara", { whole: true, cased: true }).filter((x) => x.node === "ch1")[2]; // the bold one
    const r = replaceAll(book, "Mara", "She", { whole: true, cased: true }, h);
    if (typeof r === "string") throw new Error(r);
    expect(r.count).toBe(1);
    expect(r.nodes.ch1.data.text).toBe("Mara woke. **She** counted gulls. Tamara did not.\n\nMARA said nothing.");
  });

  it("groups in a pattern's replacement; a dollar sign in a plain one is only a dollar sign", () => {
    const r = replaceAll(book, "(\\w+) did (\\w+)", "$2 did $1", { regex: true });
    if (typeof r === "string") throw new Error(r);
    expect(r.nodes.ch1.data.text).toContain("not did Tamara.");
    expect(r.nodes.beat.anchor?.text).toBe("Mara counted gulls"); // its words were not touched, so neither is the tie
    const p = replaceAll(book, "gulls", "$1 gulls", {});
    if (typeof p === "string") throw new Error(p);
    expect(p.nodes.ch1.data.text).toContain("$1 gulls");
  });
});
