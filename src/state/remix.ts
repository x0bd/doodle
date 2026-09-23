/**
 * Starting again from something made — the two gestures Visual Electric
 * got right, in a graph's terms.
 *
 *  - **Remix**: any image that was generated can be the start of a branch.
 *    A new generator appears under the one that made it, fed by the same
 *    things, with the same settings and that image's seed held, its first
 *    take the image itself — so a slider moved there is a variation of
 *    exactly this, and the original goes on untouched.
 *  - **Set it on the field**: a take pulled out of a bloom becomes a card
 *    of its own where it is dropped, to be laid beside the others and
 *    compared, the way a set of four is spread across a table. Its record
 *    of where it came from goes with it.
 */
import { graph, makeNode, newId, type GraphNode } from "./graph";
import { commit } from "./history";
import { provFor } from "./prov";

/** the generator a take came out of, if it is still here */
export function makerOf(ref: string): GraphNode | undefined {
  return Object.values(graph.get().nodes).find((n) => n.kind === "generate" && (n.outputs ?? []).includes(ref));
}

/** can this be remixed: it came out of a generator that is still here */
export const remixable = (ref: string | undefined) => !!ref && !!makerOf(ref);

export function remix(ref: string): string | undefined {
  const gen = makerOf(ref);
  if (!gen) return;
  const g = graph.get();
  const p = provFor(ref);
  const seed = p?.seed ?? Number(gen.data.seed);
  const made: GraphNode = {
    ...makeNode("generate", gen.x, gen.y + gen.h + 64, {
      parent: gen.parent,
      title: `${gen.title} · remix`,
      status: "exploration",
      data: { ...gen.data, seed, control: "Fixed" },
      extras: gen.extras?.map((x) => ({ ...x })),
    }),
    w: gen.w,
    outputs: [ref],
    asset: ref,
  };
  const print = makeNode("preview", gen.x + gen.w + 80, made.y, { parent: gen.parent, title: "Remix", status: "exploration", asset: ref });
  // fed by what fed the original, port for port
  const feeds = Object.values(g.edges)
    .filter((e) => e.to.node === gen.id)
    .map((e) => ({ id: newId("e"), from: e.from, to: { node: made.id, port: e.to.port } }));
  const out = { id: newId("e"), from: { node: made.id, port: "image" }, to: { node: print.id, port: "image" } };
  commit("Remix", () =>
    graph.set((x) => ({
      ...x,
      nodes: { ...x.nodes, [made.id]: made, [print.id]: print },
      order: [...x.order, made.id, print.id],
      edges: { ...x.edges, ...Object.fromEntries([...feeds, out].map((e) => [e.id, e])) },
      selection: [made.id],
      edgeSelection: [],
    })),
  );
  return made.id;
}

/** a take laid on the field as a card of its own, where it was dropped */
export function setOnField(ref: string, at: { x: number; y: number }) {
  const gen = makerOf(ref);
  const n = (gen?.outputs ?? []).indexOf(ref);
  const card = makeNode("preview", Math.round(at.x - 130), Math.round(at.y - 20), {
    parent: gen?.parent ?? null,
    title: gen ? `${gen.title} · take ${n + 1}` : "Take",
    status: "exploration",
    asset: ref,
  });
  commit("Set on the field", () =>
    graph.set((x) => ({ ...x, nodes: { ...x.nodes, [card.id]: card }, order: [...x.order, card.id], selection: [card.id], edgeSelection: [] })),
  );
}

/** a take dropped on a character or a place becomes its picture — what
 *  every writer and generator it feeds is shown from now on */
export function giveLook(id: string, ref: string) {
  commit("Picture", () =>
    graph.set((x) => {
      const n = x.nodes[id];
      if (!n || (n.kind !== "character" && n.kind !== "location")) return x;
      return { ...x, nodes: { ...x.nodes, [id]: { ...n, asset: ref, attachments: [...new Set([...(n.attachments ?? []), ref])] } } };
    }),
  );
}
