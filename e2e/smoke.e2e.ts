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

test("goals: today's words follow the writing; a daily goal fills the ring", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  await page.locator('[data-node="ch1"]').dblclick({ position: { x: 60, y: 14 } });
  const key = page.locator(".goal-key");
  await expect(key).toContainText("0 today");
  await page.locator(".docpage .pm").first().click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type(" She went down the stairs in the dark.");
  await expect(key).toContainText("8 today", { timeout: 4000 });
  await key.click();
  await expect(page.locator(".goal-pop")).toContainText("The book");
  await page.getByRole("button", { name: "Raise the goal" }).click();
  await page.getByRole("button", { name: "Raise the goal" }).click();
  await expect(key).toContainText("8 / 500");
  const dash = await page.locator(".goal-fill").getAttribute("stroke-dasharray");
  expect(Number(dash!.split(" ")[0])).toBeGreaterThan(0);
});

test("find and replace across the book: a rename everywhere, one undo, a hit shown in its words", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  await page.keyboard.press("Meta+f");
  await page.getByLabel("Find", { exact: true }).fill("Mara");
  await page.getByRole("button", { name: "Whole words" }).click();
  await page.getByRole("button", { name: "Aa" }).click();
  const count = Number(await page.locator(".find-n").textContent());
  expect(count).toBeGreaterThan(3);
  await page.getByLabel("Replace with").fill("Maren");
  await page.getByRole("button", { name: "Replace all" }).click();
  await expect(page.locator(".find-n")).toHaveText("0");
  await expect(page.locator(".notice")).toContainText(`Replaced ${count}`);
  await expect(page.locator('[data-node="c1"]')).toContainText("Maren");
  // one step back puts every one of them back
  await page.keyboard.press("Escape");
  await page.locator(".stage").click({ position: { x: 20, y: 400 } });
  await page.keyboard.press("Meta+z");
  await expect(page.locator('[data-node="c1"]')).toContainText("Mara");
  await expect(page.locator('[data-node="c1"]')).not.toContainText("Maren");
  // a hit goes to its words, selected
  await page.keyboard.press("Meta+f");
  await page.getByLabel("Find", { exact: true }).fill("tarred string");
  await page.locator(".find-go").first().click();
  await expect(page.locator(".docpage .pm").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("tarred string");
});

test("comments: in the margin by their words, through an edit before them, resolved and reopened", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  await page.locator(".stage").press("Tab"); // the panes away: room for the margin
  await page.locator('[data-node="ch1"]').dblclick({ position: { x: 60, y: 14 } });
  const pm = page.locator(".docpage .pm").first();
  // choose the chapter's last words and comment on them
  await pm.click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.press("Shift+Alt+ArrowLeft");
  await page.keyboard.press("Shift+Alt+ArrowLeft");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const card = page.locator(".comment-card").first();
  await expect(card).toBeVisible();
  await page.keyboard.type("Why does he say it twice?");
  await expect(card.locator("textarea")).toHaveValue("Why does he say it twice?");
  const passage = page.locator(".tie.remark").first();
  await expect(passage).toBeVisible();
  const words = (await passage.textContent())!.trim();
  expect(words.length).toBeGreaterThan(2);
  // in the margin, level with its words
  const [p, c] = [await passage.boundingBox(), await card.boundingBox()];
  expect(c!.x).toBeGreaterThan(p!.x + p!.width);
  expect(Math.abs(p!.y - c!.y)).toBeLessThan(40);
  // words written before it: it stays with its words
  await pm.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Meta+ArrowUp");
  await page.keyboard.type("Before anything, ");
  await expect(page.locator(".tie.remark").first()).toHaveText(words); // the same words, where they now are
  await expect(card).toBeVisible();
  // resolved: put away; shown on asking; reopened
  await card.getByRole("button", { name: "Resolve" }).click();
  await expect(page.locator(".comment-card")).toHaveCount(0);
  await expect(page.locator(".tie.remark")).toHaveCount(0);
  await page.getByRole("button", { name: "1 resolved" }).click();
  await page.locator(".comment-card.done").getByRole("button", { name: "Reopen" }).click();
  await expect(page.locator(".tie.remark")).toHaveCount(1);
  // the panes back: no room — a mark at the column's edge opens the card
  await page.locator(".stage").press("Tab");
  await expect(page.locator(".margin-mark")).toHaveCount(1, { timeout: 3000 });
  await page.locator(".margin-mark").click();
  await expect(page.locator(".comment-card textarea")).toHaveValue("Why does he say it twice?");
  // and it is not the book's words: Find does not see it
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+f");
  await page.getByLabel("Find", { exact: true }).fill("say it twice");
  await expect(page.locator(".find-note")).toHaveText("Not in the book.");
});
