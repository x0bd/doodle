/**
 * The diagnostics report's counting (`diagnostics.ts`), kept apart so it
 * can be tested alone: what is open **by size only** — never a title, a
 * word of the writing, a name or a picture's reference.
 */
import type { GraphState } from "./graph";

/** What is open, counted. */
export function report(g: Pick<GraphState, "nodes" | "order">, extra: { saved: boolean; versions: number; providers: Record<string, string>; theme: string }): string {
  const kinds: Record<string, number> = {};
  let words = 0;
  const pictures = new Set<string>();
  for (const n of Object.values(g.nodes)) {
    kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
    if (typeof n.data.text === "string") words += n.data.text.split(/\s+/).filter(Boolean).length;
    for (const r of [n.asset, ...(n.outputs ?? []), ...(n.attachments ?? [])]) if (r) pictures.add(r);
  }
  const byKind = Object.entries(kinds)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  return [
    `project: ${g.order.length} cards (${byKind || "none"}), ~${words} words, ${pictures.size} pictures, ${extra.versions} versions, ${extra.saved ? "saved in a project" : "never saved"}`,
    `providers: ${Object.entries(extra.providers)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")}`,
    `appearance: ${extra.theme}`,
  ].join("\n");
}

