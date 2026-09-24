/**
 * Measure performance (⌘K) — PLAN.md M1.9's numbers, taken in the app on
 * whatever is open: a save (serialize + write), a search that finds
 * something and one that reads every word to find nothing, the field
 * panning at the level you are on and at the far view, and entering the
 * first chapter. Every number goes to the log (Help › Reveal Logs); the
 * gist is said. The view is put back where it was.
 *
 * The plan's bars: open < 1 s, save < 50 ms, the field at 60 fps.
 */
import { graph } from "./graph";
import { camera, panBy } from "../canvas/camera";
import { nav, enter, riseTo } from "./nav";
import { findNodes } from "./search";
import { timeSave } from "./doc";
import { say, hush } from "./notice";
import { log, painted } from "../platform/log";
import { setRead } from "./ui";

const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
const ms = (x: number) => `${x.toFixed(1)} ms`;

/** until something is so, a frame at a time — or three seconds */
async function until(ok: () => boolean) {
  const t = performance.now();
  while (!ok() && performance.now() - t < 3000) await frame();
}

/** `n` frames of the document scrolling 60 px a frame */
async function scroll(n: number) {
  const stage = document.querySelector<HTMLElement>(".stage.reading");
  const gaps: number[] = [];
  if (!stage) return { fps: 0, slow: 0 };
  let last = await frame();
  for (let i = 0; i < n; i++) {
    stage.scrollTop += 60;
    const now = await frame();
    gaps.push(now - last);
    last = now;
  }
  const total = gaps.reduce((a, b) => a + b, 0) || 1;
  return { fps: Math.round((n / total) * 1000), slow: gaps.filter((x) => x > 25).length };
}

/** `n` frames of the field moving `step` px a frame: frames a second, and
 *  how many took long enough to be seen as a stutter (> 25 ms) */
async function pan(n: number, step: number) {
  const gaps: number[] = [];
  let last = await frame();
  for (let i = 0; i < n; i++) {
    panBy(i < n / 2 ? step : -step, 0);
    const now = await frame();
    gaps.push(now - last);
    last = now;
  }
  const total = gaps.reduce((a, b) => a + b, 0);
  const sorted = [...gaps].sort((a, b) => a - b);
  return { fps: Math.round((n / total) * 1000), p95: sorted[Math.floor(n * 0.95)], long: gaps.filter((g) => g > 25).length };
}

function searchTime(q: string) {
  const g = graph.get();
  const t = performance.now();
  let hits = 0;
  for (let i = 0; i < 10; i++) hits = findNodes(g, q).length;
  return { ms: (performance.now() - t) / 10, hits };
}

let running = false;
export async function measure() {
  if (running) return;
  running = true;
  const g = graph.get();
  const view = camera.get();
  const focus = nav.get().focus;
  const words = Object.values(g.nodes).reduce((n, x) => n + (typeof x.data.text === "string" ? x.data.text.split(/\s+/).length : 0), 0);
  const size = `${g.order.length} nodes, ~${Math.round(words / 1000)}k words`;
  const lines: string[] = [];
  try {
    const measuring = say("Measuring — the view will move for a few seconds.");
    // save
    const saves = [];
    for (let i = 0; i < 3; i++) {
      const s = await timeSave();
      if (s) saves.push(s);
    }
    if (saves.length) {
      const best = saves.reduce((a, b) => (a.serialize + a.write < b.serialize + b.write ? a : b));
      lines.push(`save ${ms(best.serialize + best.write)} (serialize ${ms(best.serialize)}, write ${ms(best.write)}, ${Math.round(best.bytes / 1024)} KB)`);
    }
    // search: a word that is there, and one that is nowhere (every word read)
    const hit = searchTime("lantern");
    const miss = searchTime("zqxjk");
    lines.push(`search ${ms(hit.ms)} (${hit.hits} shown), a miss ${ms(miss.ms)}`);
    // the field, here and far away
    await painted();
    const near = await pan(120, 6);
    camera.set({ ...camera.get(), zoom: 0.3 });
    await painted();
    const far = await pan(120, 12);
    camera.set(view);
    lines.push(`pan here ${near.fps} fps (p95 ${ms(near.p95)}, ${near.long} slow), far view ${far.fps} fps (p95 ${ms(far.p95)}, ${far.long} slow)`);
    // into the first chapter — its manuscript, one document (D1) — scrolling it, and back
    const ch = g.order.map((id) => g.nodes[id]).find((n) => n.kind === "chapter" && n.parent === focus);
    if (ch) {
      const t = performance.now();
      enter(ch.id);
      await until(() => !!document.querySelector(".docpage .pm"));
      await painted();
      const into = performance.now() - t;
      const doc = await scroll(90);
      lines.push(`open a chapter ${ms(into)} (${(g.nodes[ch.id].data.text as string | undefined)?.split(/\s+/).length ?? 0} words), scroll it ${doc.fps} fps (${doc.slow} slow)`);
      riseTo(focus);
      await painted();
      camera.set(view);
    }
    // the manuscript: the whole book as one column, and scrolling through it
    if (!focus && g.order.some((id) => g.nodes[id].kind === "chapter")) {
      const t = performance.now();
      setRead(true);
      await painted();
      const open = performance.now() - t;
      const read = await scroll(120);
      // a keystroke in a chapter mid-book, from the store to the screen —
      // what writing in the manuscript costs (the journal left out of it)
      const chs = g.order.map((id) => g.nodes[id]).filter((n) => n.kind === "chapter");
      const mid = chs[Math.floor(chs.length / 2)];
      const was = String(mid.data.text ?? "");
      const keys: number[] = [];
      for (let i = 0; i < 20; i++) {
        // the frame a keystroke lands in: from the frame before it to the
        // frame after — one frame (16.7 ms at 60 Hz) means it cost nothing seen
        const t0 = await frame();
        graph.set((x) => ({ ...x, nodes: { ...x.nodes, [mid.id]: { ...x.nodes[mid.id], data: { ...x.nodes[mid.id].data, text: was + " x".repeat(i + 1) } } } }));
        keys.push((await frame()) - t0);
      }
      graph.set((x) => ({ ...x, nodes: { ...x.nodes, [mid.id]: { ...x.nodes[mid.id], data: { ...x.nodes[mid.id].data, text: was } } } }));
      const key = [...keys].sort((a, b) => a - b)[10];
      setRead(false);
      await painted();
      camera.set(view);
      lines.push(`manuscript opens ${ms(open)}, scrolls ${read.fps} fps (${read.slow} slow), a keystroke lands in a ${ms(key)} frame`);
    }
    for (const l of lines) log("bench", `${size}: ${l}`);
    hush(measuring);
    say(`${size} — ${lines.join(" · ")}. In the log too.`);
  } catch (e) {
    log("bench", `failed: ${String(e).slice(0, 200)}`, "warn");
    say("The measurement stopped part way.");
  } finally {
    running = false;
  }
}
