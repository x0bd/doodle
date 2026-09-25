import { describe, expect, it } from "vitest";
import { cut, passagesOf, hash, AIM, MOST } from "./passages";

const para = (n: number, w = "word") => Array.from({ length: n }, (_, i) => `${w}${i}`).join(" ") + ".";
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

describe("a book in passages", () => {
  it("gathers short paragraphs to about the aim, never splitting one that fits", () => {
    const text = Array.from({ length: 12 }, (_, i) => para(40, `p${i}w`)).join("\n\n");
    const parts = cut(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(words(p.text)).toBeLessThanOrEqual(AIM);
    // every paragraph whole, in order
    expect(parts.map((p) => p.text).join("\n\n")).toBe(text);
  });

  it("cuts a paragraph longer than the most at its sentences", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence ${i} has a few more words in it.`).join(" ");
    expect(words(long)).toBeGreaterThan(MOST);
    const parts = cut(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(words(p.text)).toBeLessThanOrEqual(AIM + 12);
  });

  it("leaves out scene breaks and pictures, and knows a document's pages", () => {
    const parts = cut(`${para(200, "a")}\n\n* * *\n\n![](assets/x.jpg)\f${para(200, "b")}`);
    expect(parts.map((p) => p.page)).toEqual([1, 2]);
    expect(parts.some((p) => p.text.includes("* * *") || p.text.includes("assets/"))).toBe(false);
  });

  it("reads chapters, pages, notes and documents — not pictures, not what was rejected", () => {
    const n = (id: string, kind: string, text: string, extra: Record<string, unknown> = {}, status = "draft") => ({ id, kind, status, data: { text, ...extra } });
    const got = passagesOf([
      n("c", "chapter", "The ship came in."),
      n("p", "page", "She saw it."),
      n("k", "clip", "A letter.\fPage two.", { what: "document" }),
      n("i", "clip", "", { what: "picture", seen: "A harbour at dusk." }),
      n("r", "chapter", "Gone.", {}, "rejected"),
      n("g", "generate", "Not words."),
    ]);
    expect(got.map((p) => p.node)).toEqual(["c", "p", "k"]);
    expect(got.find((p) => p.node === "k")?.page).toBe(1);
  });

  it("knows a passage by its words: the same words, the same key; changed, a new one", () => {
    const a = passagesOf([{ id: "c", kind: "chapter", status: "draft", data: { text: "The ship came in." } }], "m");
    const b = passagesOf([{ id: "d", kind: "page", status: "draft", data: { text: "The ship came in." } }], "m");
    expect(a[0].key).toBe(b[0].key);
    expect(hash("m\nThe ship came in!")).not.toBe(a[0].key);
    expect(passagesOf([{ id: "c", kind: "chapter", status: "draft", data: { text: "The ship came in." } }], "other")[0].key).not.toBe(a[0].key);
  });
});
