/**
 * Provenance. Every generated thing says where it came from: who made it,
 * from what, under which rules, and when. The record is kept with the
 * document, keyed by what it produced — an asset by its own content hash,
 * a passage of words by the run that wrote them — so it travels with the
 * work and survives being reopened.
 */
import { createStore } from "./store";
import { graph } from "./graph";

export interface Prov {
  /** what this is: an asset's reference, or a run's id for words */
  key: string;
  kind: "image" | "text";
  /** who answered, and as what */
  provider: string;
  model?: string;
  /** when it was made */
  at: number;
  /** what was asked, as it went out */
  prompt: string;
  system?: string;
  /** the number that would make it again, if there is one */
  seed?: number;
  /** what fed it, by node — their names as they were */
  inputs: { node: string; port: string; title: string; kind: string }[];
  /** the project's rules, as they stood */
  rules?: string;
  /** the run that made it, for the History */
  job: string;
  /** what it came out of, for a retry or a variation */
  parent?: string;
}

export const prov = createStore<Record<string, Prov>>({});

export const record = (p: Prov) => prov.set((s) => ({ ...s, [p.key]: p }));
export const provFor = (key: string | undefined) => (key ? prov.get()[key] : undefined);
export const resetProv = (next: Record<string, Prov> = {}) => prov.set(next);

/** the outputs moved into the folder on first save: keep their records */
export function rekey(moves: Map<string, string>) {
  if (!moves.size) return;
  prov.set((s) => {
    const next = { ...s };
    for (const [from, to] of moves) {
      if (next[from]) {
        next[to] = { ...next[from], key: to };
        delete next[from];
      }
    }
    return next;
  });
}

/** what fed a node when it ran, named as it was then */
export function inputsOf(nodeId: string) {
  const g = graph.get();
  return Object.values(g.edges)
    .filter((e) => e.to.node === nodeId)
    .map((e) => {
      const n = g.nodes[e.from.node];
      return { node: e.from.node, port: e.to.port, title: n?.title ?? "gone", kind: n?.kind ?? "gone" };
    });
}

/** the record behind what a node is showing, if there is one */
export function behind(nodeId: string): Prov | undefined {
  const n = graph.get().nodes[nodeId];
  if (!n) return undefined;
  return prov.get()[n.asset ?? ""] ?? (n.from ? prov.get()[n.from] : undefined);
}
