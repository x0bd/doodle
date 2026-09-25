// The book's look (PLAN.md M5.5), in WebKit: a style chosen as the book's
// look is what every picture without a style of its own is made in — its
// words and its references; switch it, and new pictures follow; wire a
// style in, and that one wins.
import { test, expect } from "@playwright/test";

test("the book's look: pictures follow it, switched they follow the new one, a wired style overrides it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  const req = () =>
    page.evaluate(async () => {
      const G = await import("/src/state/graph.ts" as string);
      const J = await import("/src/state/jobs.ts" as string);
      const r = J.requestFor(G.graph.get().nodes.gx);
      return { prompt: r.prompt as string, images: (r.images ?? []).map((i: any) => i.label) as string[] };
    });
  await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    const dusk = G.makeNode("style", 0, 1400, { id: "sd", title: "Navy dusk", attachments: ["/fixtures/black-bear.png"], data: { description: "Flat colour, a low sun over dark water", palette: "navy, pale yellow", lighting: "low sun" } });
    const ink = G.makeNode("style", 300, 1400, { id: "si", title: "Ink", data: { description: "Brush and ink on rough paper", palette: "black", lighting: "" } });
    const scene = G.makeNode("prompt", 0, 1700, { id: "px", data: { text: "The lighthouse at night." } });
    const gen = G.makeNode("generate", 300, 1700, { id: "gx" });
    G.graph.set((g: any) => ({
      ...g,
      nodes: { ...g.nodes, sd: dusk, si: ink, px: scene, gx: gen },
      order: [...g.order, "sd", "si", "px", "gx"],
      edges: { ...g.edges, ex: { id: "ex", from: { node: "px", port: "text" }, to: { node: "gx", port: "positive" } } },
    }));
  });
  // no look: the picture is only its words
  expect((await req()).prompt).not.toContain("Flat colour");

  // chosen in the book's Inspector
  await page.getByLabel("The book's look").selectOption({ label: "Navy dusk" });
  let r = await req();
  expect(r.prompt).toContain("Flat colour, a low sun over dark water");
  expect(r.images).toEqual(["Navy dusk (a reference for the book's look — its palette, light and medium, not what is in it)"]);

  // switched: new pictures follow it
  await page.getByLabel("The book's look").selectOption({ label: "Ink" });
  r = await req();
  expect(r.prompt).toContain("Brush and ink");
  expect(r.prompt).not.toContain("Flat colour");

  // a style wired in wins
  await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    G.graph.set((g: any) => ({ ...g, edges: { ...g.edges, es: { id: "es", from: { node: "sd", port: "text" }, to: { node: "gx", port: "style" } } } }));
  });
  r = await req();
  expect(r.prompt).toContain("Flat colour");
  expect(r.prompt).not.toContain("Brush and ink");
});
