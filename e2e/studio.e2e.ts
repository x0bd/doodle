// The character studio (2026-09-25), in WebKit on the stand-in drawer: a
// face made from the appearance through a recipe inside the character —
// four to choose from, the chosen one their face and the reference for
// every run after; references from the project (a board as a moodboard),
// @ in the recipe; the card's own Generate key; the Inspector only wiring.
import { test, expect, type Page } from "@playwright/test";

const film = async (page: Page) => {
  // big enough that the field fits with its cards whole, not as the map
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(async () => (await import("/src/state/ui.ts" as string)).ui.set((u: any) => ({ ...u, chooser: true })));
  await page.locator(".welcome-pair").filter({ hasText: "Film" }).getByRole("button", { name: "Example" }).click();
};
const lastRequest = (page: Page) =>
  page.evaluate(async () => {
    const J = await import("/src/state/jobs.ts" as string);
    const s = J.jobs.get();
    const j = s.jobs[s.order[s.order.length - 1]] as any;
    return { prompt: j.request.prompt as string, images: (j.request.images ?? []).map((i: any) => i.label) as string[], count: j.count as number };
  });

test("a face from the appearance: four takes, one chosen, and it rides into the next run", async ({ page }) => {
  await film(page);
  // a board to lend its mood, and a style with a reference
  await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    const b = G.makeNode("board", 0, 1200, { id: "bd", title: "Brass" });
    const c = G.makeNode("clip", 0, 0, { id: "bc", parent: "bd", title: "brass study", asset: "/fixtures/black-bear.png", data: { what: "picture" } });
    G.graph.set((g: any) => ({ ...g, nodes: { ...g.nodes, bd: b, bc: c, s1: { ...g.nodes.s1, attachments: ["/fixtures/black-bear.png"] } }, order: [...g.order, "bd", "bc"] }));
    (await import("/src/state/nav.ts" as string)).enter("c1");
  });
  // the Inspector: not the fields again — what it is wired to
  await expect(page.locator(".pane").getByText("Feeds Storyboard")).toBeVisible();
  await expect(page.locator(".pane .group-head", { hasText: "Identity" })).toHaveCount(0);

  await page.getByRole("button", { name: "Generate", exact: true }).click();
  let r = await lastRequest(page);
  expect(r.count).toBe(4);
  expect(r.prompt).toContain("A portrait of R-404: head and shoulders");
  expect(r.prompt).toContain("A small maintenance robot, dented brass"); // the appearance, through the wire
  await expect(page.locator(".studio-take:not(.waiting)")).toHaveCount(4, { timeout: 30000 });

  // the recipe is a real piece of the graph inside them
  const inside = await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    return Object.values(G.graph.get().nodes).filter((n: any) => n.parent === "c1").map((n: any) => n.kind).sort();
  });
  expect(inside).toEqual(["generate", "note", "note", "prompt"]);

  // chosen: their face
  await page.locator(".studio-take").nth(2).click();
  const face = await page.evaluate(async () => (await import("/src/state/graph.ts" as string)).graph.get().nodes.c1.asset);
  expect(face).toBeTruthy();
  await expect(page.locator(".studio-take.on")).toHaveCount(1);

  // a board as a moodboard, from the picker; a style named in the recipe
  await page.getByRole("button", { name: "Add a reference" }).click();
  await page.locator(".pick-tile").filter({ has: page.locator(".pick-word", { hasText: /^Brass$/ }) }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".ref-chip", { hasText: "Brass · mood" })).toBeVisible();
  const box = page.getByLabel("Recipe", { exact: true }).locator("textarea").or(page.locator(".recipe textarea"));
  await box.first().click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type(" In the style of @Noct");
  await page.locator(".mentions .list-row", { hasText: "Nocturne" }).click();

  await page.getByRole("button", { name: "Generate again" }).click();
  r = await lastRequest(page);
  expect(r.images).toContain("R-404 (a character)"); // their face, the reference
  expect(r.images).toContain('from the board "Brass" (the mood — its colour, light and texture, not its contents)');
  expect(r.images).toContain("Nocturne (a reference for the style — its palette, light and medium, not what is in it)");
  expect(r.prompt).toContain("Quiet, cold, a single practical light"); // the style's words, by @
});

test("the card makes a face without opening them", async ({ page }) => {
  await film(page);
  const make = page.locator('[data-node="c1"] .who-make');
  await expect(make).toHaveAttribute("aria-label", "Generate a face for R-404");
  await make.hover();
  await make.click();
  const r = await lastRequest(page);
  expect(r.prompt).toContain("A portrait of R-404");
  expect(r.count).toBe(4);
});
