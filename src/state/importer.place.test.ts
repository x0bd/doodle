import { describe, expect, it } from "vitest";
import { placeAt, COL, ROW } from "./importer";

const ch = (x: number, y: number) => ({ kind: "chapter", x, y, w: 280, h: 236 });

describe("placing imported chapters", () => {
  it("an empty book: six to a row from the origin", () => {
    const at = placeAt([], 8);
    expect(at[0]).toEqual({ x: 0, y: 0 });
    expect(at[5]).toEqual({ x: 5 * COL, y: 0 });
    expect(at[6]).toEqual({ x: 0, y: ROW });
  });

  it("carries on the book's grid, six to a row from its first chapter", () => {
    const at = placeAt([ch(400, 40), ch(720, 40)], 6);
    expect(at.slice(0, 4)).toEqual([
      { x: 1040, y: 40 },
      { x: 1360, y: 40 },
      { x: 1680, y: 40 },
      { x: 2000, y: 40 },
    ]);
    // the next row starts under the first chapter
    expect(at[4]).toEqual({ x: 400, y: 40 + ROW });
    expect(at[5]).toEqual({ x: 720, y: 40 + ROW });
  });

  it("chapters moved off the grid: a block below, never before the last in reading order", () => {
    const at = placeAt([ch(400, 40), ch(400, 900)], 1);
    expect(at[0]).toEqual({ x: 400, y: 900 + 236 + 80 });
  });

  it("something in the way: a block below everything, under the first chapter", () => {
    const cast = { kind: "character", x: 1100, y: 60, w: 280, h: 400 };
    const at = placeAt([ch(400, 40), ch(720, 40), cast], 2);
    expect(at[0]).toEqual({ x: 400, y: 460 + 80 });
    expect(at[1]).toEqual({ x: 400 + COL, y: 540 });
  });

  it("no chapters yet: below the rest, at its left", () => {
    const at = placeAt([{ kind: "note", x: -200, y: 0, w: 200, h: 100 }], 1);
    expect(at[0]).toEqual({ x: -200, y: 180 });
  });

  it("the imports never overlap one another or what was there", () => {
    const root = [ch(0, 0), { kind: "note", x: 700, y: 300, w: 200, h: 200 }];
    const at = placeAt(root, 30);
    const boxes = [...root, ...at.map((p) => ({ ...p, w: 280, h: 236 }))];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
  });
});

import { chaptersFrom } from "./importer";
describe("one chapter", () => {
  it("a heading it opens with, of any level, is its name", () => {
    expect(chaptersFrom("pdf", "## The Keeper's Log\n\nThe fourteenth of March.", "scan").chapters).toEqual([{ title: "The Keeper's Log", text: "The fourteenth of March." }]);
    expect(chaptersFrom("md", "Words first.\n\n## A heading later", "notes").chapters[0].title).toBe("notes");
  });
});
