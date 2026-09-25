/**
 * What the webview keeps for itself between launches, by key — IndexedDB,
 * because a book's worth of vectors is too much for localStorage. Nothing
 * here is the document: lose it and it is made again. Where there is no
 * IndexedDB (a test in node), nothing is kept and nothing fails.
 */
const DB = "doodle-kept";
const STORES = ["vectors", "gists"] as const;
export type Shelf = (typeof STORES)[number];

let db: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => STORES.forEach((s) => r.result.createObjectStore(s));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return db;
}

/** the values kept under these keys, those that are */
export async function recall<T>(shelf: Shelf, keys: string[]): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const d = keys.length ? await open() : null;
  if (!d) return out;
  await new Promise<void>((done) => {
    const t = d.transaction(shelf, "readonly");
    const s = t.objectStore(shelf);
    for (const k of keys)
      s.get(k).onsuccess = (e) => {
        const v = (e.target as IDBRequest<T | undefined>).result;
        if (v !== undefined) out.set(k, v);
      };
    t.oncomplete = () => done();
    t.onerror = () => done();
  });
  return out;
}

export async function keep<T>(shelf: Shelf, pairs: [string, T][]) {
  const d = pairs.length ? await open() : null;
  if (!d) return;
  const t = d.transaction(shelf, "readwrite");
  for (const [k, v] of pairs) t.objectStore(shelf).put(v, k);
}
