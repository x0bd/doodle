/**
 * The PDF reader (PLAN.md M3.1): a PDF's words page by page, with their
 * page numbers, through pdf.js — and a picture of any page. What pdf.js
 * hands over is runs of text placed on the page; `pageText` makes lines of
 * them by where they stand, paragraphs by the gaps between lines, headings
 * of lines set larger than the page's body, joins a word broken across a
 * line, and leaves out a running page number. A page with no words in it
 * is a scan — `scanned`, for OCR (M3.2) to read.
 */

/** a run of text as it stands on the page (PDF units: y grows upward) */
export interface Run {
  str: string;
  x: number;
  y: number;
  /** its height — the size it is set in */
  h: number;
  w: number;
}

export interface PdfPage {
  n: number;
  text: string;
  scanned: boolean;
  /** the OCR model that read a scanned page's words, by name */
  ocr?: string;
}

export interface PdfRead {
  title: string | null;
  pages: PdfPage[];
}

interface Line {
  y: number;
  h: number;
  text: string;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** a page number standing alone: `12`, `- 12 -`, `Page 12`, `12 of 30`, `xii` */
const FOLIO = /^(?:page\s+)?[-–—\s]*(?:\d{1,4}|[ivxlc]{1,7})(?:\s+of\s+\d{1,4})?[-–—\s]*$/i;

/** the runs of one page → its words as Markdown */
export function pageText(runs: Run[]): string {
  // lines: runs whose baselines stand within a third of their size of each other
  const sorted = runs.filter((r) => r.str.length).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; h: number; runs: Run[] }[] = [];
  for (const r of sorted) {
    const line = lines.find((l) => Math.abs(l.y - r.y) <= Math.max(2, Math.min(l.h, r.h) / 3));
    if (line) {
      line.runs.push(r);
      line.h = Math.max(line.h, r.h);
    } else lines.push({ y: r.y, h: r.h, runs: [r] });
  }
  const made: Line[] = lines
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const rs = l.runs.sort((a, b) => a.x - b.x);
      let text = "";
      let end = -Infinity;
      for (const r of rs) {
        // a gap wider than a fifth of the size between runs is a space pdf.js did not give
        if (text && r.x - end > l.h * 0.2 && !/\s$/.test(text) && !/^\s/.test(r.str)) text += " ";
        text += r.str;
        end = r.x + r.w;
      }
      return { y: l.y, h: l.h, text: text.replace(/\s+/g, " ").trim() };
    })
    .filter((l) => l.text);
  // a page number at the head or the foot of the page goes
  const kept = made.filter((l, i) => !((i === 0 || i === made.length - 1) && FOLIO.test(l.text)));
  if (!kept.length) return "";

  const body = median(kept.map((l) => l.h));
  const gaps = kept.slice(1).map((l, i) => kept[i].y - l.y);
  const lead = median(gaps.filter((g) => g > 0)) || body * 1.3;
  const blocks: string[] = [];
  let cur = "";
  let heading = false;
  const close = () => {
    if (cur) blocks.push(heading ? `# ${cur}` : cur);
    cur = "";
    heading = false;
  };
  kept.forEach((l, i) => {
    const big = l.h >= body * 1.3 && l.text.length < 90;
    const gap = i ? kept[i - 1].y - l.y : 0;
    // a new block: a heading starts or ends, or the gap is wider than the lines' own leading
    if (i && (big !== heading || gap > lead * 1.4)) close();
    if (!cur) {
      cur = l.text;
      heading = big;
    } else if (/[a-z]-$/.test(cur) && /^[a-z]/.test(l.text)) cur = cur.slice(0, -1) + l.text; // light-/house
    else cur += ` ${l.text}`;
  });
  close();
  return blocks.join("\n\n");
}

/* ── pdf.js, loaded only when a PDF comes ── */

/** pdf.js reads its text as `for await (… of readableStream)`; the system
 *  WebKit the app runs on (macOS 26) has no async iterator on a
 *  ReadableStream — Playwright's WebKit build does, so only the real window
 *  showed it. The iterator, as the platform will give it. */
function streamsIterate() {
  if (typeof ReadableStream === "undefined") return;
  const proto = ReadableStream.prototype as ReadableStream & { [Symbol.asyncIterator]?: unknown; values?: unknown };
  if (proto[Symbol.asyncIterator]) return;
  async function* values(this: ReadableStream) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  Object.defineProperty(proto, "values", { value: values, configurable: true, writable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: values, configurable: true, writable: true });
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let lib: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  return (lib ??= (async () => {
    streamsIterate();
    const m = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (typeof window !== "undefined" && !m.GlobalWorkerOptions.workerSrc) {
      m.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
    }
    return m;
  })());
}

async function open(bytes: Uint8Array) {
  const { getDocument } = await pdfjs();
  // pdf.js takes the buffer for its worker: give it a copy, so the caller's bytes stay theirs
  const task = getDocument({
    data: bytes.slice(),
    // outside a browser (the tests), the fonts a PDF names but does not carry come from the package
    ...(typeof window === "undefined" ? { standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/" } : {}),
  });
  return { doc: await task.promise, close: () => void task.destroy() };
}

/** Every page's words, with its number. */
export async function readPdf(bytes: Uint8Array): Promise<PdfRead> {
  const { doc, close } = await open(bytes);
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: string };
    const pages: PdfPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const runs: Run[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        const [, , , d, e, f] = it.transform as number[];
        runs.push({ str: it.str, x: e, y: f, h: Math.abs(d) || it.height, w: it.width });
      }
      const text = pageText(runs);
      pages.push({ n, text, scanned: !runs.some((r) => r.str.trim()) });
      page.cleanup();
    }
    return { title: info.Title?.trim() || null, pages };
  } finally {
    close();
  }
}

/** Pages as pictures (JPEG data URLs), `width` pixels across, one at a
 *  time as each is drawn — the document opened once. */
export async function pagePictures(bytes: Uint8Array, ns: number[], width: number, each: (n: number, picture: string) => Promise<void>): Promise<void> {
  const { doc, close } = await open(bytes);
  try {
    for (const n of ns) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();
      await each(n, canvas.toDataURL("image/jpeg", 0.88));
    }
  } finally {
    close();
  }
}

/** A page as a picture (a JPEG data URL), `width` pixels across. */
export async function pagePicture(bytes: Uint8Array, n: number, width = 1400): Promise<string> {
  let out = "";
  await pagePictures(bytes, [n], width, async (_, p) => void (out = p));
  return out;
}
