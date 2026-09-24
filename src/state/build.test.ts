import { describe, expect, it } from "vitest";
import { digest, parseBuild } from "./proposals";
import type { GraphNode } from "./graph";

const clip = (id: string, what: string, data: Record<string, string | number>, title = id): GraphNode =>
  ({ id, kind: "clip", title, x: 0, y: 0, w: 240, h: 100, seq: 1, parent: "b", status: "draft", data: { what, ...data } }) as GraphNode;

describe("building from the board", () => {
  const nodes = [
    clip("pic", "picture", { seen: "A yellow sun over a navy sea." }, "harbour-03"),
    clip("doc", "document", { text: "# Chapter One\n\nMara keeps the lamp.\f\n\nThe ship comes in.", from: "log.pdf" }, "The Keeper's Log"),
    clip("pas", "passage", { text: "The glass falling since noon.", from: "log.pdf", page: 2, note: "the storm" }),
    { ...clip("n", "", { text: "Mara is seventeen." }, "Age"), kind: "note" } as GraphNode,
  ];

  it("numbers the board: documents, then passages, notes and pictures, each with where it came from", () => {
    const d = digest(nodes);
    expect(d.index).toEqual(["doc", "pas", "n", "pic"]);
    expect(d.text).toContain("[1] A document “The Keeper's Log” (log.pdf):\nChapter One Mara keeps the lamp. The ship comes in.");
    expect(d.text).toContain("[2] A passage from log.pdf, page 2:\nThe glass falling since noon.\n(The writer's note on it: the storm)");
    expect(d.text).toContain("[3] A note “Age”:\nMara is seventeen.");
    expect(d.text).toContain("[4] A picture “harbour-03”:\nA yellow sun over a navy sea.");
  });

  it("an answer becomes proposals, each tied to the clippings its numbers name", () => {
    const answer = JSON.stringify({
      cast: [{ name: "Mara", description: "The keeper's daughter.", from: [1, 3, 9] }],
      places: [{ name: "The lighthouse", description: "On the head.", from: [1] }],
      things: [],
      style: { name: "Navy dusk", description: "Flat colour.", palette: "navy, pale yellow", lighting: "low sun", from: [4] },
      outline: [{ title: "The ship", summary: "It comes in.", from: [1, 2] }],
      bible: { tone: "Quiet.", rules: "", avoid: "Melodrama." },
    });
    const p = parseBuild("```json\n" + answer + "\n```", ["doc", "pas", "n", "pic"]);
    expect(p.map((x) => [x.kind, x.title, x.from])).toEqual([
      ["character", "Mara", ["doc", "n"]],
      ["location", "The lighthouse", ["doc"]],
      ["style", "Navy dusk", ["pic"]],
      ["chapter", "The ship", ["doc", "pas"]],
      ["bible", "The bible", []],
    ]);
    expect(p[2].extra).toEqual({ palette: "navy, pale yellow", lighting: "low sun" });
    expect(p[4].extra).toEqual({ tone: "Quiet.", rules: "", avoid: "Melodrama." });
  });

  it("what cannot be read is passed over", () => {
    expect(parseBuild("I could not do that.", [])).toEqual([]);
    expect(parseBuild('{"cast": "Mara", "outline": [{"summary": "no title"}]}', [])).toEqual([]);
  });
});
