/**
 * OCR (PLAN.md M3.2): the words on a picture of a page, read by a model on
 * this Mac through Ollama. `chandra-ocr-2` is the one Doodle reaches for
 * first — it reads the page whole, with its layout named (a header, the
 * text, a page number), so running heads and page numbers are left out and
 * headings stay headings; `glm-ocr` is the fast one, but on a whole page it
 * can go round and read the page again and again, so it is read as it
 * streams and stopped where it starts over.
 */

const BASE = "http://localhost:11434";

export type OcrKind = "chandra" | "glm";
export interface OcrModel {
  id: string;
  kind: OcrKind;
  /** the name a person reads */
  name: string;
}

const KNOWN: { test: RegExp; kind: OcrKind; name: string }[] = [
  { test: /chandra-ocr/i, kind: "chandra", name: "Chandra OCR 2" },
  { test: /glm-ocr/i, kind: "glm", name: "GLM-OCR" },
];

/** The OCR models this Mac has, the careful one first. */
export async function ocrModels(): Promise<OcrModel[]> {
  try {
    const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const { models } = (await r.json()) as { models: { name: string }[] };
    const out: OcrModel[] = [];
    for (const k of KNOWN) {
      const m = models.find((x) => k.test.test(x.name));
      if (m) out.push({ id: m.name, kind: k.kind, name: k.name });
    }
    return out;
  } catch {
    return [];
  }
}

/** A page's picture (base64, no `data:` head) → its words as Markdown. */
export async function ocrImage(image: string, model: OcrModel, signal?: AbortSignal): Promise<string> {
  if (model.kind === "chandra") {
    const r = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      signal,
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: "user", content: "OCR this image to Markdown. Output only the text of the page.", images: [image] }],
        stream: false,
        think: false,
        options: { temperature: 0, num_predict: 6000 },
      }),
    });
    if (!r.ok) throw new Error(`${model.name} could not read it (${r.status})`);
    const out = (await r.json()) as { message: { content: string } };
    return fromLayout(out.message.content);
  }
  // GLM-OCR: streamed, and stopped where it starts reading the page again
  const stop = new AbortController();
  signal?.addEventListener("abort", () => stop.abort(signal.reason));
  const r = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    signal: stop.signal,
    body: JSON.stringify({ model: model.id, prompt: "Text Recognition:", images: [image], stream: true, options: { num_predict: 6000 } }),
  });
  if (!r.ok || !r.body) throw new Error(`${model.name} could not read it (${r.status})`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  let rest = "";
  let looked = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += dec.decode(value, { stream: true });
      const lines = rest.split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) text += (JSON.parse(l) as { response?: string }).response ?? "";
      // look again once a line's worth more has come
      if (text.length - looked > 120 && ((looked = text.length), repeatsAt(text) >= 0)) {
        stop.abort();
        break;
      }
    }
  } catch (e) {
    if (signal?.aborted) throw e;
    // stopped here on purpose: what was read stands
  }
  const at = repeatsAt(text);
  return tidy(at >= 0 ? text.slice(0, at) : text);
}

/** Where the words start over — the second time a stretch of 80
 *  characters is read — or -1. */
export function repeatsAt(text: string, span = 80): number {
  if (text.length < span * 2) return -1;
  // the page's opening, found again later, is where a reading goes round
  const head = text.search(/\S/);
  const opening = text.slice(head, head + span);
  const again = text.indexOf(opening, head + span);
  if (again >= 0) return again;
  // else any stretch read twice (it can go round from the middle)
  const seen = new Map<string, number>();
  for (let i = 0; i + span <= text.length; i++) {
    const k = text.slice(i, i + span);
    const first = seen.get(k);
    if (first !== undefined && i - first >= span) return i;
    if (first === undefined) seen.set(k, i);
  }
  return -1;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m),
  );

/** inline HTML → Markdown's marks, a line break a line break, any other tag gone */
function inline(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, (_, _t, x: string) => (x.trim() ? `**${x.trim()}**` : x))
      .replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, (_, _t, x: string) => (x.trim() ? `_${x.trim()}_` : x))
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/** what the page's layout names that is not its words */
const LEAVE = /^(page-header|page-footer|picture|figure|image|formula-image)$/i;

/** A page read with its layout (Chandra's `<div data-label=…>` blocks) →
 *  Markdown: headings kept, lists as lists, a table as its rows, running
 *  heads, page numbers and pictures left out. Anything without the layout
 *  is taken as Markdown already. */
export function fromLayout(out: string): string {
  const blocks = [...out.matchAll(/<div\b[^>]*data-label="([^"]+)"[^>]*>([\s\S]*?)<\/div>/gi)];
  if (!blocks.length) return tidy(out);
  const md: string[] = [];
  for (const [, label, body] of blocks) {
    if (LEAVE.test(label)) continue;
    const h = body.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i);
    if (h || /header|title/i.test(label)) {
      const level = h ? Math.min(3, Number(h[1])) : 1;
      const words = inline(h ? h[2] : body).replace(/\n/g, " ");
      if (words) md.push(`${"#".repeat(level)} ${words}`);
      continue;
    }
    if (/<li\b/i.test(body)) {
      const counted = /<ol\b/i.test(body);
      const items = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => `${counted ? "1." : "-"} ${inline(m[1]).replace(/\n/g, " ")}`);
      if (items.length) md.push(items.join("\n"));
      continue;
    }
    if (/<tr\b/i.test(body)) {
      const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
        [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => inline(c[1]).replace(/\n/g, " ")).join(" · "),
      );
      if (rows.length) md.push(rows.join("\n"));
      continue;
    }
    const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => inline(m[1]));
    const words = (paras.length ? paras : [inline(body)]).filter(Boolean);
    if (!words.length) continue;
    if (/caption/i.test(label)) md.push(...words.map((w) => `_${w}_`));
    else md.push(...words);
  }
  return md.join("\n\n");
}

/** plain Markdown from a model: its fences and stray blank lines gone */
function tidy(s: string): string {
  return s
    .replace(/^```(?:markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** How near a reading is to what the page says: 1 − the word edit
 *  distance over the page's words (case and punctuation aside). */
export function wordAccuracy(read: string, truth: string): number {
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[#*_>`]/g, " ")
      .replace(/[^\p{L}\p{N}'’\s-]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  const a = words(read);
  const b = words(truth);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return b.length ? Math.max(0, 1 - prev[b.length] / b.length) : a.length ? 0 : 1;
}
