/// <reference types="node" />
/**
 * PLAN.md M6.2's acceptance, on the real embedding model: "Where did Mara
 * first see the ship?" finds the passage in a 120k-word book. The book is
 * the benchmark's seeded word-salad (scripts/bench-book.mjs) — every
 * chapter full of *ship*, *saw*, *first*, *daughter* — with five real
 * passages planted in it, four of them about Mara and the ship but not
 * her first sight of it. Only runs when asked: `DOODLE_LIVE=1 pnpm test meaning.live`.
 */
import { describe, expect, it } from "vitest";

// the index reaches the document's state, which reaches the window's: enough of one, before it loads
const g = globalThis as Record<string, unknown>;
g.matchMedia ??= () => ({ matches: true, addEventListener() {} });
g.addEventListener ??= () => {};
g.window ??= globalThis;
g.document ??= { documentElement: { classList: { toggle() {} } }, addEventListener() {}, querySelector: () => null };
const { graph, makeNode } = await import("./graph");
const { searchMeaning } = await import("./meaning");
const { embedder } = await import("../readers/embed");
const { runTool } = await import("../agent/tools");

let s = 20260923;
const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const WORDS = (
  "the a and of to in she he it was light sea ship house window door rope salt morning night wind rain stone glass lantern gull harbour " +
  "keeper daughter mother letter manifest cargo crate deck rail sail mast wave tide shore cliff path garden greenhouse pane frost fire " +
  "said asked turned looked waited counted carried opened closed remembered forgot walked ran slept woke heard saw knew thought held " +
  "quiet slow cold bright grey heavy small long old new empty full last first far near under over through before after again never always"
).split(" ");
const sentence = () => {
  const w = Array.from({ length: 6 + Math.floor(rand() * 14) }, () => pick(WORDS));
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  return `${w.join(" ")}.`;
};
const prose = (n: number) => {
  const paras: string[] = [];
  for (let c = 0; c < n; ) {
    const p = Array.from({ length: 3 + Math.floor(rand() * 4) }, sentence).join(" ");
    c += p.split(" ").length;
    paras.push(p);
  }
  return paras;
};

const FIRST = "It was from the gallery, with the glass still warm in her hand, that Mara caught her first sight of it: a hull riding low beyond the north rocks, no lamp lit, no one at the rail. She had never seen a vessel sit so still in a running sea.";
const PLANTED: Record<number, string> = {
  3: "Mara's mother had kept a small boat, the Linnet, painted the green of wet moss; the winter she drowned, it was found upturned on the bar, and Mara was not allowed down to see it.",
  7: FIRST,
  15: "In the dream the ship was always closer than it had been the night before, and Mara was always on the shore, and her mother was always at its rail, waving.",
  22: "When at last Mara rowed out to the ship, the deck was dry though it had rained all night, and the galley stove was still warm to the touch.",
  26: "Years later Mara would tell the story of the ship to her own daughter, and each time she told it, the ship came in a little earlier in the evening.",
};

describe.skipIf(!process.env.DOODLE_LIVE)("search by meaning (Ollama)", () => {
  it("finds where Mara first saw the ship in a 120k-word book", { timeout: 900_000 }, async () => {
    const model = await embedder();
    expect(model).toBeTruthy();
    const nodes = Array.from({ length: 30 }, (_, i) => {
      const paras = prose(4000);
      if (PLANTED[i + 1]) paras.splice(Math.floor(paras.length / 2), 0, PLANTED[i + 1]);
      return makeNode("chapter", i * 320, 0, { title: `Chapter ${i + 1}`, data: { summary: "", text: paras.join("\n\n") } });
    });
    graph.set((x) => ({ ...x, nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), order: nodes.map((n) => n.id) }));
    const total = nodes.reduce((a, n) => a + String(n.data.text).split(/\s+/).length, 0);

    const t0 = Date.now();
    let of = 0;
    const found = (await searchMeaning("Where did Mara first see the ship?", { onProgress: (_, n) => (of = n) }))!;
    const indexed = Date.now() - t0;
    const t1 = Date.now();
    const again = (await searchMeaning("Where did Mara first see the ship?"))!;
    const warm = Date.now() - t1;

    console.log(`${model} · ${total} words, ${of} passages read in ${(indexed / 1000).toFixed(1)} s; a search after: ${warm} ms`);
    console.log(found.map((f, i) => `${i + 1}. ${f.node.title} · ${f.score.toFixed(3)} · ${f.text.slice(0, 90)}…`).join("\n"));
    expect(total).toBeGreaterThan(118_000);
    // the passage itself, first
    expect(found[0].node.title).toBe("Chapter 7");
    expect(found[0].text).toContain("caught her first sight of it");
    expect(again[0].text).toBe(found[0].text);

    // and the agent's tool says it so
    const r = await runTool("doodle_search_meaning", { query: "the night Mara rowed out to the ship", count: 3 });
    console.log(r.text.split("\n")[0]);
    expect(r.error).toBe(false);
    expect(r.text.split("\n")[0]).toContain("Chapter 22");
  });
});
