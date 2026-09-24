import { describe, expect, it } from "vitest";
import { layOut, within, pictureSource, CELL, DOC_W, DOC_H, type Gathered, type Box } from "./board";

const pics = (n: number, ratio = 1.25): Gathered => ({
  name: "Harbour",
  items: Array.from({ length: n }, (_, i) => ({ what: "picture" as const, title: `p${i}`, asset: `assets/${i}.jpg`, ratio: i % 3 ? ratio : 0.66 })),
});
const doc = (name: string): Gathered => ({ name, items: [{ what: "document", title: name, text: "words", source: `assets/${name}.pdf`, from: `${name}.pdf`, pages: 3 }] });

const overlaps = (bs: Box[]) => {
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return true;
    }
  return false;
};

describe("laying out a board", () => {
  it("the acceptance's drop — 3 files and 20 pictures — lands, grouped by source, nothing covering anything", () => {
    const laid = layOut([doc("Log"), doc("Letters"), doc("Chart"), pics(20)], { x: 0, y: 0 });
    expect(laid.items).toHaveLength(23);
    // one frame: the pictures; a lone document needs none
    expect(laid.groups.map((g) => g.title)).toEqual(["Harbour"]);
    expect(overlaps(laid.items)).toBe(false);
    // every picture inside its group's frame
    const g = laid.groups[0];
    for (const p of laid.items.filter((i) => i.what === "picture")) expect(within(g, [{ ...p, id: p.title }])).toEqual([p.title]);
    // the documents are cards of their own, a document's size
    expect(laid.items.filter((i) => i.what === "document").every((d) => d.w === DOC_W && d.h === DOC_H)).toBe(true);
  });

  it("pictures fall into the shortest column, each as tall as its shape", () => {
    const laid = layOut([pics(8)], { x: 0, y: 0 });
    const cols = new Set(laid.items.map((i) => i.x));
    expect(cols.size).toBe(4);
    for (const i of laid.items) expect(i.w).toBe(CELL);
    const tall = laid.items.find((i) => i.ratio === 1.25)!;
    expect(tall.h).toBe(Math.round(CELL * 1.25) + 30);
  });

  it("a Word document and its pictures are one group, the document on top", () => {
    const laid = layOut([{ name: "Letters", items: [{ what: "document", title: "Letters" }, { what: "picture", title: "a", ratio: 1 }, { what: "picture", title: "b", ratio: 1 }] }], { x: 100, y: 100 });
    expect(laid.groups).toHaveLength(1);
    const [d, ...ps] = laid.items;
    expect(d.what).toBe("document");
    for (const p of ps) expect(p.y).toBeGreaterThan(d.y + d.h - 1);
  });

  it("onto clear field: what is there already is never covered", () => {
    const there = [{ x: 0, y: 0, w: 900, h: 700 }];
    const laid = layOut([doc("Log"), pics(5)], { x: 50, y: 50 }, there);
    expect(overlaps([...there, ...laid.groups])).toBe(false);
    expect(overlaps([...there, ...laid.items])).toBe(false);
  });

  it("a group holds what lies wholly inside it", () => {
    const g = { x: 0, y: 0, w: 500, h: 400 };
    expect(within(g, [{ id: "in", x: 10, y: 50, w: 200, h: 200 }, { id: "half", x: 400, y: 50, w: 200, h: 100 }, { id: "out", x: 600, y: 0, w: 10, h: 10 }])).toEqual(["in"]);
  });

  it("a drop's pictures are named for their folder", () => {
    expect(pictureSource(["/Users/a/Refs/Harbour/1.jpg", "/Users/a/Refs/Harbour/2.jpg"])).toBe("Harbour");
    expect(pictureSource(["/Users/a/Desktop/1.jpg"])).toBe("Pictures");
    expect(pictureSource(["/a/x/1.jpg", "/a/y/2.jpg"])).toBe("Pictures");
  });
});
