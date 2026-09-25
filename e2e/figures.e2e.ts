// Figures in the manuscript (PLAN.md M5.4), in WebKit: a picture in a
// chapter's words — its caption and what it shows written in place, where
// it goes chosen — kept in the words as Markdown, and not counted as words;
// a picture dropped on the words lands after the paragraph it fell on.
import { test, expect } from "@playwright/test";

const PIC = "/fixtures/black-bear.png";

test("a figure in a chapter: caption, alt text and placement written in place, kept as Markdown", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  const before = await page.evaluate(async (pic) => {
    const G = await import("/src/state/graph.ts" as string);
    const M = await import("/src/writer/markup.ts" as string);
    const t = G.graph.get().nodes.ch1.data.text as string;
    const paras = t.split("\n\n");
    G.updateData("ch1", { text: [paras[0], M.figureLine({ src: pic }), ...paras.slice(1)].join("\n\n") });
    return M.countWords(t);
  }, PIC);
  await page.locator('[data-node="ch1"]').dblclick({ position: { x: 60, y: 14 } });
  const fig = page.locator(".docpage .pm .figure").first();
  await expect(fig.locator("img")).toHaveAttribute("src", /^(data:image|\/fixtures)/);

  // chosen: its caption, what it shows, where it goes
  await fig.locator(".figure-well").click();
  await expect(fig).toHaveClass(/chosen/);
  await fig.locator(".figure-caption").fill("The ship, from the gallery");
  await fig.locator(".figure-alt").fill("A dark hull off the rocks at first light");
  await fig.getByRole("radio", { name: "A page of its own" }).click();
  await expect(fig).toHaveClass(/fig-page/);

  const after = await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    const M = await import("/src/writer/markup.ts" as string);
    const t = G.graph.get().nodes.ch1.data.text as string;
    return { line: t.split("\n\n")[1], words: M.countWords(t) };
  });
  expect(after.line).toBe(`![The ship, from the gallery](${PIC} "A dark hull off the rocks at first light"){.page}`);
  expect(after.words).toBe(before);

  // a picture dropped on the second paragraph lands after it
  const second = page.locator(".docpage .pm > p").nth(1);
  const box = (await second.boundingBox())!;
  await page.evaluate(
    ([x, y, pic]) => document.querySelector(".docpage .pm")!.dispatchEvent(new CustomEvent("doodle-figures", { detail: { refs: [pic], x, y } })),
    [box.x + 20, box.y + 5, PIC] as const,
  );
  await expect(page.locator(".docpage .pm .figure")).toHaveCount(2);
  const order = await page.locator(".docpage .pm > *").evaluateAll((els) => els.map((e) => (e.classList.contains("figure") ? "F" : "p")).join(""));
  expect(order.slice(0, 5)).toBe("pFpFp"); // the first paragraph, the figure, the second, the dropped one
});
