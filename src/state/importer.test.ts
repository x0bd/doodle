import { describe, expect, it } from "vitest";
import { chaptersFrom, cleanMarkdown, fromMarkdown, fromText, fromFountain } from "./importer";

describe("import into chapters", () => {
  it("a 30-chapter Markdown file becomes 30 chapters, their words intact", () => {
    const md = Array.from({ length: 30 }, (_, i) => `# Chapter ${i + 1}\n\nThe words of chapter ${i + 1}.\n\n## A scene\n\nMore of it.`).join("\n\n");
    const r = chaptersFrom("md", md, "Book");
    expect(r.chapters).toHaveLength(30);
    expect(r.chapters[29]).toEqual({ title: "Chapter 30", text: "The words of chapter 30.\n\n# A scene\n\nMore of it." });
  });

  it("## chapters under a # title: the title is the book's, not a chapter", () => {
    const r = fromMarkdown("# The Keeper\n\n## One\n\nFirst.\n\n## Two\n\nSecond.", "file");
    expect(r.map((c) => c.title)).toEqual(["The Keeper", "One", "Two"].slice(1));
  });

  it("words before the first chapter are a chapter of their own", () => {
    const r = fromMarkdown("An epigraph.\n\n# One\n\nFirst.\n\n# Two\n\nSecond.", "file");
    expect(r.map((c) => c.title)).toEqual(["Before", "One", "Two"]);
    expect(r[0].text).toBe("An epigraph.");
  });

  it("one heading, or none: the whole file is one chapter", () => {
    expect(fromMarkdown("# Only\n\nWords.", "file")).toEqual([{ title: "Only", text: "Words." }]);
    expect(fromMarkdown("Just words.\n\nMore.", "notes")).toEqual([{ title: "notes", text: "Just words.\n\nMore." }]);
  });

  it("what the writer cannot hold goes; links keep their words; a rule is a scene break", () => {
    expect(cleanMarkdown("---\ntitle: x\n---\nSee [the ship](http://x) ![p](a.png) <b>now</b>.\n\n***\n\nNext.")).toBe("See the ship  now.\n\n* * *\n\nNext.");
  });

  it("plain text: chapters at Chapter lines, hard-wrapped paragraphs joined", () => {
    const txt = "A foreword.\n\nCHAPTER ONE\n\nThe ship is there\nat first light.\n\nNo one at the rail.\n\nChapter 2: The Manifest\n\nOilcloth.";
    const r = fromText(txt, "book");
    expect(r.map((c) => c.title)).toEqual(["Before", "CHAPTER ONE", "Chapter 2: The Manifest"]);
    expect(r[1].text).toBe("The ship is there at first light.\n\nNo one at the rail.");
    expect(fromText("One line.\nAnother line.", "x")[0].text).toBe("One line.\n\nAnother line.");
  });

  it("Fountain: sections are chapters, as a screenplay; the title page goes", () => {
    const f = "Title: The Keeper\nAuthor: Me\n\n# Act One\n\nINT. LIGHTHOUSE - DAWN\n\nMara climbs.\n\n# Act Two\n\nEXT. CAUSEWAY - DAY";
    const r = chaptersFrom("fountain", f, "x");
    expect(r.form).toBe("screenplay");
    expect(r.chapters.map((c) => c.title)).toEqual(["Act One", "Act Two"]);
    expect(fromFountain(f, "x")[0].text).toContain("INT. LIGHTHOUSE - DAWN");
  });
});
