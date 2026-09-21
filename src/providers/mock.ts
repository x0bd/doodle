/**
 * The mock provider: product infrastructure, not a stub. It takes the time
 * a real render takes, reports every step, honours cancellation, and
 * returns the fixture. Every run path is proven against this first.
 */
import { FIXTURES } from "./fixtures";
import type { ImageRequest, ImageResult, Progress, Provider, TextRequest } from "./types";

const STEP_MS = 70;

/** The fixture, varied by the seed — a flip, a shift of tone — so
 *  candidates can be told apart. Rendered once per seed into a PNG. */
async function vary(seed: number): Promise<string> {
  const img = new Image();
  img.src = FIXTURES.blackBear;
  await img.decode();
  const size = 768;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const flip = seed % 2 === 1;
  const hue = (seed % 7) * 12 - 36;
  const bright = 1 + ((seed % 5) - 2) * 0.05;
  ctx.filter = `hue-rotate(${hue}deg) brightness(${bright})`;
  ctx.translate(flip ? size : 0, 0);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.drawImage(img, 0, 0, size, size);
  return c.toDataURL("image/png");
}

export const mock: Provider = {
  descriptor: { id: "mock", name: "Mock", capabilities: ["image.generate", "text.generate"] },
  async status() {
    return "available";
  },
  async generateImage(req: ImageRequest, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<ImageResult> {
    const t0 = performance.now();
    const steps = Math.max(1, Math.round(req.steps));
    for (let i = 1; i <= steps; i++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      await new Promise((r) => setTimeout(r, STEP_MS));
      onProgress({ fraction: i / steps, note: `${i}/${steps}` });
    }
    const asset = req.seed === 12345 ? FIXTURES.blackBear : await vary(req.seed);
    return { asset, seed: req.seed, elapsedMs: performance.now() - t0 };
  },
  async generateText(req: TextRequest, signal: AbortSignal): Promise<string> {
    await new Promise((r) => setTimeout(r, 1200));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const brief = req.prompt.trim().replace(/\.$/, "");
    return `${brief}.\n\nThe wind comes in off the water before the light does. She is on the gallery with the glass still in her hand when she sees it — a hull where no hull should be, riding low, no lamp lit, no one at the rail. She counts to ten. Nothing on it moves.\n\n(Mock. Wire a real writer in Settings when there is one.)`;
  },
};
