/**
 * A place read in order: the chapters under it and their pages, loose
 * pages where they fall. One answer for the reading view and for what
 * leaves the app, so what you read is what you export.
 */
import { childrenOf, type GraphNode, type GraphState } from "./graph";

export interface Section {
  chapter?: GraphNode;
  pages: GraphNode[];
}

/** the sections under a place, in the document's order */
export function sections(g: GraphState, id: string | null): Section[] {
  const kids = childrenOf(g, id)
    .map((c) => g.nodes[c])
    .filter((n) => n.status !== "rejected")
    .sort((a, b) => a.seq - b.seq);
  const out: Section[] = [];
  let loose: GraphNode[] = [];
  const flush = () => {
    if (loose.length) out.push({ pages: loose });
    loose = [];
  };
  for (const n of kids) {
    if (n.kind === "page") loose.push(n);
    else if (n.kind === "chapter") {
      flush();
      out.push({
        chapter: n,
        pages: childrenOf(g, n.id)
          .map((c) => g.nodes[c])
          .filter((p) => p.kind === "page" && p.status !== "rejected")
          .sort((a, b) => a.seq - b.seq),
      });
    }
  }
  flush();
  return out;
}

export const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** every page under a place, in reading order */
export const pagesOf = (g: GraphState, id: string | null) => sections(g, id).flatMap((s) => s.pages);

/** The place as Markdown: the title, each chapter a heading, its pages
 *  run on in order with a blank line between them. Empty pages are left
 *  out — an export is what was written, not what was laid out. */
export function asMarkdown(g: GraphState, id: string | null, name: string): string {
  const node = id ? g.nodes[id] : undefined;
  const lines: string[] = [`# ${node?.title ?? name}`];
  const line = String(node?.data.summary ?? "").trim();
  if (line) lines.push(`*${line}*`);
  for (const sec of sections(g, id)) {
    const words = sec.pages.map((p) => String(p.data.text ?? "").trim()).filter(Boolean);
    if (sec.chapter) {
      lines.push(`## ${sec.chapter.title}`);
      const sum = String(sec.chapter.data.summary ?? "").trim();
      if (sum) lines.push(`*${sum}*`);
    }
    for (const w of words) lines.push(w);
  }
  return `${lines.join("\n\n")}\n`;
}
