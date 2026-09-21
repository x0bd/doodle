/**
 * Jobs: every run of a generator, from queued to done, one at a time. The
 * graph is read to build the request; the result is written back as one
 * journal entry so it can be undone like anything else.
 */
import { createStore } from "./store";
import { graph, type GraphNode } from "./graph";
import { commit } from "./history";
import { providerFor, pick } from "../providers/registry";
import type { ImageRequest, Progress, TextRequest } from "../providers/types";

export type JobState = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  nodeId: string;
  state: JobState;
  progress: number;
  note?: string;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  request: ImageRequest | TextRequest;
  kind: "image" | "text";
  /** who answered, once someone has */
  provider?: string;
}

export interface JobsState {
  jobs: Record<string, Job>;
  order: string[];
  /** completed runs this session — the I readout */
  iterations: number;
}

export const jobs = createStore<JobsState>({ jobs: {}, order: [], iterations: 0 });

let seq = 0;
const controllers = new Map<string, AbortController>();

const patch = (id: string, p: Partial<Job>) =>
  jobs.set((s) => (s.jobs[id] ? { ...s, jobs: { ...s.jobs, [id]: { ...s.jobs[id], ...p } } } : s));

/* ── reading the graph ── */

/** the node wired into this input, if any */
function fed(node: GraphNode, port: string): GraphNode | undefined {
  const g = graph.get();
  const e = Object.values(g.edges).find((e) => e.to.node === node.id && e.to.port === port);
  return e ? g.nodes[e.from.node] : undefined;
}

/** what a character or style contributes to a prompt, in words */
function describe(n: GraphNode | undefined): string {
  if (!n) return "";
  const d = n.data;
  if (n.kind === "character") return [d.name, d.description].filter(Boolean).join(": ");
  if (n.kind === "style") return [d.description, d.palette && `palette: ${d.palette}`, d.lighting && `lighting: ${d.lighting}`].filter(Boolean).join(", ");
  return String(d.text ?? "");
}

/** The prompt compiler, in its smallest form: the scene, then who is in
 *  it, then how it looks. */
export function requestFor(gen: GraphNode): ImageRequest {
  const model = fed(gen, "model");
  const pos = fed(gen, "positive");
  const neg = fed(gen, "negative");
  const d = gen.data;
  const seed = d.control === "Random" ? Math.floor(Math.random() * 1_000_000) : Number(d.seed);
  const prompt = [String(pos?.data.text ?? ""), describe(fed(gen, "character")), describe(fed(gen, "style"))].filter(Boolean).join(". ");
  return {
    prompt,
    negative: String(neg?.data.text ?? ""),
    model: String(model?.data.model ?? "Mock"),
    seed,
    steps: Number(d.steps),
    strength: Number(d.strength),
    sampler: String(d.sampler),
    width: Number(d.width),
    height: Number(d.height),
  };
}

export function textRequestFor(w: GraphNode): TextRequest {
  const brief = fed(w, "brief");
  const system = [describe(fed(w, "character")), describe(fed(w, "style")), `Length: ${w.data.length}`].filter(Boolean).join("\n");
  return { prompt: String(brief?.data.text ?? ""), system, model: String(w.data.model) };
}

export const RUNNABLE = new Set(["generate", "write"]);
/** every generator and writer, in wire order from the left */
export const generators = () => {
  const g = graph.get();
  return g.order.map((id) => g.nodes[id]).filter((n) => RUNNABLE.has(n.kind)).sort((a, b) => a.x - b.x);
};
/** the text input a runnable node is mostly about */
export const mainPort = (n: GraphNode) => (n.kind === "write" ? "brief" : "positive");

/* ── the queue ── */

export function enqueue(nodeIds?: string[]) {
  const gens = nodeIds ? nodeIds.map((id) => graph.get().nodes[id]).filter((n) => n && RUNNABLE.has(n.kind)) : generators();
  if (!gens.length) return;
  jobs.set((s) => {
    const next = { ...s, jobs: { ...s.jobs }, order: [...s.order] };
    for (const gen of gens) {
      const id = `j${++seq}`;
      next.jobs[id] =
        gen.kind === "write"
          ? { id, nodeId: gen.id, state: "queued", progress: 0, queuedAt: Date.now(), kind: "text", request: textRequestFor(gen) }
          : { id, nodeId: gen.id, state: "queued", progress: 0, queuedAt: Date.now(), kind: "image", request: requestFor(gen) };
      next.order.push(id);
    }
    return next;
  });
  void pump();
}

export const pending = (s: JobsState) => s.order.filter((id) => s.jobs[id].state === "queued" || s.jobs[id].state === "running");
export const current = (s: JobsState) => s.order.map((id) => s.jobs[id]).find((j) => j.state === "running");
export const latest = (s: JobsState) => (s.order.length ? s.jobs[s.order[s.order.length - 1]] : undefined);
export const jobFor = (s: JobsState, nodeId: string) =>
  [...s.order].reverse().map((id) => s.jobs[id]).find((j) => j.nodeId === nodeId);

/** Cancel what is running and drop what is waiting. */
export function clearQueue() {
  for (const c of controllers.values()) c.abort();
  jobs.set((s) => {
    const next = { ...s, jobs: { ...s.jobs } };
    for (const id of s.order) {
      const j = next.jobs[id];
      if (j.state === "queued") next.jobs[id] = { ...j, state: "cancelled", endedAt: Date.now() };
    }
    return next;
  });
}

let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const s = jobs.get();
      const id = s.order.find((id) => s.jobs[id].state === "queued");
      if (!id) break;
      await run(id);
    }
  } finally {
    pumping = false;
  }
}

async function run(id: string) {
  const job = jobs.get().jobs[id];
  const gen = graph.get().nodes[job.nodeId];
  if (!gen) {
    patch(id, { state: "failed", error: "The node is gone", endedAt: Date.now() });
    return;
  }
  const ctl = new AbortController();
  controllers.set(id, ctl);
  patch(id, { state: "running", startedAt: Date.now(), progress: 0 });
  try {
    const onProgress = (p: Progress) => patch(id, { progress: p.fraction, note: p.note });
    if (job.kind === "text") {
      const req = job.request as TextRequest;
      const { provider, fellBack } = await pick("text.generate", req.model);
      patch(id, { note: fellBack ? "mock instead" : provider.descriptor.name.toLowerCase(), provider: provider.descriptor.id });
      const text = await provider.generateText!(req, ctl.signal);
      if (ctl.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      // the words land on the writer and flow into whatever its text feeds
      commit("Write", () => {
        const g = graph.get();
        const targets = Object.values(g.edges)
          .filter((e) => e.from.node === gen.id && e.from.port === "text")
          .map((e) => e.to.node);
        graph.set((x) => {
          const nodes = { ...x.nodes, [gen.id]: { ...x.nodes[gen.id], data: { ...x.nodes[gen.id].data, output: text } } };
          for (const t of targets) if (nodes[t]) nodes[t] = { ...nodes[t], data: { ...nodes[t].data, text } };
          return { ...x, nodes };
        });
      });
    } else {
      const provider = providerFor("image.generate");
      const result = await provider.generateImage!(job.request as ImageRequest, onProgress, ctl.signal);
      if (ctl.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      // the result lands on the generator and flows into whatever its image feeds
      commit("Generate", () => {
        const g = graph.get();
        const targets = Object.values(g.edges)
          .filter((e) => e.from.node === gen.id && e.from.port === "image")
          .map((e) => e.to.node);
        graph.set((x) => {
          const me = x.nodes[gen.id];
          const data = me.data.control === "Random" ? { ...me.data, seed: result.seed } : me.data;
          const nodes = { ...x.nodes, [gen.id]: { ...me, data, asset: result.asset } };
          for (const t of targets) if (nodes[t]) nodes[t] = { ...nodes[t], asset: result.asset };
          return { ...x, nodes };
        });
      });
    }
    patch(id, { state: "completed", progress: 1, endedAt: Date.now() });
    jobs.set((s) => ({ ...s, iterations: s.iterations + 1 }));
  } catch (e) {
    const cancelled = e instanceof DOMException && e.name === "AbortError";
    patch(id, { state: cancelled ? "cancelled" : "failed", error: cancelled ? undefined : String(e), endedAt: Date.now() });
  } finally {
    controllers.delete(id);
  }
}
