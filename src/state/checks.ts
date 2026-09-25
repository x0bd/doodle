/**
 * The continuity check (PLAN.md M6.3) — the pure part: what the writer is
 * given (a chapter, and what the book has already fixed), what it answers
 * (findings, each quoting the chapter and what it contradicts), and what is
 * kept of the answer — only findings whose words are the chapter's own.
 */
import { locate } from "./anchors";

export const CHECK_SYSTEM = `CONTINUITY CHECK. You check one chapter of a novel against what the book has already fixed: its bible (tone, rules of the world, what to avoid), its characters and places as written down, and the chapters before it.

Find where THIS chapter says something that cannot be true if those are true — a fact, an age, a date, a name, a place, how someone looks, what someone knows or could know, a rule of the world broken. Not style, not taste, not something merely new or unexplained: only what contradicts.

For each finding:
- quote: the chapter's own words, copied exactly — one sentence or a phrase from <chapter>;
- source: where the contradicted thing is written — "The bible", a character's or place's name, or a chapter's title;
- says: the words there, copied exactly;
- problem: what does not agree, in a sentence;
- fix: the smallest change to the chapter that would make it agree, in a sentence.

Report each contradiction once. If nothing contradicts, give an empty list. Answer in JSON.`;

export const CHECK_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: { quote: { type: "string" }, source: { type: "string" }, says: { type: "string" }, problem: { type: "string" }, fix: { type: "string" } },
        required: ["quote", "source", "says", "problem", "fix"],
      },
    },
  },
  required: ["findings"],
};

export interface Source {
  /** "The bible", a character's name, a chapter's title */
  name: string;
  text: string;
}

export interface Finding {
  quote: string;
  source: string;
  says: string;
  problem: string;
  fix: string;
  /** whether `says` was found in the source it names, word for word or near it */
  sourced: boolean;
}

/** What the writer is given: the chapter, and each source in its own block. */
export function material(chapter: { title: string; text: string }, sources: Source[], notes: string[] = []): string {
  return [
    ...sources.map((s) => `<source name="${s.name.replace(/"/g, "'")}">\n${s.text.trim()}\n</source>`),
    ...notes,
    `<chapter title="${chapter.title.replace(/"/g, "'")}">\n${chapter.text.trim()}\n</chapter>`,
    `Check the chapter "${chapter.title}" against the sources above.`,
  ].join("\n\n");
}

const squash = (s: string) => s.replace(/[*_`~]/g, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/** whether `quote` is in `text` — to the letter, or near enough (spacing, markup, curly quotes, an edited middle) */
export function holds(text: string, quote: string): boolean {
  const q = squash(quote).replace(/^["'…. ]+|["'…. ]+$/g, "");
  if (q.length < 6) return false;
  const t = squash(text);
  return t.includes(q) || !!locate(t, { node: "", text: q, at: 0 });
}

/**
 * The findings that can be trusted: the chapter's words must be the
 * chapter's (a finding that misquotes it cannot be put in the margin, and
 * is dropped); the source's words are checked too, and a finding whose
 * source does not say what it is quoted as saying is marked, not dropped.
 */
export function parseFindings(answer: string, chapter: string, sources: Source[]): Finding[] {
  let raw: unknown;
  try {
    raw = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));
  } catch {
    return [];
  }
  const list = Array.isArray((raw as { findings?: unknown })?.findings) ? ((raw as { findings: unknown[] }).findings as Record<string, unknown>[]) : [];
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of list) {
    const quote = String(f.quote ?? "").trim();
    // the same words twice — or one quote inside another — is one finding
    const q = squash(quote).toLowerCase();
    if (!quote || !holds(chapter, quote) || [...seen].some((x) => x.includes(q) || q.includes(x))) continue;
    seen.add(q);
    const source = String(f.source ?? "").trim();
    const says = String(f.says ?? "").trim();
    const where = sources.find((s) => s.name.toLowerCase() === source.toLowerCase()) ?? sources.find((s) => source.toLowerCase().includes(s.name.toLowerCase()));
    out.push({ quote, source, says, problem: String(f.problem ?? "").trim(), fix: String(f.fix ?? "").trim(), sourced: !!says && (where ? holds(where.text, says) : sources.some((s) => holds(s.text, says))) });
  }
  return out;
}
