import { describe, expect, it } from "vitest";
import { parseFindings, holds, material } from "./checks";

const CHAPTER = "Mara was six the winter her mother drowned. That night, for the first time, the lamp was *not* lit.";
const SOURCES = [
  { name: "The bible", text: "Rules: The lamp is lit every night, whatever happens." },
  { name: "One", text: "The Linnet went over on the bar the winter Mara was nine, with her mother in it." },
];
const answer = (findings: object[]) => JSON.stringify({ findings });

describe("the continuity check's answer", () => {
  it("keeps a finding that quotes the chapter and its source", () => {
    const got = parseFindings(answer([{ quote: "Mara was six the winter her mother drowned.", source: "One", says: "the winter Mara was nine", problem: "Her age.", fix: "Nine." }]), CHAPTER, SOURCES);
    expect(got).toHaveLength(1);
    expect(got[0].sourced).toBe(true);
  });

  it("drops one that misquotes the chapter, and one said twice", () => {
    const got = parseFindings(
      answer([
        { quote: "Mara was seven when the boat went down.", source: "One", says: "nine", problem: "", fix: "" },
        { quote: "the lamp was not lit", source: "The bible", says: "The lamp is lit every night", problem: "", fix: "" },
        { quote: "the lamp was not lit", source: "The bible", says: "The lamp is lit every night", problem: "", fix: "" },
      ]),
      CHAPTER,
      SOURCES,
    );
    // the markup in the chapter does not hide its words
    expect(got.map((f) => f.quote)).toEqual(["the lamp was not lit"]);
  });

  it("takes a quote inside another as the same finding", () => {
    const got = parseFindings(
      answer([
        { quote: "the lamp was not lit", source: "The bible", says: "The lamp is lit every night", problem: "", fix: "" },
        { quote: "That night, for the first time, the lamp was not lit.", source: "The bible", says: "The lamp is lit every night", problem: "", fix: "" },
      ]),
      CHAPTER,
      SOURCES,
    );
    expect(got).toHaveLength(1);
  });

  it("marks one whose source does not say what it is quoted as saying", () => {
    const got = parseFindings(answer([{ quote: "the lamp was not lit", source: "The bible", says: "The lamp must burn until dawn.", problem: "", fix: "" }]), CHAPTER, SOURCES);
    expect(got[0].sourced).toBe(false);
  });

  it("reads an answer with words around its JSON, and nothing from one without", () => {
    expect(parseFindings(`Here:\n${answer([])}\nDone.`, CHAPTER, SOURCES)).toEqual([]);
    expect(parseFindings("No contradictions.", CHAPTER, SOURCES)).toEqual([]);
  });

  it("finds a quote through curly quotes and spacing", () => {
    expect(holds("She said, “no crew.”  Then   left.", 'She said, "no crew." Then left.')).toBe(true);
    expect(holds("abc", "ab")).toBe(false);
  });

  it("gives the chapter last, after its sources", () => {
    const m = material({ title: "Two", text: CHAPTER }, SOURCES);
    expect(m.indexOf('<source name="The bible">')).toBeLessThan(m.indexOf('<chapter title="Two">'));
  });
});
