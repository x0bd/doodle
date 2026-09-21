/**
 * The mock provider: product infrastructure, not a stub. It takes the time
 * a real render takes, reports every step, honours cancellation, and
 * returns the fixture. Every run path is proven against this first.
 */
import { FIXTURES } from "./fixtures";
import type { ImageRequest, ImageResult, Progress, Provider, TextRequest } from "./types";

const STEP_MS = 70;

/** a shot list the mock proposes for any scene — quiet, in order */
const SHOTS = [
  { title: "The door", description: "Wide on the greenhouse door from inside, dust in the one shaft of light. It has not opened in years.", shotSize: "WS", lensMm: 24, movement: "static", durationMs: 4000, rationale: "Establish the room and the stillness before anything moves" },
  { title: "It opens", description: "The door, closer. It gives, slowly, and R-404's silhouette fills the gap.", shotSize: "MS", lensMm: 35, movement: "static", durationMs: 3000, rationale: "The first change in a still world" },
  { title: "The plant", description: "Close on one leaf in a dry bed, the only green in frame.", shotSize: "CU", lensMm: 85, movement: "static", durationMs: 2500, rationale: "What all of this is about" },
  { title: "Reach", description: "R-404's hand enters, stops short of the leaf, pulls back.", shotSize: "MCU", lensMm: 50, movement: "handheld", durationMs: 3500, rationale: "Hesitation, in the hands" },
  { title: "Reserve", description: "Low angle: the reserve tank, a gauge near empty, R-404 unscrewing the valve.", shotSize: "MS", lensMm: 35, movement: "dolly-in", durationMs: 4000, rationale: "The cost is shown, not said" },
  { title: "Water", description: "Overhead. A thin line of water finds the soil. The leaf does not move. Hold.", shotSize: "CU", lensMm: 50, movement: "static", durationMs: 5000, rationale: "The act, and nothing answering it yet" },
];

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
    if (req.system?.includes("JSON array only")) {
      const n = Number(req.system.match(/Propose (\d+) shots/)?.[1] ?? 6);
      return JSON.stringify(SHOTS.slice(0, Math.max(1, Math.min(SHOTS.length, n))));
    }
    const brief = req.prompt.trim().replace(/\.$/, "");
    return `${brief}.\n\nThe wind comes in off the water before the light does. She is on the gallery with the glass still in her hand when she sees it — a hull where no hull should be, riding low, no lamp lit, no one at the rail. She counts to ten. Nothing on it moves.\n\n(Mock. Wire a real writer in Settings when there is one.)`;
  },
};
