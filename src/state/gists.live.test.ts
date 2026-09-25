/// <reference types="node" />
/**
 * A chapter's gist by the real local writer (PLAN.md M6.2). Only runs
 * when asked: `DOODLE_LIVE=1 pnpm test gists.live`.
 */
import { describe, expect, it } from "vitest";

const g = globalThis as Record<string, unknown>;
g.matchMedia ??= () => ({ matches: true, addEventListener() {} });
g.addEventListener ??= () => {};
g.window ??= globalThis;
g.document ??= { documentElement: { classList: { toggle() {} } }, addEventListener() {}, querySelector: () => null };
const { graph, makeNode } = await import("./graph");
const { ui } = await import("./ui");
const { writeGist, gistOf } = await import("./gists");
const { runTool } = await import("../agent/tools");

const CHAPTER = [
  "The wind came in off the water before the light did. Mara was on the gallery with the glass still in her hand when she saw it — a hull where no hull should be, riding low off the north rocks, no lamp lit, no one at the rail.",
  "She counted to ten. Nothing on it moved.",
  "Below, her father slept the way he slept now, in the afternoons, as if the dark were a shift he had to be rested for. She did not wake him. She wrote the bearing on the slate by the door, and the time, and under it, because the slate was hers as much as his: *no crew.*",
  "By the time the lamp was lit the ship had turned on its anchor, and she could read the name on its stern. It was the name of her mother's boat — the Linnet — that had gone over on the bar the winter Mara was nine, with her mother in it.",
  "She went down the stairs in the dark, the way she had been told never to, and stood at her father's door. Through it she could hear him breathing, slow, and the clock, and under both the sea. She put her hand flat on the wood and did not knock.",
  "Instead she took the lantern from its hook and went out along the path to the landing, where the boatman's skiff was drawn up on the shingle. Tobias was there, as he always was at that hour, mending a net by feel. He looked at her lantern, and at her face, and at the water, and said nothing at all.",
  "\"Take me out,\" she said. \"Take me out to it.\"",
  "He shook his head. The bar was running, he said; nobody crossed the bar on an ebb, not for a ship, not for anything. And then, because she did not move, he said the thing she had come down the path to hear someone say: that he had seen it too, three nights now, and it had been further out each night, and tonight it was not.",
].join("\n\n");

describe.skipIf(!process.env.DOODLE_LIVE)("gists (Ollama)", () => {
  it("writes what happens in a chapter, and the outline carries it", { timeout: 300_000 }, async () => {
    ui.set((u) => ({ ...u, writeWith: "ollama" }));
    const n = makeNode("chapter", 0, 0, { title: "The ship", data: { summary: "", text: CHAPTER } });
    graph.set((x) => ({ ...x, nodes: { [n.id]: n }, order: [n.id] }));
    const t0 = Date.now();
    const gist = await writeGist(n);
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s\n${gist}`);
    expect(gist).toMatch(/Mara/);
    expect(gist!.split(/\s+/).length).toBeLessThan(160);
    expect(gistOf(n)).toBe(gist);
    const outline = (await runTool("doodle_outline", {})).text;
    expect(outline).toContain("what happens:");
    // changed words, a stale gist
    expect(gistOf({ ...n, data: { ...n.data, text: `${CHAPTER}\n\nMore.` } })).toBeUndefined();
  });
});
