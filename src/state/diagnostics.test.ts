import { describe, expect, it } from "vitest";
import { report } from "./report";
import type { GraphNode } from "./graph";

const n = (id: string, kind: string, data: Record<string, string>, asset?: string) => ({ id, kind, title: `Secret title ${id}`, data, asset, x: 0, y: 0, w: 1, h: 1, seq: 1, parent: null, status: "canon" }) as unknown as GraphNode;

describe("diagnostics report", () => {
  it("counts what is open and says none of it", () => {
    const g = {
      nodes: {
        a: n("a", "page", { text: "Mara keeps the secret lamp burning all night" }),
        b: n("b", "page", { text: "two words" }),
        c: n("c", "character", { name: "Mara", description: "A secret" }, "assets/abc.png"),
      },
      order: ["a", "b", "c"],
    };
    const r = report(g, { saved: true, versions: 4, providers: { mock: "Ready", codex: "Not found" }, theme: "dark" });
    expect(r).toMatch(/3 cards \(page 2, character 1\), ~10 words, 1 pictures, 4 versions, saved/);
    expect(r).toMatch(/mock Ready · codex Not found/);
    expect(r).not.toMatch(/Mara|secret|Secret|lamp|abc/);
  });
});
