/**
 * Assets: images that live in the graph's folder, content-addressed.
 * A node refers to one by its relative path; this store turns that into
 * something the webview can show, once, and keeps it.
 */
import { createStore } from "./store";
import { doc, save } from "./doc";
import { importAsset, readAsset } from "../platform/fs";
import { graph } from "./graph";
import { commit } from "./history";

export const assets = createStore<Record<string, string>>({});
const loading = new Set<string>();

/** a URL for an asset reference: fixtures and data URLs pass through;
 *  relative paths are read from the folder the first time */
export function urlFor(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  if (!ref.startsWith("assets/")) return ref;
  const have = assets.get()[ref];
  if (have) return have;
  const dir = doc.get().path;
  if (dir && !loading.has(ref)) {
    loading.add(ref);
    readAsset(dir, ref)
      .then((url) => assets.set((a) => ({ ...a, [ref]: url })))
      .catch(() => undefined)
      .finally(() => loading.delete(ref));
  }
  return undefined;
}

/** Bring files into the folder — saving first if the graph has no home —
 *  and return their references. */
export async function attachFiles(paths: string[]): Promise<string[]> {
  let dir = doc.get().path;
  if (!dir) {
    if (!(await save())) return [];
    dir = doc.get().path!;
  }
  const out: string[] = [];
  for (const p of paths) {
    try {
      const a = await importAsset(dir, p);
      out.push(a.rel);
    } catch (e) {
      console.warn("[assets]", p, e);
    }
  }
  return out;
}

/** Put images on a node: the first becomes its picture if it has none,
 *  all of them join its attachments. */
export function attachTo(id: string, refs: string[]) {
  if (!refs.length) return;
  commit("Attach", () =>
    graph.set((g) => {
      const n = g.nodes[id];
      if (!n) return g;
      const list = [...(n.attachments ?? []), ...refs.filter((r) => !(n.attachments ?? []).includes(r))];
      return { ...g, nodes: { ...g.nodes, [id]: { ...n, attachments: list, asset: n.asset ?? refs[0] } } };
    }),
  );
}
