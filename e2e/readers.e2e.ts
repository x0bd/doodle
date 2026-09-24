// The PDF reader in WebKit (PLAN.md M3.1): pdf.js and its worker load as the
// app loads them, the fixture reads as its expected output, and a page
// becomes a picture. The fixtures are served by the dev server as files.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("a PDF reads, page by page, and a page becomes a picture", async ({ page }) => {
  await page.goto("/");
  const got = await page.evaluate(async () => {
    const pdf = await import("/src/readers/pdf.ts" as string);
    const bytes = new Uint8Array(await (await fetch("/fixtures/import/keeper.pdf")).arrayBuffer());
    const read = await pdf.readPdf(bytes);
    const picture: string = await pdf.pagePicture(bytes, 1, 600);
    const img = new Image();
    img.src = picture;
    await img.decode();
    // the picture has ink on it: some pixel in the heading's corner is dark
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, img.width, Math.round(img.height / 5)).data;
    let dark = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] < 100) dark++;
    return { read, size: [img.width, img.height], dark, bytes: bytes.length };
  });
  expect(got.read).toEqual(JSON.parse(readFileSync("fixtures/import/keeper.pdf.json", "utf8")));
  expect(got.size[0]).toBe(600);
  expect(got.dark).toBeGreaterThan(50);
});
