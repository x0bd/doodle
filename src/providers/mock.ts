/**
 * The mock provider: product infrastructure, not a stub. It takes the time
 * a real render takes, reports every step, honours cancellation, and
 * returns the fixture. Every run path is proven against this first.
 */
import { FIXTURES } from "./fixtures";
import type { ImageRequest, ImageResult, Progress, Provider, TextRequest } from "./types";

const STEP_MS = 70;

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
    return { asset: FIXTURES.blackBear, seed: req.seed, elapsedMs: performance.now() - t0 };
  },
  async generateText(req: TextRequest): Promise<string> {
    await new Promise((r) => setTimeout(r, 300));
    return `${req.prompt.trim()}, rendered with care`;
  },
};
