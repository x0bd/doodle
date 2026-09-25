/**
 * The continuity check (PLAN.md M6.3): a chapter read against what the
 * book has already fixed — its bible, its characters and places, and the
 * chapters before it — and what does not agree proposed as comments in the
 * margin, each on the chapter's own words, with what it contradicts and
 * where, and the smallest fix. Nothing in the chapter changes.
 *
 * The chapters before go in whole while they fit the writer's window;
 * past that, each by its gist, and the passages of them nearest in meaning
 * to each part of this chapter (`meaning.ts`) — so a 120k-word book is
 * checked in one reading, not forty.
 */
import { graph, childrenOf, type GraphNode } from "./graph";
import { doc } from "./doc";
import { ui } from "./ui";
import { drafts, stoppable } from "./drafts";
import { offer } from "./ideas";
import { gistOf } from "./gists";
import { searchMeaning } from "./meaning";
import { cut } from "./passages";
import { CHECK_SYSTEM, CHECK_SCHEMA, material, parseFindings, type Finding, type Source } from "./checks";
import { pick } from "../providers/registry";
import { plain, formOf } from "../writer/markup";
import { log, since } from "../platform/log";

/** the words of the chapters before, whole, up to this many; past it, gists and the nearest passages */
const WHOLE = 16_000;

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const live = (n: GraphNode) => n.status !== "rejected";

/** the chapters at a chapter's level that come before it, in reading order */
function before(ch: GraphNode): GraphNode[] {
  const g = graph.get();
  return childrenOf(g, ch.parent)
    .map((id) => g.nodes[id])
    .filter((n) => n.kind === "chapter" && live(n) && n.seq < ch.seq)
    .sort((a, b) => a.seq - b.seq);
}

/** What a chapter is checked against: the bible, the cast and places, the chapters before. */
async function sourcesFor(ch: GraphNode, tell: (t: string) => void, signal: AbortSignal): Promise<{ sources: Source[]; notes: string[]; said: string }> {
  const g = graph.get();
  const sources: Source[] = [];
  const b = doc.get().bible;
  const bible = [b.tone && `Tone: ${b.tone}`, b.rules && `Rules of the world: ${b.rules}`, b.avoid && `Avoid: ${b.avoid}`].filter(Boolean).join("\n");
  if (bible) sources.push({ name: "The bible", text: bible });
  const known = Object.values(g.nodes).filter((n) => (n.kind === "character" || n.kind === "location") && live(n));
  for (const n of known) {
    const text = [n.data.name && n.data.name !== n.title ? `Name: ${n.data.name}` : "", String(n.data.description ?? ""), String(n.data.text ?? "")].filter((x) => String(x).trim()).join("\n");
    if (text.trim()) sources.push({ name: n.title, text });
  }
  const earlier = before(ch);
  const all = earlier.reduce((a, n) => a + words(String(n.data.text ?? "")), 0);
  const notes: string[] = [];
  if (all <= WHOLE) {
    for (const n of earlier) if (String(n.data.text ?? "").trim()) sources.push({ name: n.title, text: plain(String(n.data.text), formOf(n.data)) });
  } else {
    // too long to read whole: what happens in each, and what of them bears on this chapter
    const gists = earlier.map((n) => `- ${n.title}: ${gistOf(n) ?? (String(n.data.summary ?? "").trim() || "(not summarised yet)")}`).join("\n");
    notes.push(`<outline of the chapters before>\n${gists}\n</outline>`);
    const ids = new Set(earlier.map((n) => n.id));
    const near = new Map<string, { node: GraphNode; texts: Set<string> }>();
    const parts = cut(String(ch.data.text ?? ""));
    for (const [i, p] of parts.entries()) {
      signal.throwIfAborted();
      tell(`Finding what the chapters before say about it: ${i + 1} of ${parts.length}…`);
      const found = await searchMeaning(p.text, { count: 3, each: 2, only: (n) => ids.has(n.id), signal });
      if (!found) break;
      for (const f of found) {
        const at = near.get(f.node.id) ?? { node: f.node, texts: new Set() };
        at.texts.add(f.text);
        near.set(f.node.id, at);
      }
    }
    for (const { node, texts } of [...near.values()].sort((a, b) => a.node.seq - b.node.seq)) sources.push({ name: node.title, text: [...texts].join("\n\n…\n\n") });
  }
  const said = [bible && "the bible", known.length && `${known.length} character${known.length === 1 ? "" : "s"} and places`, earlier.length && `${earlier.length} chapter${earlier.length === 1 ? "" : "s"} before${all > WHOLE ? " (by gist and the passages nearest)" : ""}`].filter(Boolean).join(", ");
  return { sources, notes, said };
}

/** a finding, as the comment in the margin says it */
const remark = (f: Finding) => `${f.problem}${f.fix ? ` ${f.fix}` : ""}`.trim();
const ground = (f: Finding) => (f.says ? `${f.source} says: “${f.says}”${f.sourced ? "" : " (not found there word for word)"}` : f.source);

/**
 * Check a chapter (or a page) — the work shown as a draft on it, as a free
 * ask is; what was found proposed as comments. Returns the findings.
 */
export async function checkContinuity(id: string, outer?: AbortSignal): Promise<Finding[]> {
  const ch = graph.get().nodes[id];
  if (!ch) return [];
  const draft = `c${Date.now().toString(36)}`;
  const stop = new AbortController();
  outer?.addEventListener("abort", () => stop.abort());
  const release = stoppable(draft, stop);
  const tell = (doing: string) => drafts.set((d) => (d[draft] ? { ...d, [draft]: { ...d[draft], doing } } : d));
  drafts.set((d) => ({ ...d, [draft]: { id: draft, nodeId: id, ask: "ask", instruction: "Check continuity", text: "", state: "thinking", reply: true, doing: "gathering what the book has fixed" } }));
  const t0 = performance.now();
  try {
    const { provider } = await pick("text.generate", ui.get().writeWith);
    drafts.set((d) => (d[draft] ? { ...d, [draft]: { ...d[draft], provider: provider.descriptor.name } } : d));
    const { sources, notes, said } = await sourcesFor(ch, tell, stop.signal);
    const text = plain(String(ch.data.text ?? ""), formOf(ch.data));
    if (!text.trim()) throw new Error("There are no words here to check.");
    if (!sources.length) throw new Error("Nothing to check it against yet — no bible, no characters or places, no chapter before it.");
    tell(`reading it against ${said}`);
    const prompt = material({ title: ch.title, text }, sources, notes);
    const answer = await provider.generateText!({ prompt, system: CHECK_SYSTEM, schema: CHECK_SCHEMA, think: false, context: Math.min(65536, Math.max(8192, Math.ceil(words(prompt) * 1.5) + 2048)) }, stop.signal);
    const found = parseFindings(answer, text, sources);
    offer(id, found.map((f) => ({ kind: "comment", title: f.problem.split(/(?<=[.?!])\s/)[0].slice(0, 80), text: remark(f), quote: f.quote, why: ground(f) })), `the continuity check (${provider.descriptor.name})`);
    const reply = found.length
      ? `Checked against ${said}. ${found.length === 1 ? "One thing does" : `${found.length} things do`} not agree — proposed as comments on the words, below.`
      : `Checked against ${said}. Nothing in it contradicts them.`;
    log("continuity", `"${ch.title}": ${sources.length} sources, ${found.length} findings, ${since(t0)} ms`);
    drafts.set((d) => (d[draft] ? { ...d, [draft]: { ...d[draft], text: reply, state: "ready", doing: undefined } } : d));
    return found;
  } catch (e) {
    if (stop.signal.aborted) drafts.set((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== draft)));
    else drafts.set((d) => (d[draft] ? { ...d, [draft]: { ...d[draft], state: "failed", error: String(e).replace(/^Error: /, ""), doing: undefined } } : d));
    return [];
  } finally {
    release();
  }
}
