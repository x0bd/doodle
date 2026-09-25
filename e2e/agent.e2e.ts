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
