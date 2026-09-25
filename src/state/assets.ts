/**
 * Assets: images that live in the graph's folder, content-addressed.
 * A node refers to one by its relative path; this store turns that into
 * something the webview can show, once, and keeps it.
 */
import { createStore } from "./store";
import { doc, save } from "./doc";
import { importAsset, readAsset, readThumb } from "../platform/fs";
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

/**
 * A small copy of an image, for wherever it is shown small (plan §10.2):
 * a take in a bloom, a card's picture, a run in the history. 256, 512 or
 * 1024 on the long side. A file's is made once by Rust and kept in
 * `thumbs/`; an image still in memory is made here. Until it arrives, the
 * original if it is already loaded, else nothing.
 */
export function thumbFor(ref: string | undefined, size: 256 | 512 | 1024 = 512): string | undefined {
  if (!ref) return undefined;
  const key = `thumb${size}:${ref}`;
  const have = assets.get()[key];
  if (have) return have;
  if (!loading.has(key)) {
    const dir = doc.get().path;
    const made = ref.startsWith("assets/") ? (dir ? readThumb(dir, ref, size) : null) : shrink(ref, size);
    if (made) {
      loading.add(key);
      made
        .then((url) => assets.set((a) => ({ ...a, [key]: url })))
        .catch(() => undefined)
        .finally(() => loading.delete(key));
    }
  }
  return ref.startsWith("assets/") ? assets.get()[ref] : ref;
}

/** an in-memory image drawn small by the webview itself */
function shrink(src: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = size / Math.max(img.naturalWidth, img.naturalHeight);
      if (k >= 1) return resolve(src);
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(src);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // a PNG may be transparent; anything else is a JPEG
      resolve(src.startsWith("data:image/png") || /\.png(\?|$)/i.test(src) ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.84));
    };
    img.onerror = reject;
    img.src = src;
  });
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
