/**
 * Where someone, somewhere or something appears (PLAN.md M5.2) — the
 * chapters and pages whose words name them: by their name, or the names
 * the book calls them by (a person's first name; a thing without its
 * article — "the manifest" is *manifest*), or an `@` mention. Pure.
 */

interface Named {
  id: string;
  kind: string;
  title: string;
  data: Record<string, unknown>;
}
interface Written extends Named {
  status: string;
  seq: number;
  parent: string | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** the names the book may call them by */
export function namesOf(n: Named): string[] {
  const out = new Set<string>();
  for (const raw of [String(n.data.name ?? ""), n.title]) {
    const name = raw.trim();
    if (!name) continue;
    out.add(name);
    const bare = name.replace(/^(the|a|an)\s+/i, "");
    if (bare.length >= 3) out.add(bare);
    // a person is called by their first name
    const first = bare.split(/\s+/)[0];
    if (n.kind === "character" && first !== bare && first.length >= 3) out.add(first);
  }
  return [...out];
}

/** How often each chapter and page names them, in reading order. */
export function appearances(who: Named, written: Written[]): { id: string; title: string; count: number }[] {
  const names = namesOf(who);
  if (!names.length) return [];
  const re = new RegExp(`(?:@${escape(who.title)}|\\b(?:${names.map(escape).join("|")})\\b)`, "gi");
  return written
    .filter((w) => (w.kind === "chapter" || w.kind === "page") && w.status !== "rejected")
    .sort((a, b) => a.seq - b.seq)
    .map((w) => ({ id: w.id, title: w.title, count: (String(w.data.text ?? "").match(re) ?? []).length }))
    .filter((a) => a.count > 0);
}
