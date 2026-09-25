/// <reference types="node" />
/**
 * PLAN.md M6.3's acceptance on the real local writer: the sample book
 * (Mara, "has never been to the mainland"; the lamp wound each evening),
 * a second chapter with contradictions planted among sentences that only
 * add, and the check must catch them — on the chapter's own words — and
 * not cry wolf at what is merely new. Only runs when asked:
 * `DOODLE_LIVE=1 pnpm test continuity.live`.
 */
import { describe, expect, it } from "vitest";

const g = globalThis as Record<string, unknown>;
g.matchMedia ??= () => ({ matches: true, addEventListener() {} });
g.addEventListener ??= () => {};
g.window ??= globalThis;
g.document ??= { documentElement: { classList: { toggle() {} } }, addEventListener() {}, querySelector: () => null };
const { graph } = await import("./graph");
const { ui } = await import("./ui");
const { doc } = await import("./doc");
const { SAMPLE } = await import("../graph/templates");
const { checkContinuity } = await import("./continuity");
const { ideas } = await import("./ideas");

const MAINLAND = "She thinks of the winter she spent at school on the mainland, the year she turned twelve, and the girl there who taught her to read a manifest.";
const TWO = [
  "The oilcloth is stiff with salt and the string will not come undone, so she cuts it with the bread knife.",
  "Inside is the manifest, folded in three. The paper is dry. That is the first wrong thing: everything else on the ship was wet through.",
  MAINLAND,
  "Salt, forty sacks. Rope, twelve coils. Lamp oil, six casks. She reads it twice, the way her father taught her, running her finger down the margin.",
  "The last line is not cargo. It is her own name, written in a hand she has never seen, and under it a date three days from now.",
  "Upstairs her father sleeps. She puts the manifest in the drawer with the knives and goes up to wind the lamp, because it is evening, and the lamp is wound every evening.",
].join("\n\n");

describe.skipIf(!process.env.DOODLE_LIVE)("the continuity check (Ollama)", () => {
  it("catches the planted contradiction, on the chapter's own words", { timeout: 600_000 }, async () => {
    ui.set((u) => ({ ...u, writeWith: "ollama" }));
    doc.set((d) => ({ ...d, bible: { tone: "Quiet, close, weather in every scene.", rules: "Mara has never left the island. The lamp is wound every evening.", avoid: "Explaining the ship." } }));
    const { nodes } = SAMPLE.build();
    const book = nodes.map((n) => (n.id === "ch2" ? { ...n, data: { ...n.data, text: TWO } } : n));
    graph.set((x) => ({ ...x, nodes: Object.fromEntries(book.map((n) => [n.id, n])), order: book.map((n) => n.id) }));

    const t0 = Date.now();
    const found = await checkContinuity("ch2");
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s · ${found.length} findings\n${found.map((f) => `- “${f.quote}”\n  ${f.source}${f.says ? `: “${f.says}”` : ""}${f.sourced ? "" : " (unsourced)"}\n  ${f.problem} → ${f.fix}`).join("\n")}`);

    const caught = found.filter((f) => MAINLAND.includes(f.quote.replace(/[.”"]+$/, "")) || f.quote.includes("mainland"));
    expect(caught.length).toBeGreaterThanOrEqual(1);
    expect(caught[0].sourced).toBe(true);
    // not crying wolf: the rest of the chapter only adds
    expect(found.length - caught.length).toBeLessThanOrEqual(1);
    // and they wait as comments to keep
    expect(Object.values(ideas.get()).flatMap((s) => s.items).filter((i) => i.kind === "comment").length).toBe(found.length);
  });

  it("catches a contradiction of the chapter before", { timeout: 600_000 }, async () => {
    ui.set((u) => ({ ...u, writeWith: "ollama" }));
    ideas.set({});
    doc.set((d) => ({ ...d, bible: { tone: "", rules: "", avoid: "" } }));
    const MASTS = "From the kitchen window she can still see it, its two masts bare against the evening.";
    const text = TWO.replace(MAINLAND, MASTS);
    const { nodes } = SAMPLE.build();
    const book = nodes.map((n) => (n.id === "ch2" ? { ...n, data: { ...n.data, text } } : n));
    graph.set((x) => ({ ...x, nodes: Object.fromEntries(book.map((n) => [n.id, n])), order: book.map((n) => n.id) }));
    const t0 = Date.now();
    const found = await checkContinuity("ch2");
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s · ${found.length} findings\n${found.map((f) => `- “${f.quote}”\n  ${f.source}${f.says ? `: “${f.says}”` : ""}${f.sourced ? "" : " (unsourced)"}\n  ${f.problem} → ${f.fix}`).join("\n")}`);
    const caught = found.filter((f) => f.quote.includes("two masts"));
    expect(caught.length).toBe(1);
    expect(caught[0].source).toBe("One");
    expect(caught[0].sourced).toBe(true);
    expect(found.length - caught.length).toBeLessThanOrEqual(1);
  });
});
