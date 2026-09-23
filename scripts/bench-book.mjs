// The book the plan measures against (PLAN.md M1.9): 30 chapters of pages,
// ~120,000 words, a cast and places with faces, twenty generators with their
// takes — 400 pictures in all, each a real 1024 px JPEG of its own — and
// where every take came from. Written as a Doodle project, to open in the
// app and time.
//
//   node scripts/bench-book.mjs <dir>        → <dir>/Bench.doodle
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const out = join(process.argv[2] ?? ".", "Bench.doodle");
const CHAPTERS = 30;
const PAGES = 12; // × 30 = 360 pages
const PAGE_WORDS = 340;
const PEOPLE = 40;
const PLACES = 20;
const GENERATORS = 20;
const TAKES = 17; // × 20 = 340, + 60 faces and places = 400

// a seeded random, so the book is the same book every time
let s = 20260923;
const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];
const WORDS = (
  "the a and of to in she he it was light sea ship house window door rope salt morning night wind rain stone glass lantern gull harbour " +
  "keeper daughter mother letter manifest cargo crate deck rail sail mast wave tide shore cliff path garden greenhouse pane frost fire " +
  "said asked turned looked waited counted carried opened closed remembered forgot walked ran slept woke heard saw knew thought held " +
  "quiet slow cold bright grey heavy small long old new empty full last first far near under over through before after again never always"
).split(" ");
const sentence = () => {
  const n = 6 + Math.floor(rand() * 14);
  const w = Array.from({ length: n }, () => pick(WORDS));
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  return w.join(" ") + pick([".", ".", ".", ",", "?"]).replace(",", ".");
};
const prose = (words) => {
  const paras = [];
  let count = 0;
  while (count < words) {
    const p = Array.from({ length: 3 + Math.floor(rand() * 4) }, sentence).join(" ");
    count += p.split(" ").length;
    paras.push(rand() < 0.08 ? `_${p}_` : p);
  }
  return paras.join("\n\n");
};

// ── pictures: the fixture, 1024 px JPEG, made unique by a trailing tag ──
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(join(out, "assets"), { recursive: true });
const base = join(tmpdir(), "doodle-bench-base.jpg");
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "80", "-Z", "1024", "public/fixtures/black-bear.png", "--out", base], { stdio: "ignore" });
const jpeg = readFileSync(base);
const pictures = [];
for (let i = 0; i < PEOPLE + PLACES + GENERATORS * TAKES; i++) {
  const bytes = Buffer.concat([jpeg, Buffer.from(`doodle-bench-${i}`)]);
  const hash = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(out, "assets", `${hash}.jpg`), bytes);
  pictures.push(`assets/${hash}.jpg`);
}

// ── the graph ──
const nodes = {};
const order = [];
const edges = {};
const provenance = {};
let seq = 0;
const node = (id, kind, x, y, w, h, extra) => {
  nodes[id] = { id, kind, x, y, w, h, title: id, data: {}, status: "canon", seq: ++seq, parent: null, ...extra };
  order.push(id);
};
let words = 0;

for (let i = 0; i < PEOPLE; i++) {
  node(`c${i}`, "character", 60 + (i % 10) * 280, 40 + Math.floor(i / 10) * 240, 240, 190, {
    title: `Person ${i + 1}`,
    data: { name: `Person ${i + 1}`, description: sentence() + " " + sentence() },
    asset: pictures[i],
  });
}
for (let i = 0; i < PLACES; i++) {
  node(`l${i}`, "location", 60 + (i % 10) * 280, 1040 + Math.floor(i / 10) * 240, 240, 190, {
    title: `Place ${i + 1}`,
    data: { name: `Place ${i + 1}`, description: sentence() },
    asset: pictures[PEOPLE + i],
  });
}
for (let c = 0; c < CHAPTERS; c++) {
  const ch = `ch${c}`;
  node(ch, "chapter", 3000 + (c % 6) * 320, 40 + Math.floor(c / 6) * 280, 280, 236, { title: `Chapter ${c + 1}`, data: { summary: sentence() } });
  for (let p = 0; p < PAGES; p++) {
    const text = prose(PAGE_WORDS);
    words += text.split(/\s+/).length;
    node(`${ch}p${p}`, "page", 60 + p * 340, 40, 300, 400, { title: `Page ${p + 1}`, parent: ch, data: { text } });
    if (p % 4 === 0) node(`${ch}p${p}b`, "note", 60, 40, 240, 176, { title: "Beat", parent: `${ch}p${p}`, data: { text: sentence() } });
  }
}
let n = PEOPLE + PLACES;
for (let g = 0; g < GENERATORS; g++) {
  const outs = pictures.slice(n, n + TAKES);
  n += TAKES;
  node(`g${g}`, "generate", 60 + (g % 5) * 380, 1600 + Math.floor(g / 5) * 420, 320, 338, {
    title: `Image Generator ${g + 1}`,
    data: { seed: 1000 + g, control: "Increment", steps: 30, strength: 8, sampler: "dpm++ 2M", frame: "1:1", count: 4 },
    outputs: outs,
    asset: outs.at(-1),
  });
  node(`pv${g}`, "preview", 60 + (g % 5) * 380 + 340, 1600 + Math.floor(g / 5) * 420, 260, 320, { title: "Preview", asset: outs.at(-1) });
  edges[`e${g}`] = { id: `e${g}`, from: { node: `g${g}`, port: "image" }, to: { node: `pv${g}`, port: "image" } };
  edges[`f${g}`] = { id: `f${g}`, from: { node: `c${g}`, port: "text" }, to: { node: `g${g}`, port: "character" } };
  outs.forEach((ref, k) => {
    provenance[ref] = {
      key: ref,
      kind: "image",
      provider: "mock",
      model: "Default",
      at: Date.UTC(2026, 8, 20) + g * 3600_000 + k * 60_000,
      prompt: sentence() + " " + sentence(),
      seed: 1000 + g + k,
      inputs: [{ node: `c${g}`, port: "character", title: `Person ${g + 1}`, kind: "character" }],
      job: `j${g}-${k}`,
    };
  });
}

const graph = {
  format: "doodle-graph",
  version: 1,
  name: "Bench",
  nodes,
  order,
  edges,
  camera: { x: 0, y: 0, zoom: 0.3 },
  bible: { tone: "Quiet.", rules: "", avoid: "" },
  provenance,
};
writeFileSync(join(out, "graph.json"), JSON.stringify(graph, null, 2));
const size = readFileSync(join(out, "graph.json")).length;
console.log(`${out}: ${order.length} nodes, ${CHAPTERS} chapters, ${CHAPTERS * PAGES} pages, ~${words} words, ${pictures.length} pictures, graph.json ${(size / 1024).toFixed(0)} KB`);
