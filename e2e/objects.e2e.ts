// Objects (PLAN.md M5.2), in WebKit: a thing in the story, with a picture;
// named with @ in a scene, it rides into the request with its picture, the
// way a wired character does; its page says where the book names it.
import { test, expect } from "@playwright/test";

test("an object mentioned with @ rides into the request with its picture, and knows where it appears", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  const got = await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    const J = await import("/src/state/jobs.ts" as string);
    const manifest = G.makeNode("object", 1200, 330, { id: "o1", title: "The manifest", asset: "/fixtures/black-bear.png", data: { name: "The manifest", description: "A ship's list in oilcloth, the last line a name." } });
    const scene = G.makeNode("prompt", 0, 900, { id: "px", data: { text: "Mara at the kitchen table with @The manifest open in front of her." } });
    const gen = G.makeNode("generate", 300, 900, { id: "gx" });
    G.graph.set((g: any) => ({
      ...g,
      nodes: { ...g.nodes, o1: manifest, px: scene, gx: gen },
      order: [...g.order, "o1", "px", "gx"],
      edges: { ...g.edges, ex: { id: "ex", from: { node: "px", port: "text" }, to: { node: "gx", port: "positive" } } },
    }));
    const req = J.requestFor(G.graph.get().nodes.gx);
    return { images: req.images, prompt: req.prompt };
  });
  expect(got.images).toEqual([{ label: "The manifest (a thing in the story)", ref: "/fixtures/black-bear.png" }]);
  // its words ride too, named where it was mentioned
  expect(got.prompt).toContain("The manifest (A ship's list in oilcloth");
  expect(got.prompt).toContain("Pictures attached, in order: 1. The manifest (a thing in the story)");

  // its page: what it is, and the chapters that name it
  await page.locator('[data-node="o1"]').dblclick({ position: { x: 60, y: 14 } });
  const appears = page.locator(".sheet-field").filter({ hasText: "Appears in" });
  await expect(appears.getByRole("button")).toHaveText(["One1"]);
  await appears.getByRole("button", { name: /One/ }).click();
  await expect(page.locator(".docpage").getByRole("textbox", { name: "Title" }).first()).toHaveValue("One");
});
