/**
 * File › Import… and a manuscript dropped on the window (PLAN.md M2.9): a
 * file's words read by `import.rs`, cut into chapters by `importer.ts`, and
 * laid at the book's root after its chapters — one journal entry, so ⌘Z
 * takes the whole import back.
 */
import { graph, makeNode, childrenOf } from "./graph";
import { commit } from "./history";
import { say, retell, hush } from "./notice";
import { nav, riseTo } from "./nav";
import { closeChooser } from "./ui";
import { chaptersFrom, placeAt } from "./importer";
import { stats, noted, brought, bookWords } from "./stats";
import { inTauri, pickImport } from "../platform/fs";
import { readMaterial, onlyScans } from "../readers";
import { painted, log, since } from "../platform/log";

const kindOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? "file";
import { fitLevel } from "../canvas/view";

const many = (n: number) => n.toLocaleString("en-US");

/** Ask for a file, then import it. */
export async function importDialog() {
  if (!inTauri) return;
  const path = await pickImport();
  if (path) await importFrom(path);
}

/** Import these files, one after another (a drop can bring several). */
export async function importFiles(paths: string[]) {
  for (const p of paths) await importFrom(p);
}

export async function importFrom(path: string) {
  const t0 = performance.now();
  let got;
  // a scanned PDF is read page by page (OCR): the count shows, and Stop stops it
  const stop = new AbortController();
  let note: number | null = null;
  const name = path.split("/").pop() ?? path;
  try {
    got = await readMaterial(path, null, {
      signal: stop.signal,
      onPage: (at, of, model) => {
        const text = `Reading “${name}”: scanned page ${at} of ${of}, with ${model}…`;
        if (note === null) note = say(text, { label: "Stop", run: () => stop.abort() });
        else retell(note, text);
      },
    });
  } catch (e) {
    log("import", `${kindOf(path)} ${stop.signal.aborted ? "stopped" : `failed: ${String(e).replace(/^Error: /, "")}`}`, stop.signal.aborted ? "info" : "warn");
    return void say(stop.signal.aborted ? `Stopped reading “${name}” — nothing was brought in.` : String(e).replace(/^Error: /, ""));
  } finally {
    if (note !== null) hush(note);
  }
  if (onlyScans(got))
    return void say(`“${got.name}” is scanned pages. Doodle reads them with an OCR model in Ollama — Chandra OCR 2 or GLM-OCR (ollama pull glm-ocr).`);
  const { chapters, form } = chaptersFrom(got.kind, got.text, got.name);
  if (!chapters.length) return void say(`“${got.name}” has no words to bring in.`);

  // the chapters go at the root: go there first (rising clears the selection)
  closeChooser();
  if (nav.get().focus) riseTo(null);
  const g = graph.get();
  // what came in is not today's writing: the ledger as the book stood, then its base raised
  const had = bookWords(g);
  stats.set((s) => noted(s, had));
  const root = childrenOf(g, null).map((id) => g.nodes[id]);
  const at = placeAt(root, chapters.length);
  const made = chapters.map((c, i) =>
    makeNode("chapter", at[i].x, at[i].y, { title: c.title, data: { summary: "", text: c.text, ...(form === "screenplay" ? { form } : {}) } }),
  );
  commit("Import", () =>
    graph.set((x) => ({
      ...x,
      nodes: { ...x.nodes, ...Object.fromEntries(made.map((n) => [n.id, n])) },
      order: [...x.order, ...made.map((n) => n.id)],
      selection: made.map((n) => n.id),
      edgeSelection: [],
    })),
  );

  const words = bookWords(graph.get()) - had;
  const read = got.pages?.filter((p) => p.ocr);
  log("import", `${got.kind}: ${made.length} chapter${made.length === 1 ? "" : "s"}, ${words} words${got.pages ? `, ${got.pages.length} pages` : ""}${read?.length ? `, ${read.length} read by ${read[0].ocr}` : ""}, ${since(t0)} ms`);
  stats.set((s) => brought(s, words));
  say(
    made.length === 1
      ? `Imported “${got.name}” as a chapter — ${many(words)} words. ⌘Z takes it back.`
      : `Imported ${made.length} chapters from “${got.name}” — ${many(words)} words. ⌘Z takes them back.`,
  );
  // the whole book in view, what came in picked out
  await painted();
  fitLevel();
}
