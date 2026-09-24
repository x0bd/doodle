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

// Build from the board (PLAN.md M3.6), with the stand-in writer so the
// proposals are the same every time: the board read, a cast, places, a
// style and an outline proposed, each naming its clippings; kept, each is a
// node that opens the clippings it came from.
test("built from the board: what is kept links back to the clippings it came from", async ({ page }) => {
  const ids = await aBoard(page);
  await page.evaluate(async (board) => {
    const U = await import("/src/state/ui.ts" as string);
    U.setWriteWith("Mock");
    const G = await import("/src/state/graph.ts" as string);
    const pic = G.makeNode("clip", 400, 0, { title: "harbour-03", parent: board, data: { what: "picture", text: "", source: "", from: "harbour-03.jpg", page: 0, pages: 0, ratio: 1, note: "", seen: "A yellow sun over a navy sea." } });
    G.graph.set((g: any) => ({ ...g, nodes: { ...g.nodes, [pic.id]: pic }, order: [...g.order, pic.id] }));
  }, ids.board);

  await page.getByRole("button", { name: "Build from the board" }).click();
  const panel = page.getByRole("complementary", { name: "From the board" });
  await expect(panel).toBeVisible({ timeout: 10_000 });
  for (const head of ["Cast", "Places", "Things", "Style", "Outline", "Bible"]) await expect(panel.locator(".built-of", { hasText: head })).toBeVisible();
  // each proposal names what it came from; pointed at, those light on the board
  await panel.locator(".built-row", { hasText: "Mara" }).hover();
  await expect(page.locator(`[data-node="${ids.doc}"].from-lit`)).toHaveCount(1);

  // keep Mara, then all the rest
  await page.getByRole("button", { name: "Keep Mara" }).click();
  await page.getByRole("button", { name: "Keep all" }).click();
  await expect(panel).toHaveCount(0);

  const kept = await page.evaluate(async (board) => {
    const G = await import("/src/state/graph.ts" as string);
    const D = await import("/src/state/doc.ts" as string);
    const g = G.graph.get();
    const made = Object.values(g.nodes).filter((n: any) => n.parent === null && n.id !== board && n.kind !== "board") as any[];
    return { made: made.map((n) => ({ kind: n.kind, title: n.title, clips: String(n.data.clips ?? "") })), bible: D.doc.get().bible };
  }, ids.board);
  expect(kept.made.map((m) => m.kind).sort()).toEqual(["chapter", "chapter", "chapter", "character", "character", "location", "note", "style"]);
  // everything kept is linked back to the clippings it came from
  for (const m of kept.made) expect(m.clips.split(",").filter(Boolean).length).toBeGreaterThan(0);
  expect(kept.bible.tone).toContain("Quiet");

  // and a kept thing opens them: Mara's page names the document; a click opens it
  const mara = await page.evaluate(async () => {
    const G = await import("/src/state/graph.ts" as string);
    return (Object.values(G.graph.get().nodes).find((n: any) => n.title === "Mara") as any).id;
  });
  await page.evaluate(async (id) => (await import("/src/state/nav.ts" as string)).enter(id), mara);
  await page.locator(".paper-clips .built-clip", { hasText: "The Keeper's Log" }).click();
  await expect(page.locator(".source .read-title")).toHaveText("The Keeper's Log");
});

// Board → style (PLAN.md M3.7): pictures chosen on a board become a style
// whose references ride into the image requests it is wired to.
test("a style made from pictures on the board carries them into image requests", async ({ page }) => {
  const ids = await aBoard(page);
  const pics = await page.evaluate(async (board) => {
    const G = await import("/src/state/graph.ts" as string);
    // two small pictures, as the page draws them (a data URL passes through the asset store)
    const dot = (c: string) => {
      const k = document.createElement("canvas");
      k.width = k.height = 8;
      const x = k.getContext("2d")!;
      x.fillStyle = c;
      x.fillRect(0, 0, 8, 8);
      return k.toDataURL("image/png");
    };
    const a = G.makeNode("clip", 400, 0, { title: "harbour-02", parent: board, asset: dot("#e8a0d0"), data: { what: "picture", text: "", source: "", from: "harbour-02.jpg", page: 0, pages: 0, ratio: 1, note: "", seen: "A pink dusk over navy water." } });
    const b = G.makeNode("clip", 700, 0, { title: "harbour-03", parent: board, asset: dot("#a0e0e0"), data: { what: "picture", text: "", source: "", from: "harbour-03.jpg", page: 0, pages: 0, ratio: 1, note: "", seen: "A pale sun over teal." } });
    G.graph.set((g: any) => ({ ...g, nodes: { ...g.nodes, [a.id]: a, [b.id]: b }, order: [...g.order, a.id, b.id] }));
    G.select([a.id, b.id]);
    return [a.id, b.id];
  }, ids.board);

  await page.getByRole("button", { name: "Make a style from these 2" }).click();
  await expect
    .poll(() => page.evaluate(async () => Object.values((await import("/src/state/graph.ts" as string)).graph.get().nodes).some((n: any) => n.kind === "style")))
    .toBe(true);
  const made = await page.evaluate(async ({ board, pics }) => {
    const G = await import("/src/state/graph.ts" as string);
    const J = await import("/src/state/jobs.ts" as string);
    const g = G.graph.get();
    const style = Object.values(g.nodes).find((n: any) => n.kind === "style") as any;
    // wire it into a generator at the book's level, and ask what that generator would send
    const gen = G.makeNode("generate", 0, 600, { parent: null });
    G.graph.set((s: any) => ({ ...s, nodes: { ...s.nodes, [gen.id]: gen }, order: [...s.order, gen.id] }));
    G.connectNow({ node: style.id, port: "text" }, { node: gen.id, port: "style" });
    const req = J.requestFor(G.graph.get().nodes[gen.id]);
    return { parent: style.parent, board, attachments: style.attachments, clips: style.data.clips, pics, images: (req.images ?? []).map((p: any) => ({ label: p.label, ref: p.ref })), prompt: req.prompt };
  }, { board: ids.board, pics });

  expect(made.parent).toBeNull(); // beside the board, at the book's level
  expect(made.clips.split(",")).toEqual(made.pics);
  expect(made.images).toHaveLength(2);
  expect(made.images.map((i: any) => i.ref)).toEqual(made.attachments);
  expect(made.images[0].label).toContain("a reference for the style");
  expect(made.prompt).toContain("Pictures attached");
});
