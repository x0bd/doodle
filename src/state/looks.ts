/**
 * How someone looks, made (the studio, 2026-09-25; PLAN.md M5.1): a
 * character's picture from their description, through a recipe that is a
 * real piece of the graph inside them — a prompt (the shot, and whatever
 * the writer adds to refine it) wired into a generator, with the character
 * itself wired in as *character* so their appearance always rides along, as
 * written, never copied. Enter the generator for its seed, steps and frame.
 *
 * Two shots: the **portrait** (the face — the default) and the **sheet**
 * (the whole figure, front, three-quarter, side and back, on one picture).
 * Four candidates a run; one chosen is their face, or their sheet. Once
 * there is a face, it rides into every run after as the reference, so the
 * takes stay one person. References: pictures from anywhere in the
 * project, a board as a moodboard, or anything named with @ in the recipe.
 */
import { graph, childrenOf, makeNode, type GraphNode } from "./graph";
import { commit } from "./history";
import { enqueue } from "./jobs";
import { giveLook } from "./remix";
import { refsOf, same, picturesOfNode, type Ref } from "./refs";
export { refsOf, picturesOfNode, type Ref };

export type Shot = "portrait" | "sheet";

interface ShotDef {
  word: string;
  note: string;
  frame: string;
  /** what the recipe says, until the writer says otherwise */
  line: (name: string) => string;
}

export const SHOTS: Record<Shot, ShotDef> = {
  portrait: {
    word: "Portrait",
    note: "The face — head and shoulders",
    frame: "4:5",
    line: (name) => `A portrait of ${name}: head and shoulders, a three-quarter view, a plain background, soft even light.`,
  },
  sheet: {
    word: "Character sheet",
    note: "The whole figure, from every side, on one sheet",
    frame: "16:9",
    line: (name) => `A character sheet of ${name}: the whole figure, head to toe, seen from the front, three-quarter, side and back, side by side on one sheet — the same person in every view — a plain light background.`,
  },
};

/** how many candidates a run makes */
export const TAKES = 4;

/** the kinds that have a look to make (the character first; places and things follow) */
export const LOOKED = new Set(["character"]);

const nameOf = (n: GraphNode) => String(n.data.name || n.title).trim() || "them";

export interface Recipe {
  prompt: GraphNode;
  gen: GraphNode;
}

/** the recipe for a shot, if it has been made */
export function recipeOf(g: { nodes: Record<string, GraphNode>; order: string[] }, id: string, shot: Shot): Recipe | undefined {
  const kids = childrenOf(g as never, id).map((k) => g.nodes[k]);
  const gen = kids.find((k) => k.kind === "generate" && k.data.looks === shot);
  const prompt = gen && g.nodes[String(gen.data.recipe)];
  return gen && prompt ? { prompt, gen } : undefined;
}

/** Make a shot's recipe inside the node: the prompt, the generator, the wires. One journal entry. */
export function makeRecipe(id: string, shot: Shot): Recipe | undefined {
  const g = graph.get();
  const n = g.nodes[id];
  if (!n) return undefined;
  const have = recipeOf(g, id, shot);
  if (have) return have;
  const def = SHOTS[shot];
  const col = shot === "portrait" ? 0 : 1;
  const prompt = makeNode("prompt", 60 + col * 380, 420, { parent: id, title: `${def.word} recipe`, data: { text: def.line(nameOf(n)), recipe: shot } });
  const gen = makeNode("generate", 60 + col * 380, 640, {
    parent: id,
    title: def.word,
    data: { seed: Math.floor(Math.random() * 1_000_000), control: "Random", steps: 30, strength: 8, sampler: "dpm++ 2M", frame: def.frame, count: TAKES, looks: shot, recipe: prompt.id, of: id, refs: "[]" },
  });
  const edges = [
    { id: `e${prompt.id}p`, from: { node: prompt.id, port: "text" }, to: { node: gen.id, port: "positive" } },
    // the character itself: their appearance, as written, and their face once they have one
    { id: `e${gen.id}c`, from: { node: id, port: "text" }, to: { node: gen.id, port: "character" } },
  ];
  commit(`${def.word} recipe`, () =>
    graph.set((x) => ({
      ...x,
      nodes: { ...x.nodes, [prompt.id]: prompt, [gen.id]: gen },
      order: [...x.order, prompt.id, gen.id],
      edges: { ...x.edges, ...Object.fromEntries(edges.map((e) => [e.id, e])) },
    })),
  );
  return { prompt, gen };
}

/** whether the recipe still says only what the shot says by itself */
export const untouched = (n: GraphNode, r: Recipe, shot: Shot) => String(r.prompt.data.text).trim() === SHOTS[shot].line(nameOf(n));

/** Run a shot: four candidates. */
export function generateLook(id: string, shot: Shot) {
  const r = makeRecipe(id, shot);
  if (!r) return;
  const n = graph.get().nodes[id];
  // a renamed character: the untouched recipe follows the name
  if (n && !String(r.prompt.data.text).includes(nameOf(n)) && /^A (portrait|character sheet) of /.test(String(r.prompt.data.text)))
    graph.set((x) => ({ ...x, nodes: { ...x.nodes, [r.prompt.id]: { ...r.prompt, data: { ...r.prompt.data, text: SHOTS[shot].line(nameOf(n)) } } } }));
  enqueue([r.gen.id]);
}

/** A take chosen: the portrait's is their face; the sheet's, their sheet. */
export function chooseLook(id: string, shot: Shot, take: string) {
  if (shot === "portrait") return giveLook(id, take);
  commit("Character sheet", () =>
    graph.set((x) => {
      const n = x.nodes[id];
      if (!n) return x;
      return { ...x, nodes: { ...x.nodes, [id]: { ...n, data: { ...n.data, sheet: take }, attachments: [...new Set([...(n.attachments ?? []), take])] } } };
    }),
  );
}

/* ── references ── */

export function addRefs(genId: string, add: Ref[]) {
  const gen = graph.get().nodes[genId];
  if (!gen || !add.length) return;
  const next = [...refsOf(gen)];
  for (const r of add) if (!next.some((x) => same(x, r))) next.push(r);
  commit("Reference", () => graph.set((x) => ({ ...x, nodes: { ...x.nodes, [genId]: { ...x.nodes[genId], data: { ...x.nodes[genId].data, refs: JSON.stringify(next) } } } })));
}

export function removeRef(genId: string, ref: Ref) {
  const gen = graph.get().nodes[genId];
  if (!gen) return;
  const next = refsOf(gen).filter((x) => !same(x, ref));
  commit("Reference", () => graph.set((x) => ({ ...x, nodes: { ...x.nodes, [genId]: { ...x.nodes[genId], data: { ...x.nodes[genId].data, refs: JSON.stringify(next) } } } })));
}

/** every picture in the project that could be a reference, by where it is */
export function referenceable(g: { nodes: Record<string, GraphNode>; order: string[] }, except?: string) {
  const all = g.order.map((id) => g.nodes[id]).filter((n) => n && n.status !== "rejected" && n.id !== except);
  const boards = all.filter((n) => n.kind === "board" && picturesOfNode(n, g).length);
  const people = all.filter((n) => ["character", "location", "object"].includes(n.kind) && n.asset);
  const styles = all.filter((n) => n.kind === "style" && (n.attachments ?? []).length);
  const clips = all.filter((n) => n.kind === "clip" && n.data.what === "picture" && n.asset);
  const takes = all.filter((n) => n.kind === "generate" && (n.outputs ?? []).length && n.data.of !== except).flatMap((n) => (n.outputs ?? []).map((o) => ({ from: n, picture: o })));
  const media = all.filter((n) => (n.attachments ?? []).length && !["style", "character", "location", "object"].includes(n.kind)).flatMap((n) => (n.attachments ?? []).map((a) => ({ from: n, picture: a })));
  return { boards, people, styles, clips, takes, media };
}
