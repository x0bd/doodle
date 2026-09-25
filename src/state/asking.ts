/**
 * The agent asked from the field (PLAN.md M6.5): about the whole book at
 * its top level, or about what is selected there. It works the way a free
 * ask on a page does — the tools, propose-only — but its answer belongs to
 * the field, not to a page: a draft with the field's own key, shown in the
 * Answers card (`shell/Answers.tsx`), read and put away.
 */
import { graph } from "./graph";
import { ui } from "./ui";
import { bibleText } from "./doc";
import { drafts, stoppable, DOING } from "./drafts";
import { pick } from "../providers/registry";
import { runTool, toolSpecs, fieldBriefing } from "../agent/tools";
import type { TextRequest } from "../providers/types";

/** the key the field's answers are kept under, where a page's are under its id */
export const FIELD = "@field";

let seq = 0;

/** Ask about the book — or about the selection, when there is one. */
export async function askBook(question: string) {
  const q = question.trim();
  if (!q) return;
  const g = graph.get();
  const about = g.selection.filter((id) => g.nodes[id]);
  const id = `f${++seq}`;
  const stop = new AbortController();
  const release = stoppable(id, stop);
  drafts.set((d) => ({ ...d, [id]: { id, nodeId: FIELD, ask: "ask", instruction: q, text: "", state: "thinking", reply: true } }));
  try {
    const { provider } = await pick("text.generate", ui.get().writeWith);
    drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], provider: provider.descriptor.name } } : d));
    const req: TextRequest = {
      prompt: q,
      system: bibleText() && `The book's bible:\n${bibleText()}`,
      tools: true,
      instructions: fieldBriefing(about),
      toolSpecs: toolSpecs(),
      runTool: (name, args) => runTool(name, args, provider.descriptor.name),
      onTool: (name) => drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], doing: DOING[name] ?? name } } : d)),
    };
    const onDelta = (text: string) => drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], text } } : d));
    const text = provider.streamText ? await provider.streamText(req, onDelta, stop.signal) : await provider.generateText!(req, stop.signal);
    drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], text, state: "ready", doing: undefined } } : d));
  } catch (e) {
    if (stop.signal.aborted) drafts.set((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)));
    else drafts.set((d) => (d[id] ? { ...d, [id]: { ...d[id], state: "failed", error: String(e).replace(/^Error: /, ""), doing: undefined } } : d));
  } finally {
    release();
  }
}
