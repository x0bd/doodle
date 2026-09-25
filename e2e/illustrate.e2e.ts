// Illustrate a passage (PLAN.md M5.3), in WebKit on the stand-in drawer:
// words chosen in a chapter → a picture made with who the passage names
// (their faces ride in the request), its takes under the words, one put in
// as a figure after the passage.
import { test, expect } from "@playwright/test";

test("illustrate a passage: made with who it names, its takes under the words, one put in after it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  // Mara has a face
  await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    G.graph.set((g: any) => ({ ...g, nodes: { ...g.nodes, c1: { ...g.nodes.c1, asset: "/fixtures/black-bear.png" } } }));
  });
  await page.locator('[data-node="ch1"]').dblclick({ position: { x: 60, y: 14 } });

  // choose the second paragraph ("Mara counts the gulls…")
  const para = page.locator(".docpage .pm > p").nth(1);
  await para.click({ position: { x: 4, y: 8 } });
  await page.keyboard.press("Meta+ArrowLeft");
  await page.keyboard.press("Shift+ArrowDown");
  await page.getByRole("button", { name: "Illustrate" }).click();

  // a brief of the words, naming her, tied to them; its generator running
  const made = await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    const J = await import("/src/state/jobs.ts" as string);
    const g = G.graph.get();
    const gen = Object.values(g.nodes).find((n: any) => n.kind === "generate" && n.data.illustrates) as any;
    const brief = g.nodes[gen.data.illustrates] as any;
    const job = Object.values(J.jobs.get().jobs).find((x: any) => x.nodeId === gen.id) as any;
    return { brief: brief.data.text, tied: brief.anchor?.node, images: job?.request.images?.map((i: any) => i.label), frame: gen.data.frame };
  });
  expect(made.brief).toMatch(/^Mara counts the gulls/);
  expect(made.brief).toContain("In it: @Mara.");
  expect(made.tied).toBe("ch1");
  expect(made.images).toEqual(["Mara (a character)"]);
  expect(made.frame).toBe("3:2");

  // its takes arrive under the words
  const illo = page.locator(".illo").first();
  await expect(illo.locator(".illo-take")).toHaveCount(2, { timeout: 20000 });
  await illo.locator(".illo-take").first().hover();
  await illo.locator(".illo-take").first().getByRole("button", { name: "Into the words" }).click();
  await expect(illo.locator(".illo-take").first().getByRole("button")).toHaveText("In the words");

  // the figure sits after the passage it illustrates
  const order = await page.locator(".docpage .pm > *").evaluateAll((els) => els.slice(0, 4).map((e) => (e.classList.contains("figure") ? "F" : e.textContent!.slice(0, 12))));
  expect(order[1]).toMatch(/^Mara counts/);
  expect(order[2]).toBe("F");
});

test("the agent proposes an illustration; kept, it is drawn from the passage", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The keeper's daughter/ }).click();
  await page.locator('[data-node="ch1"]').dblclick({ position: { x: 60, y: 14 } });
  await page.evaluate(async () => {
    const T = await import("/src/agent/tools.ts" as string);
    await T.runTool("propose_illustration", { id: "ch1", quote: "Tom Keel comes along the causeway with his collar up and his pipe cold", why: "The first time we see him." }, "Mock");
  });
  const offer = page.locator(".proposal").filter({ hasText: "Proposed illustrations" });
  await expect(offer).toContainText("from “Tom Keel comes along the causeway");
  // nothing drawn yet
  expect(await page.locator(".illo").count()).toBe(0);
  await offer.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(page.locator(".illo")).toHaveCount(1);
  const brief = await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    const gen = Object.values(G.graph.get().nodes).find((n: any) => n.data.illustrates) as any;
    return G.graph.get().nodes[gen.data.illustrates].data.text;
  });
  expect(brief).toContain("In it: @Tom Keel.");
});
