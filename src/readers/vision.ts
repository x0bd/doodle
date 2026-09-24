/**
 * Eyes (PLAN.md M3.6): a picture described in words, by a model on this
 * Mac that can see, for a writer that cannot. A general vision model if
 * Ollama has one; else Chandra — an OCR model, but one that sees a picture
 * well enough to say what is in it, its colours and its light.
 */
import { ocrModels } from "./ocr";

const BASE = "http://localhost:11434";
/** the vision families Ollama carries (OCR models aside) */
const SEES = /(llava|vision|-vl|vl:|minicpm-v|moondream|gemma3|llama4|qwen2\.5vl|qwen3-vl|granite3\.2-vision|mistral-small3\.[12])/i;

export interface Eyes {
  id: string;
  name: string;
}

/** The model that looks, if this Mac has one. */
export async function eyes(): Promise<Eyes | null> {
  try {
    const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const { models } = (await r.json()) as { models: { name: string }[] };
    const general = models.find((m) => SEES.test(m.name) && !/ocr/i.test(m.name));
    if (general) return { id: general.name, name: general.name };
  } catch {
    return null;
  }
  const chandra = (await ocrModels()).find((m) => m.kind === "chandra");
  return chandra ? { id: chandra.id, name: chandra.name } : null;
}

/** A picture (base64, no `data:` head) in two sentences: what is in it, its colours, its light, its medium. */
export async function describe(image: string, by: Eyes, signal?: AbortSignal): Promise<string> {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    signal,
    body: JSON.stringify({
      model: by.id,
      messages: [{ role: "user", content: "Describe this picture for a novelist in two sentences: what is in it, its colours, its light, its medium.", images: [image] }],
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 160 },
    }),
  });
  if (!r.ok) throw new Error(`${by.name} could not look (${r.status})`);
  return ((await r.json()) as { message: { content: string } }).message.content.trim();
}
