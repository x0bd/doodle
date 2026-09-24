// The board's clippings (PLAN.md M3.3, M3.4), in WebKit without Tauri: a
// document clipping opens to its pages; a passage selected on page 2 is
// clipped to the board, remembers the page, and opens its document there.
import { test, expect, type Page } from "@playwright/test";

const long = (n: number) => Array.from({ length: 14 }, (_, i) => `Paragraph ${i + 1} of page ${n}, where the keeper writes of the sea and the lamp and the ship that came in.`).join("\n\n");

async function aBoard(page: Page) {
  await page.goto("/");
  await page.waitForTimeout(600);
  return page.evaluate(async (pages: string[]) => {
    const G = await import("/src/state/graph.ts" as string);
    const N = await import("/src/state/nav.ts" as string);
    const U = await import("/src/state/ui.ts" as string);
    U.closeChooser();
    const board = G.makeNode("board", 0, 0, { title: "Research" });
    const doc = G.makeNode("clip", 0, 0, { title: "The Keeper's Log", w: 300, h: 196, parent: board.id, data: { what: "document", text: pages.join("\n\n\f\n\n"), source: "assets/log.pdf", from: "log.pdf", page: 0, pages: 3, ratio: 0, note: "" } });
    G.graph.set((g: any) => ({ ...g, nodes: { [board.id]: board, [doc.id]: doc }, order: [board.id, doc.id], selection: [], edgeSelection: [] }));
    N.enter(board.id);
    return { board: board.id, doc: doc.id };
  }, [long(1), long(2), long(3)]);
}

test("a passage clipped from page 2 remembers its page, and opens its document there", async ({ page }) => {
  const ids = await aBoard(page);
  // open the document: its pages, with their folios
  await page.evaluate(async (id) => (await import("/src/state/nav.ts" as string)).enter(id), ids.doc);
  await expect(page.locator(".source .read-folio")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Show the original" })).toBeVisible();

  // select words on page 2
  await page.locator("#source-page-2").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const p = document.querySelectorAll("#source-page-2 .ProseMirror p")[3]!;
    const r = document.createRange();
    r.selectNodeContents(p);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  const pill = page.getByRole("button", { name: "Clip to board" });
  await expect(pill).toBeVisible();
  await pill.click();

  const clip = await page.evaluate(async (doc) => {
    const G = await import("/src/state/graph.ts" as string);
    const c = Object.values(G.graph.get().nodes).find((n: any) => n.data?.what === "passage") as any;
    return c && { page: c.data.page, of: c.data.of, text: c.data.text, parent: c.parent, id: c.id, title: c.title };
  }, ids.doc);
  expect(clip).toBeTruthy();
  expect(clip.page).toBe(2);
  expect(clip.of).toBe(ids.doc);
  expect(clip.parent).toBe(ids.board);
  expect(clip.text).toContain("Paragraph 4 of page 2");
  expect(clip.title).toBe("Paragraph 4 of page 2, where…");

  // the passage opens with its document a key away — at its page
  await page.evaluate(async (id) => (await import("/src/state/nav.ts" as string)).enter(id), clip.id);
  await expect(page.locator(".source .paper-meta")).toContainText("Passage");
  await page.getByRole("button", { name: /Open “The Keeper's Log” at page 2/ }).click();
  await expect(page.locator(".source .read-folio")).toHaveCount(3);
  await page.waitForTimeout(400);
  const top = await page.locator("#source-page-2").evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(200);
});
