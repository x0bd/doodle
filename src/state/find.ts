/**
 * Find and replace across the book (PLAN.md M2.6) — the pure part.
 *
 * What is looked through: every written thing in the book as it is written
 * (Markdown and all, so replacing never loses a mark) — a chapter's words,
 * a page's, a beat's or note's, a brief's, a summary — and the names,
 * descriptions and titles of the people, places and styles, so a name
 * changed is changed everywhere it is written. Rejected cards are left be.
 *
 * Replacing is one change to the graph (the caller makes it one journal
 * entry), and the passages beats are tied to are replaced the same way, so
 * a tie follows its words through a rename instead of going adrift.
 */
import type { GraphNode, GraphState } from "./graph";

export interface FindOptions {
  /** match letter case exactly */
  cased?: boolean;
  /** only whole words */
  whole?: boolean;
  /** the query is a regular expression; `$1` in the replacement is its first group */
  regex?: boolean;
}

/** a field a hit is in, as the list says it */
export type Field = "text" | "summary" | "description" | "name" | "title";

export interface Hit {
  node: string;
  field: Field;
  start: number;
  end: number;
  /** a little of what is around it, for the list */
  before: string;
  match: string;
  after: string;
}

/** the fields each kind is looked through for, in reading order */
const FIELDS: Partial<Record<GraphNode["kind"], Field[]>> = {
  chapter: ["title", "summary", "text"],
  page: ["text"],
  note: ["title", "text"],
  prompt: ["text"],
  character: ["title", "name", "description"],
  location: ["title", "name", "description"],
  style: ["description"],
  shot: ["description"],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The query as a pattern, or why it is not one. */
export function pattern(query: string, o: FindOptions): RegExp | string {
  if (!query) return "Nothing to find.";
  let src = o.regex ? query : escape(query);
  if (o.whole) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  try {
    const re = new RegExp(src, `gu${o.cased ? "" : "i"}`);
    if (re.test("")) return "That pattern matches nothing at all.";
    return re;
  } catch (e) {
    return `Not a pattern: ${(e as Error).message.replace(/^Invalid regular expression: /, "")}`;
  }
}

const valueOf = (n: GraphNode, f: Field) => (f === "title" ? n.title : typeof n.data[f] === "string" ? (n.data[f] as string) : "");

/** Every hit in the book, in order: by card (the graph's order), then by field. */
export function findAll(g: Pick<GraphState, "nodes" | "order">, query: string, o: FindOptions = {}, limit = 2000): Hit[] | string {
  const re = pattern(query, o);
  if (typeof re === "string") return re;
  const hits: Hit[] = [];
  for (const id of g.order) {
    const n = g.nodes[id];
    if (!n || n.status === "rejected") continue;
    for (const field of FIELDS[n.kind] ?? []) {
      const text = valueOf(n, field);
      if (!text) continue;
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (!m[0]) {
          re.lastIndex++;
          continue;
        }
        const start = m.index;
        const end = start + m[0].length;
        hits.push({
          node: id,
          field,
          start,
          end,
          before: text.slice(Math.max(0, start - 40), start).replace(/\s+/g, " "),
          match: m[0],
          after: text.slice(end, end + 60).replace(/\s+/g, " "),
        });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

/**
 * The graph's nodes with every hit replaced (or only `only`, one hit), and
 * how many were. Ties to a replaced node's words are replaced the same way.
 */
export function replaceAll(
  g: Pick<GraphState, "nodes" | "order">,
  query: string,
  replacement: string,
  o: FindOptions = {},
  only?: Pick<Hit, "node" | "field" | "start">,
): { nodes: GraphState["nodes"]; count: number } | string {
  const re = pattern(query, o);
  if (typeof re === "string") return re;
  const swap = (s: string) => {
    let n = 0;
    const out = s.replace(re, (...args) => {
      n++;
      if (!o.regex) return replacement;
      // $1…$9 and $& in the replacement, as the platform reads them
      const groups = args.slice(0, -2) as string[];
      return replacement.replace(/\$(\d|&)/g, (_, k) => (k === "&" ? groups[0] : (groups[Number(k)] ?? "")));
    });
    return { out, n };
  };
  const nodes = { ...g.nodes };
  let count = 0;
  const changed = new Set<string>();
  for (const id of g.order) {
    const n = nodes[id];
    if (!n || n.status === "rejected") continue;
    if (only && only.node !== id) continue;
    let next = n;
    for (const field of FIELDS[n.kind] ?? []) {
      if (only && only.field !== field) continue;
      const text = valueOf(next, field);
      if (!text) continue;
      let out: string;
      let k: number;
      if (only) {
        // the one hit: the pattern matched again where it was found
        re.lastIndex = only.start;
        const m = re.exec(text);
        if (!m || m.index !== only.start) continue;
        const one = swap(m[0]);
        out = text.slice(0, m.index) + one.out + text.slice(m.index + m[0].length);
        k = 1;
      } else {
        ({ out, n: k } = swap(text));
      }
      if (!k) continue;
      count += k;
      next = field === "title" ? { ...next, title: out } : { ...next, data: { ...next.data, [field]: out } };
    }
    if (next !== n) {
      nodes[id] = next;
      changed.add(id);
    }
  }
  // a tie follows its words
  if (changed.size) {
    for (const [id, n] of Object.entries(nodes)) {
      if (!n.anchor || !changed.has(n.anchor.node)) continue;
      const { out, n: k } = swap(n.anchor.text);
      if (k) nodes[id] = { ...n, anchor: { ...n.anchor, text: out } };
    }
  }
  return { nodes, count };
}
