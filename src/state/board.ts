/**
 * The inspiration board (PLAN.md M3.3) — the pure part: what was gathered,
 * laid out. Each source is a block of its own: a document is one card
 * (collapsed; it opens), a Word document's pictures sit under it, a drop's
 * loose pictures are one block named for their folder. A block of two or
 * more is a **group** — a quiet frame with the source's name, which carries
 * what is inside it when it is dragged. Pictures stand in columns, each as
 * tall as its shape makes it (a masonry); blocks go left to right from
 * where they were dropped, onto clear field.
 */

export type What = "picture" | "passage" | "document";

/** a thing gathered, before it is placed */
export interface Item {
  what: What;
  title: string;
  /** a picture: the project's copy */
  asset?: string;
  /** a picture's height over its width */
  ratio?: number;
  /** a document or a passage: its words */
  text?: string;
  /** the project's copy of the source file (`assets/…`), the file's own name, a page in it */
  source?: string;
  from?: string;
  page?: number;
  pages?: number;
}

/** one source's things: a file, or a drop's loose pictures */
export interface Gathered {
  name: string;
  items: Item[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Laid {
  groups: (Box & { title: string })[];
  items: (Item & Box)[];
}

/** a card's width on the board, and the heights the CSS holds cards to */
export const CELL = 240;
export const DOC_W = 300;
export const DOC_H = 196;
export const PASSAGE_H = 168;
/** a picture card: the picture, then its line */
export const PICTURE_FOOT = 30;
const GAP = 16;
const PAD = 24;
/** the group's name, above what it holds */
const HEAD = 40;
const BETWEEN = 64;
const ROW_W = 2600;
const COLS = 4;

const pictureH = (w: number, ratio = 1) => Math.round(w * Math.min(2, Math.max(0.4, ratio))) + PICTURE_FOOT;
const heightOf = (it: Item, w: number) => (it.what === "picture" ? pictureH(w, it.ratio) : it.what === "document" ? DOC_H : PASSAGE_H);

const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** one source's things in columns: documents across the top, the rest in a
 *  masonry under them. Positions from (0, 0); the block's size. */
function block(items: Item[]): { items: (Item & Box)[]; w: number; h: number } {
  if (items.length === 1) {
    const it = items[0];
    const w = it.what === "document" ? DOC_W : it.what === "picture" ? CELL + 40 : CELL + 20;
    return { items: [{ ...it, x: 0, y: 0, w, h: heightOf(it, w) }], w, h: heightOf(it, w) };
  }
  const cols = Math.min(COLS, items.length);
  const heights = Array(cols).fill(0);
  const out: (Item & Box)[] = [];
  // documents first, a row of them; the rest fall into the shortest column
  const docs = items.filter((i) => i.what === "document");
  const rest = items.filter((i) => i.what !== "document");
  let top = 0;
  docs.forEach((d, i) => {
    const col = i % cols;
    const y = Math.floor(i / cols) * (DOC_H + GAP);
    out.push({ ...d, x: col * (CELL + GAP), y, w: CELL, h: DOC_H });
    top = Math.max(top, y + DOC_H + GAP);
  });
  heights.fill(top);
  for (const it of rest) {
    const col = heights.indexOf(Math.min(...heights));
    const h = heightOf(it, CELL);
    out.push({ ...it, x: col * (CELL + GAP), y: heights[col], w: CELL, h });
    heights[col] += h + GAP;
  }
  return { items: out, w: cols * CELL + (cols - 1) * GAP, h: Math.max(...heights) - GAP };
}

/**
 * Lay the sources out from `at` (the drop, in the board's own units), each
 * a block — a group when it holds two or more — left to right, wrapping.
 * If that would cover anything already on the board, they go below it all.
 */
export function layOut(sources: Gathered[], at: { x: number; y: number }, there: Box[] = []): Laid {
  const blocks = sources.filter((s) => s.items.length).map((s) => ({ s, b: block(s.items), framed: s.items.length > 1 }));
  const place = (ox: number, oy: number): Laid => {
    const laid: Laid = { groups: [], items: [] };
    let x = ox;
    let y = oy;
    let rowH = 0;
    for (const { s, b, framed } of blocks) {
      const w = b.w + (framed ? PAD * 2 : 0);
      const h = b.h + (framed ? PAD + HEAD : 0);
      if (x > ox && x + w - ox > ROW_W) {
        x = ox;
        y += rowH + BETWEEN;
        rowH = 0;
      }
      const ix = x + (framed ? PAD : 0);
      const iy = y + (framed ? HEAD : 0);
      if (framed) laid.groups.push({ title: s.name, x, y, w, h });
      for (const it of b.items) laid.items.push({ ...it, x: ix + it.x, y: iy + it.y });
      x += w + BETWEEN;
      rowH = Math.max(rowH, h);
    }
    return laid;
  };
  const first = place(at.x, at.y);
  const covered = [...first.groups, ...first.items];
  if (!there.length || !covered.some((c) => there.some((t) => hits(c, t)))) return first;
  const left = Math.min(...there.map((t) => t.x));
  const foot = Math.max(...there.map((t) => t.y + t.h));
  return place(left, foot + BETWEEN * 2);
}

/** What a group holds: the things at its level wholly inside its frame
 *  (other groups too), found when it is picked up. */
export function within(group: Box, others: (Box & { id: string })[]): string[] {
  return others.filter((o) => o.x >= group.x && o.y >= group.y && o.x + o.w <= group.x + group.w && o.y + o.h <= group.y + group.h).map((o) => o.id);
}

/** A drop's loose pictures, named for the folder they came from (or
 *  *Pictures* when they came from more than one). */
export function pictureSource(paths: string[]): string {
  const dirs = new Set(paths.map((p) => p.split("/").slice(0, -1).pop() ?? ""));
  const one = dirs.size === 1 ? [...dirs][0] : "";
  return one && one !== "Desktop" && one !== "Downloads" ? one : "Pictures";
}
