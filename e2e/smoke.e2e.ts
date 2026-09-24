import { expect, test } from "@playwright/test";

test("a first run reaches writing: the sample, a chapter, its words", async ({ page }) => {
  await page.goto("/");
  // the first run's welcome leads with the sample book and says what it found
  await expect(page.getByText("What it can use")).toBeVisible();
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();

  // the book, as a field of cards
  await expect(page.locator('[data-node="start"]')).toBeVisible();
  const one = page.locator('[data-node="ch1"]');
  await expect(one).toContainText("1 page · 301 words"); // laid out, not cards

  // into the chapter: the manuscript — the whole chapter, one document (D1)
  await one.dblclick({ position: { x: 60, y: 14 } });
  const writer = page.locator(".docpage .pm").first();
  await expect(writer).toContainText("The ship is there at first light");
  await expect(writer).toContainText("“Not yet,” he says."); // page 3's words, same document
  // the beat is tied to its words, marked under them
  await expect(page.locator(".docpage .tie").first()).toContainText("No sail set");
  // and writing at the end of the chapter
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

test("the manuscript: every chapter in one column, a jump to any, writing in it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  await page.getByRole("button", { name: "Manuscript" }).click();
  await expect(page.locator(".read-chapter")).toHaveCount(2);
  const key = page.locator(".read-jump-key");
  await expect(key).toHaveText("One");
  await key.click();
  await page.getByRole("menuitem", { name: /Two/ }).click();
  await expect(key).toHaveText("Two");
  // write at the end of chapter two, in the manuscript
  const two = page.locator("#read-ch2 .pm");
  await two.click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type(" The name on the last line is hers.");
  await expect(two).toContainText("The name on the last line is hers.");
});

test("Focus: only the words, the line held where the eye is, and back without losing the caret", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  await page.locator('[data-node="ch1"]').dblclick({ position: { x: 60, y: 14 } });
  const writer = page.locator(".docpage .pm").first();
  await writer.click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.press("Meta+Shift+f");
  await expect(page.locator(".win.focusing")).toHaveCount(1);
  await expect(page.locator(".head")).toHaveCSS("opacity", "0");
  // the paragraph with the caret is lit, the rest stepped back
  await expect(page.locator(".ProseMirror-focused > .here")).toHaveCSS("opacity", "1");
  // typing keeps going, and the caret's line sits about two fifths down
  await page.keyboard.type(" He was already awake.");
  await page.waitForTimeout(200);
  const where = await page.evaluate(() => {
    const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    return r.top / window.innerHeight;
  });
  expect(where).toBeGreaterThan(0.25);
  expect(where).toBeLessThan(0.55);
  // out again with Escape: the chrome back, the caret where it was
  await page.keyboard.press("Escape");
  await expect(page.locator(".win.focusing")).toHaveCount(0);
  await page.keyboard.type(" Then the stairs.");
  await expect(writer).toContainText("He was already awake. Then the stairs.");
});
