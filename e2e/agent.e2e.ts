// The agent reads the book (PLAN.md M6.3), in WebKit on the stand-in
// writer: Check on a chapter reads it against what the book has fixed and
// proposes what does not agree as comments on its words; kept, they are in
// the margin by those words.
import { test, expect } from "@playwright/test";

test("a continuity check proposes comments on the chapter's words; kept, they sit in the margin", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  await page.locator(".stage").press("Tab"); // the panes away: room for the margin
  await page.locator('[data-node="ch2"]').dblclick({ position: { x: 60, y: 14 } });
  await page.getByRole("button", { name: "Ask the agent" }).click();
  await page.getByRole("button", { name: "Check", exact: true }).click();

  // the work shows as a draft on the page, and says what it read against
  await expect(page.locator(".draft").filter({ hasText: "Checked against" })).toContainText("One thing does not agree");
  const offer = page.locator(".proposal").filter({ hasText: "Proposed comments" });
  await expect(offer).toContainText("does not agree with what the book has fixed");
  await expect(offer).toContainText("from “The oilcloth is stiff with salt");

  await offer.getByRole("button", { name: "Keep all" }).click();
  const card = page.locator(".comment-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator("textarea")).toHaveValue(/does not agree[\s\S]*says: “/);
  await expect(page.locator(".tie.remark").first()).toContainText("The oilcloth is stiff with salt");
});

test("a proposal to the bible waits on the page; kept, it is added after what the bible says", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  await page.locator('[data-node="ch2"]').dblclick({ position: { x: 60, y: 14 } });
  await page.evaluate(async () => {
    const D = await import("/src/state/doc.ts" as string);
    D.setBible({ tone: "", rules: "The lamp is wound every evening.", avoid: "" });
    const T = await import("/src/agent/tools.ts" as string);
    await T.runTool("propose_bible", { id: "ch2", rules: "Mara has never left the island.", why: "Chapter One: she has never been to the mainland." }, "Mock");
  });
  const offer = page.locator(".proposal").filter({ hasText: "Proposed additions to the bible" });
  await expect(offer).toContainText("Rules: Mara has never left the island.");
  await offer.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(offer).toHaveCount(0);
  const rules = await page.evaluate(async () => (await import("/src/state/doc.ts" as string)).doc.get().bible.rules);
  expect(rules).toBe("The lamp is wound every evening.\nMara has never left the island.");
});

test("asked from the field, the agent answers about the book beside it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  // nothing selected: the whole book
  await page.evaluate(async () => (await import("/src/state/graph.ts" as string)).graph.set((g: any) => ({ ...g, selection: [] })));
  await page.getByRole("button", { name: "Ask the agent" }).click();
  await expect(page.locator(".bar.ask .bar-from")).toContainText("The book");
  await page.getByPlaceholder("What do you want to know about the book?").fill("What is this book?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const answer = page.locator(".answers .answer").first();
  await expect(answer.locator(".answer-q")).toHaveText("What is this book?");
  await expect(answer).toContainText("The book has 2 chapters: One, Two", { timeout: 8000 });
  await answer.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".answers")).toHaveCount(0);
});
