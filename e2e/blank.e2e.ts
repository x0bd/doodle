// Starting blank (the user's ask, 2026-09-25): each of the four workflows
// starts as its own parts, wired and empty — nothing of the examples in it —
// or as the worked example beside it. A blank book is its first chapter,
// open, the caret in it.
import { test, expect, type Page } from "@playwright/test";

const start = async (page: Page, name: string, example = false) => {
  await page.evaluate(async () => (await import("/src/state/ui.ts" as string)).ui.set((u: any) => ({ ...u, chooser: true })));
  const row = page.locator(".welcome-pair").filter({ hasText: name });
  await (example ? row.getByRole("button", { name: "Example" }) : row.locator(".welcome-row")).click();
};
const state = (page: Page) =>
  page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    const N = await import("/src/state/nav.ts" as string);
    const g = G.graph.get();
    const nodes = Object.values(g.nodes) as any[];
    const words = nodes.flatMap((n) => Object.entries(n.data).filter(([k, v]) => typeof v === "string" && ["text", "description", "name", "summary", "palette", "lighting"].includes(k) && v)).length;
    return { kinds: nodes.map((n) => n.kind).sort(), edges: Object.keys(g.edges).length, words, focus: N.nav.get().focus, pictures: nodes.filter((n) => n.asset).length };
  });

test("each workflow starts blank — its parts wired, nothing in them — or as its example", async ({ page }) => {
  await page.goto("/");
  await start(page, "Images");
  expect(await state(page)).toMatchObject({ kinds: ["generate", "model", "preview", "prompt", "prompt"], edges: 4, words: 0, pictures: 0 });

  await start(page, "Film");
  expect(await state(page)).toMatchObject({ kinds: ["character", "generate", "location", "model", "note", "preview", "prompt", "style"], edges: 6, words: 0 });

  await start(page, "Manga");
  expect(await state(page)).toMatchObject({ kinds: ["character", "generate", "model", "preview", "prompt", "style"], edges: 5, words: 0 });

  // the example is still a key away
  await start(page, "Manga", true);
  expect((await state(page)).words).toBeGreaterThan(0);
});

test("a blank book opens on its first chapter, ready to type in", async ({ page }) => {
  await page.goto("/");
  await start(page, "Book");
  const s = await state(page);
  expect(s).toMatchObject({ kinds: ["chapter", "character", "style"], words: 0, focus: "ch1" });
  await expect(page.locator(".docpage .pm").first()).toBeVisible();
  await page.keyboard.type("The ship was there at first light.");
  const text = await page.evaluate(async () => (await import("/src/state/graph.ts" as string)).graph.get().nodes.ch1.data.text);
  expect(text).toBe("The ship was there at first light.");
});
