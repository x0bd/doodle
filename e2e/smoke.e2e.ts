import { expect, test } from "@playwright/test";

test("a first run reaches writing: the sample, a chapter, a page, words", async ({ page }) => {
  await page.goto("/");
  // the first run's welcome leads with the sample book and says what it found
  await expect(page.getByText("What it can use")).toBeVisible();
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();

  // the book, as a field of cards
  await expect(page.locator('[data-node="start"]')).toBeVisible();
  const one = page.locator('[data-node="ch1"]');
  await expect(one).toContainText("3 pages");

  // into the chapter: its pages
  await one.dblclick({ position: { x: 60, y: 14 } });
  const first = page.locator('[data-node="pg1"]');
  await expect(first).toBeVisible();
  await expect(first).toContainText("The ship is there at first light");

  // into the page: the writer, with the caret in the words
  await first.dblclick({ position: { x: 60, y: 12 } });
  const writer = page.locator(".docpage .pm").first();
  await expect(writer).toContainText("Mara counts the gulls");
  await writer.click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type(" She goes down to wake him.");
  await expect(writer).toContainText("She goes down to wake him.");
});

test("a graph never saved: Versions says to save first, and Settings says who answers", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  await page.locator('[data-node="pg1"], [data-node="start"]').first().waitFor();
  // ⌘K → Versions… on the Start-here note
  await page.locator('[data-node="start"]').click({ position: { x: 60, y: 12 } });
  await page.keyboard.press("Meta+k");
  await page.keyboard.type("Versions");
  await page.getByRole("button", { name: /^Versions…/ }).click();
  await expect(page.getByText("Versions are kept inside a project.")).toBeVisible();
  await page.keyboard.press("Escape");
  // ⌘, → Providers: the stand-in is always ready
  await page.keyboard.press("Meta+Comma");
  await page.getByRole("button", { name: "Providers" }).click();
  await expect(page.getByText("Always here.")).toBeVisible();
});
