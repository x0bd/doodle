/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pageText, readPdf, type Run } from "./pdf";

const run = (str: string, x: number, y: number, h = 11): Run => ({ str, x, y, h, w: str.length * h * 0.45 });

describe("the PDF reader", () => {
  it("the fixture: headings, paragraphs, a word broken across a line, no page numbers, a scan", async () => {
    const bytes = new Uint8Array(readFileSync("fixtures/import/keeper.pdf"));
    const got = await readPdf(bytes);
    const want = JSON.parse(readFileSync("fixtures/import/keeper.pdf.json", "utf8"));
    expect(got).toEqual(want);
  });

  it("runs on one baseline are one line, in order, spaced where pdf.js left a gap", () => {
    expect(pageText([run("world", 60, 700), run("Hello", 20, 700), run("again.", 20, 686)])).toBe("Hello world again.");
  });

  it("a wide gap between lines is a new paragraph", () => {
    const t = pageText([run("One line", 20, 700), run("and its next.", 20, 686), run("A new one.", 20, 650), run("Still it.", 20, 636)]);
    expect(t).toBe("One line and its next.\n\nA new one. Still it.");
  });

  it("a page number at the foot or the head goes; a number in the words stays", () => {
    expect(pageText([run("Page 3", 20, 800), run("She was 12 then.", 20, 700), run("- 4 -", 200, 30)])).toBe("She was 12 then.");
  });

  it("a compound broken across lines joins; a capital after a hyphen does not", () => {
    expect(pageText([run("the light-", 20, 700), run("house stood", 20, 686)])).toBe("the lighthouse stood");
    expect(pageText([run("north-", 20, 700), run("East wind", 20, 686)])).toBe("north- East wind");
  });
});
