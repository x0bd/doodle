/**
 * Jobs: every run of a generator, from queued to done, one at a time. The
 * graph is read to build the request; the result is written back as one
 * journal entry so it can be undone like anything else.
 */
import { createStore } from "./store";
import { graph, layOnPages, type GraphNode } from "./graph";
import { commit } from "./history";
import { pick } from "../providers/registry";
import { doc, bibleText } from "./doc";
import { writeAsset, saveRecord, loadRecord, inTauri, readThumb } from "../platform/fs";
import { ui } from "./ui";
import { expandMentions } from "../canvas/mentions";
import { plain, formOf } from "../writer/markup";
import { FRAMES } from "../graph/kinds";
import { record, inputsOf } from "./prov";
import type { ImageRequest, Picture, Progress, TextRequest } from "../providers/types";

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
  /** what came out, by reference, once it has */
  outputs?: string[];
  /** how many were asked for */
  count?: number;
  /** the words so far, while a writer streams — shown, not yet the document */
  partial?: string;
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

/** what a character or style contributes to a prompt, in words. A writer
 *  reads the words as written — Markdown, Fountain — and an image model
 *  reads them `bare`, the markup read away. */
function describe(n: GraphNode | undefined, bare = false): string {
  const words = (t: string, of: GraphNode) => (bare ? plain(expandMentions(t), formOf(of.data)) : expandMentions(t));
  if (!n || n.status === "rejected") return "";
  const d = n.data;
  if (n.kind === "character" || n.kind === "location") return [d.name, d.description].filter(Boolean).join(": ");
  if (n.kind === "style") return [d.description, d.palette && `palette: ${d.palette}`, d.lighting && `lighting: ${d.lighting}`].filter(Boolean).join(", ");
  if (n.kind === "shot") return [expandMentions(String(d.description ?? "")), `${d.shotSize} shot`, `${d.lensMm}mm`, `${d.movement}`].filter(Boolean).join(", ");
  return words(String(d.text ?? ""), n);
}

/** a style's references that ride with it — four at most */
const STYLE_REFS = 4;

/** The pictures a node is shown with its words: every character and place
 *  that feeds it and has one — through its own ports or given by hand —
 *  and a style's references (M3.7), labelled so the model can tell which
 *  is whom and which is only the look. Rejected ones never. */
function picturesFor(n: GraphNode): Picture[] {
  const g = graph.get();
  const seen = new Set<string>();
  const out: Picture[] = [];
  for (const e of Object.values(g.edges)) {
    if (e.to.node !== n.id) continue;
    const from = g.nodes[e.from.node];
    if (!from || from.status === "rejected" || seen.has(from.id)) continue;
    if (from.kind === "style") {
      seen.add(from.id);
      for (const ref of (from.attachments ?? []).slice(0, STYLE_REFS))
        out.push({ label: `${from.title} (a reference for the style — its palette, light and medium, not what is in it)`, ref });
      continue;
    }
    if (!from.asset || (from.kind !== "character" && from.kind !== "location")) continue;
    seen.add(from.id);
    out.push({ label: `${String(from.data.name || from.title)} (${from.kind === "location" ? "a place" : "a character"})`, ref: from.asset });
  }
  return out;
}

/** what the model is told about the pictures, so it knows which is whom */
const captions = (pics: Picture[]) =>
  pics.length ? `Pictures attached, in order: ${pics.map((p, i) => `${i + 1}. ${p.label}`).join("; ")}. Use them for how these look.` : "";

/** A request's pictures, found at run time: the file where there is one,
 *  and a 1024 copy of the bytes for a provider that takes them inline. */
async function see(pics: Picture[] | undefined): Promise<Picture[] | undefined> {
  if (!pics?.length) return undefined;
  const dir = doc.get().path;
  const out = await Promise.all(
    pics.map(async (p): Promise<Picture | null> => {
      try {
        if (p.ref.startsWith("assets/")) {
          if (!dir) return null;
          return { ...p, path: `${dir}/${p.ref}`, data: await readThumb(dir, p.ref, 1024) };
        }
        if (p.ref.startsWith("data:")) return { ...p, data: p.ref };
        const blob = await fetch(p.ref).then((r) => r.blob());
        const data = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        return { ...p, data };
      } catch {
        return null;
      }
    }),
  );
  const found = out.filter((p): p is Picture => !!p);
  return found.length ? found : undefined;
}

/** everything given to a node by hand, in the order it was given */
function given(n: GraphNode, bare = false): string[] {
  return (n.extras ?? []).map((p) => describe(fed(n, p.id), bare)).filter(Boolean);
}

/** The prompt compiler, in its smallest form: the scene, then who is in
 *  it, then how it looks — and then whatever else it was given. */
export function requestFor(gen: GraphNode): ImageRequest {
  const model = fed(gen, "model");
  const pos = fed(gen, "positive");
  const neg = fed(gen, "negative");
  const d = gen.data;
  const seed = d.control === "Random" ? Math.floor(Math.random() * 1_000_000) : Number(d.seed);
  const images = picturesFor(gen);
  const prompt = [describe(pos, true), describe(fed(gen, "character"), true), describe(fed(gen, "style"), true), ...given(gen, true), bibleText().replace(/\n/g, ". "), captions(images)].filter(Boolean).join(". ");
  return {
    prompt,
    images: images.length ? images : undefined,
    negative: neg ? plain(String(neg.data.text ?? ""), formOf(neg.data)) : "",
    model: String(model?.data.model ?? "Mock"),
    seed,
    steps: Number(d.steps),
    strength: Number(d.strength),
    sampler: String(d.sampler),
    // a frame if it has one; a graph from before frames keeps its numbers
    width: FRAMES[String(d.frame)]?.[0] ?? Number(d.width ?? 1024),
    height: FRAMES[String(d.frame)]?.[1] ?? Number(d.height ?? 1024),
  };
}

/** An output goes into the graph's folder when it has one; a data URL
 *  stays in memory (and in the file) until then. */
async function keep(asset: string): Promise<string> {
  const dir = doc.get().path;
  if (!dir || !asset.startsWith("data:")) return asset;
  try {
    return (await writeAsset(dir, asset)).rel;
  } catch {
    return asset;
  }
}

export function textRequestFor(w: GraphNode): TextRequest {
  const brief = fed(w, "brief");
  const images = picturesFor(w);
  const system = [bibleText(), describe(fed(w, "character")), describe(fed(w, "style")), ...given(w), `Length: ${w.data.length}`, captions(images)].filter(Boolean).join("\n");
  return { prompt: String(brief?.data.text ?? ""), system, model: String(w.data.model), images: images.length ? images : undefined };
}

/** the words a running writer has so far for this page, if any */
export function partialFor(s: JobsState, pageId: string): string | undefined {
  const g = graph.get();
  for (const jid of s.order) {
    const j = s.jobs[jid];
    if (j.state !== "running" || j.kind !== "text" || !j.partial) continue;
    if (Object.values(g.edges).some((e) => e.from.node === j.nodeId && e.from.port === "text" && e.to.node === pageId)) return j.partial;
  }
  return undefined;
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
          : { id, nodeId: gen.id, state: "queued", progress: 0, queuedAt: Date.now(), kind: "image", request: requestFor(gen), count: Math.max(1, Number(gen.data.count) || 1) };
      next.order.push(id);
    }
    return next;
  });
  void pump();
}

/** Run the same node again. */
export const retry = (jobId: string) => {
  const j = jobs.get().jobs[jobId];
  if (j) enqueue([j.nodeId]);
};

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
      const asked = job.request as TextRequest;
      const req = { ...asked, images: await see(asked.images) };
      const { provider, fellBack } = await pick("text.generate", ui.get().writeWith);
      patch(id, { note: fellBack ? "mock instead" : provider.descriptor.name.toLowerCase(), provider: provider.descriptor.id });
      // the words as they come, shown on the page they are for; the document
      // takes them only at the end, as one journal entry
      const onDelta = (partial: string) => patch(id, { partial });
      const text = provider.streamText ? await provider.streamText(req, onDelta, ctl.signal) : await provider.generateText!(req, ctl.signal);
      if (ctl.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      patch(id, { partial: undefined });
      // the words land on the writer and flow into whatever its text feeds —
      // a page takes what it can hold and turns the rest onto the pages after
      // where these words came from, kept with the document
      record({
        key: id,
        kind: "text",
        provider: provider.descriptor.name,
        model: req.model,
        at: Date.now(),
        prompt: req.prompt,
        system: req.system,
        pictures: req.images?.map((p) => p.label),
        inputs: inputsOf(gen.id),
        rules: bibleText() || undefined,
        job: id,
      });
      commit("Write", () => {
        const g = graph.get();
        const targets = Object.values(g.edges)
          .filter((e) => e.from.node === gen.id && e.from.port === "text")
          .map((e) => e.to.node);
        graph.set((x) => ({ ...x, nodes: { ...x.nodes, [gen.id]: { ...x.nodes[gen.id], data: { ...x.nodes[gen.id].data, output: text }, from: id } } }));
        for (const t of targets) {
          const n = graph.get().nodes[t];
          if (!n) continue;
          if (n.kind === "page") layOnPages(t, text, id);
          // a chapter is added to, never written over: the words come after its own
          else if (n.kind === "chapter") {
            const had = String(n.data.text ?? "").trim();
            graph.set((x) => ({ ...x, nodes: { ...x.nodes, [t]: { ...x.nodes[t], data: { ...x.nodes[t].data, text: had ? `${had}\n\n${text.trim()}` : text }, from: id } } }));
          } else graph.set((x) => ({ ...x, nodes: { ...x.nodes, [t]: { ...x.nodes[t], data: { ...x.nodes[t].data, text }, from: id } } }));
        }
      });
    } else {
      const asked = job.request as ImageRequest;
      const base = { ...asked, images: await see(asked.images) };
      const { provider, fellBack } = await pick("image.generate", ui.get().drawWith);
      patch(id, { provider: provider.descriptor.id, note: fellBack ? "mock instead" : undefined });
      const count = job.count ?? 1;
      const outputs: string[] = [];
      let lastSeed = base.seed;
      for (let i = 0; i < count; i++) {
        // every candidate after the first takes the next seed along
        const req = { ...base, seed: i === 0 ? base.seed : base.seed + i };
        const result = await provider.generateImage!(
          req,
          (p) => onProgress({ fraction: (i + p.fraction) / count, note: count > 1 ? `${i + 1}/${count} · ${p.note ?? ""}` : p.note }),
          ctl.signal,
        );
        if (ctl.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const ref = await keep(result.asset);
        outputs.push(ref);
        record({
          key: ref,
          kind: "image",
          provider: provider.descriptor.name,
          model: String(fed(gen, "model")?.data.model ?? "default"),
          at: Date.now(),
          prompt: req.prompt,
          system: req.negative || undefined,
          seed: result.seed,
          pictures: req.images?.map((p) => p.label),
          inputs: inputsOf(gen.id),
          rules: bibleText() || undefined,
          job: id,
        });
        lastSeed = result.seed;
      }
      patch(id, { outputs });
      // the outputs land on the generator; the first is the take and flows on
      commit("Generate", () => {
        const g = graph.get();
        const targets = Object.values(g.edges)
          .filter((e) => e.from.node === gen.id && e.from.port === "image")
          .map((e) => e.to.node);
        graph.set((x) => {
          const me = x.nodes[gen.id];
          const data = me.data.control === "Random" ? { ...me.data, seed: lastSeed } : me.data;
          const all = [...(me.outputs ?? []), ...outputs].slice(-12);
          const take = outputs[0];
          const nodes = { ...x.nodes, [gen.id]: { ...me, data, asset: take, outputs: all } };
          for (const t of targets) if (nodes[t]) nodes[t] = { ...nodes[t], asset: take };
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

/* ── on disk ── */
// Runs are kept beside the graph (jobs.json), written a moment after they
// change. On open they come back; anything that was queued or running when
// the app closed is marked cancelled — a mock or a CLI cannot be resumed —
// so the record is always true.
let writeTimer: number | undefined;
jobs.subscribe(() => {
  const dir = doc.get().path;
  if (!dir || !inTauri) return;
  clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    const s = jobs.get();
    const keep = s.order.slice(-100);
    const file = { format: "doodle-jobs", version: 1, iterations: s.iterations, order: keep, jobs: Object.fromEntries(keep.map((id) => [id, s.jobs[id]])) };
    saveRecord(dir, "jobs", JSON.stringify(file)).catch(() => undefined);
  }, 800);
});

export async function restoreJobs(dir: string) {
  if (!inTauri) return;
  try {
    const raw = await loadRecord(dir, "jobs");
    if (!raw) {
      jobs.set({ jobs: {}, order: [], iterations: 0 });
      return;
    }
    const file = JSON.parse(raw) as { order: string[]; jobs: Record<string, Job>; iterations: number };
    const restored: Record<string, Job> = {};
    for (const id of file.order) {
      const j = file.jobs[id];
      if (!j) continue;
      restored[id] = j.state === "queued" || j.state === "running" ? { ...j, state: "cancelled", endedAt: j.endedAt ?? Date.now(), note: "closed mid-run" } : j;
      const n = Number(id.slice(1));
      if (n > seq) seq = n;
    }
    jobs.set({ jobs: restored, order: file.order.filter((id) => restored[id]), iterations: file.iterations ?? 0 });
  } catch {
    jobs.set({ jobs: {}, order: [], iterations: 0 });
  }
}

export const forgetJobs = () => jobs.set({ jobs: {}, order: [], iterations: 0 });
