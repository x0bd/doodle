/**
 * Meaning as numbers (PLAN.md M6.2): words turned into a vector by an
 * embedding model in Ollama, so a question finds the passage that answers
 * it though they share no words. Qwen3 Embedding is the one asked for
 * (`ollama pull qwen3-embedding:0.6b`); any embedding model will do.
 */
const BASE = "http://localhost:11434";

/** the models that embed, not write */
export const EMBEDS = /(embed|nomic-bert|bge-|minilm|mxbai|snowflake-arctic|granite-embedding)/i;

/** Qwen's are told what the question is for; the passages are given bare */
const ASKS = /qwen3-embedding/i;
const INSTRUCT = "Given a question about a book, find the passage of the book that answers it";

/** The embedding model on this Mac, if there is one. */
export async function embedder(): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const { models } = (await r.json()) as { models: { name: string }[] };
    // Qwen's first: it reads long passages and questions best
    const all = models.map((m) => m.name).filter((n) => EMBEDS.test(n));
    return all.find((n) => ASKS.test(n)) ?? all[0] ?? null;
  } catch {
    return null;
  }
}

/** a vector made length 1, so a dot product is how alike two are */
function unit(v: number[]): Float32Array {
  const out = Float32Array.from(v);
  let n = 0;
  for (const x of out) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

/** Passages (or a question), as vectors. */
export async function embed(texts: string[], model: string, as: "passage" | "question", signal?: AbortSignal): Promise<Float32Array[]> {
  if (!texts.length) return [];
  const input = as === "question" && ASKS.test(model) ? texts.map((t) => `Instruct: ${INSTRUCT}\nQuery: ${t}`) : texts;
  const r = await fetch(`${BASE}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input, truncate: true }),
    signal,
  });
  if (!r.ok) throw new Error(`${model} could not read (${r.status} ${(await r.text().catch(() => "")).slice(0, 160)})`.trim());
  const { embeddings } = (await r.json()) as { embeddings: number[][] };
  return embeddings.map(unit);
}

/** how alike two unit vectors are, -1..1 */
export function alike(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
