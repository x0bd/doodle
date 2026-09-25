/// <reference types="node" />
/**
 * The agent on the real local writer (PLAN.md M6.1): a page of a book,
 * Doodle's own tools, a free ask. Slow — a 27B model reading and proposing
 * — so it runs only when asked: `DOODLE_LIVE=1 pnpm test agent.live`.
 */
import { describe, expect, it } from "vitest";

// the tools reach the document's state, which reaches the window's: enough of one, before they load
const g = globalThis as Record<string, unknown>;
const classes = { toggle() {} };
g.matchMedia ??= () => ({ matches: true, addEventListener() {} });
g.addEventListener ??= () => {};
g.window ??= globalThis;
g.document ??= { documentElement: { classList: classes }, addEventListener() {}, querySelector: () => null };
const { graph, makeNode } = await import("../state/graph");
const { nav } = await import("../state/nav");
const { ideas } = await import("../state/ideas");
const { ollama } = await import("../providers/ollama");
const { briefing, runTool, toolSpecs } = await import("./tools");

const PAGE = `The wind came in off the water before the light did. Mara was on the gallery with the glass still in her hand when she saw it — a hull where no hull should be, riding low off the north rocks, no lamp lit, no one at the rail.

She counted to ten. Nothing on it moved.

Below, her father slept the way he slept now, in the afternoons, as if the dark were a shift he had to be rested for. She did not wake him. She wrote the bearing on the slate by the door, and the time, and under it, because the slate was hers as much as his: *no crew.*

By the time the lamp was lit the ship had turned on its anchor, and she could read the name on its stern. It was the name of her mother's boat.`;

describe.skipIf(!process.env.DOODLE_LIVE)("the agent on Ollama", () => {
  it("reads the page through the tools and proposes beats tied to its words", { timeout: 600_000 }, async () => {
    expect(await ollama.status()).toBe("available");
    const chapter = makeNode("chapter", 0, 0, { title: "The ship" });
    const page = makeNode("page", 0, 0, { title: "Dusk", parent: chapter.id, data: { text: PAGE } });
    graph.set((g) => ({ ...g, nodes: { [chapter.id]: chapter, [page.id]: page }, order: [chapter.id, page.id] }));
    nav.set((n) => ({ ...n, focus: page.id }));
    const used: string[] = [];
    const t0 = Date.now();
    const reply = await ollama.streamText!(
      {
        prompt: PAGE,
        system: "Find the beats of this page — three or four — each tied to the passage it comes from.",
        tools: true,
        instructions: briefing(page.id),
        toolSpecs: toolSpecs(),
        runTool: async (name, args) => {
          const r = await runTool(name, args, "Ollama");
          used.push(`${name}${r.error ? ` ✗ ${r.text}` : ""}`);
          return r;
        },
      },
      () => {},
      new AbortController().signal,
    );
    const beats = Object.values(ideas.get()).flatMap((s) => s.items);
    console.log(`${Math.round((Date.now() - t0) / 1000)} s · tools: ${used.join(", ")}\nbeats:\n${beats.map((b) => `- ${b.title}: ${b.text}\n  quote: ${b.quote ?? "(none)"}`).join("\n")}\nreply: ${reply}`);
    expect(used.some((u) => u.startsWith("propose_beats") && !u.includes("✗"))).toBe(true);
    expect(beats.length).toBeGreaterThanOrEqual(2);
    // a quote is the page's own words, so the kept beat can be tied to them
    const quoted = beats.filter((b) => b.quote && PAGE.includes(b.quote));
    expect(quoted.length).toBeGreaterThanOrEqual(1);
  });
});
