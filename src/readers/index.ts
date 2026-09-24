/**
 * Material (PLAN.md M3.1): any file Doodle reads, as one shape — its words
 * as Markdown (Fountain for a screenplay), its pages when it has them (a
 * PDF's, numbered, a scan marked), and the pictures kept from it. The
 * readers themselves: `import.rs` (Markdown, plain text, Fountain, Word),
 * `pdf.ts` (PDF, through pdf.js), and the asset store (pictures).
 */
import { readImport, readBytes, importAsset, PICTURES } from "../platform/fs";
import { readPdf, pagePictures, type PdfPage } from "./pdf";
import { cleanMarkdown } from "../state/importer";
import { ocrModels, ocrImage } from "./ocr";

export type MaterialKind = "md" | "txt" | "fountain" | "docx" | "pdf" | "image";

export interface Material {
  /** the file's name, without its extension */
  name: string;
  path: string;
  kind: MaterialKind;
  text: string;
  /** a PDF's pages, by number */
  pages?: PdfPage[];
  /** kept in the project (`assets/…`): a Word document's pictures, or the picture itself */
  pictures: string[];
}

const stem = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

/** A document's own name for itself: its front matter's title, else a
 *  heading it opens with — else the file's name, which is only a name. */
export function titleOf(text: string, fallback: string): string {
  const front = text.match(/^\uFEFF?---\n([\s\S]*?)\n---/);
  const named = front?.[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  if (named) return named.trim();
  const head = text.replace(/^\uFEFF?---\n[\s\S]*?\n---\n/, "").trimStart().match(/^#{1,2} (.+)/)?.[1];
  return head?.replace(/\s+#*\s*$/, "").trim() || fallback;
}

export interface Reading {
  /** each scanned page as OCR reaches it: which of how many, and by what */
  onPage?: (at: number, of: number, model: string) => void;
  signal?: AbortSignal;
}

/** A file, read. With `dir` (the open project) its pictures are kept in it;
 *  without, a picture cannot be read and a document's pictures are left out.
 *  A PDF's scanned pages are read by OCR (M3.2) when this Mac has a model
 *  for it; else they stay `scanned`, with no words. */
export async function readMaterial(path: string, dir: string | null = null, how: Reading = {}): Promise<Material> {
  if (/\.pdf$/i.test(path)) {
    const bytes = await readBytes(path);
    const got = await readPdf(bytes);
    const scans = got.pages.filter((p) => p.scanned);
    const model = scans.length ? (await ocrModels())[0] : undefined;
    if (model) {
      let at = 0;
      // a page drawn at 1600 across: small print still reads, and a page stays a few hundred KB
      await pagePictures(bytes, scans.map((p) => p.n), 1600, async (n, picture) => {
        how.signal?.throwIfAborted();
        how.onPage?.(++at, scans.length, model.name);
        const page = got.pages[n - 1];
        page.text = await ocrImage(picture.slice(picture.indexOf(",") + 1), model, how.signal);
        page.ocr = model.name;
      });
    }
    const text = got.pages
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n\n");
    return { name: got.title && !/^untitled$/i.test(got.title) ? got.title : stem(path), path, kind: "pdf", text, pages: got.pages, pictures: [] };
  }
  if (PICTURES.test(path)) {
    if (!dir) throw new Error("A picture is kept in a saved project — save first.");
    const a = await importAsset(dir, path);
    return { name: stem(path), path, kind: "image", text: "", pictures: [a.rel] };
  }
  const got = await readImport(path, dir);
  // Markdown as Doodle writes it: front matter, tags and outside pictures gone (the kept ones stay)
  const text = got.kind === "md" ? cleanMarkdown(got.text, true) : got.text;
  return { name: got.kind === "fountain" ? got.name : titleOf(got.text, got.name), path, kind: got.kind as MaterialKind, text, pictures: got.pictures ?? [] };
}

/** a PDF made only of pictures of its pages, none of them read — no OCR model here */
export const onlyScans = (m: Material) => m.kind === "pdf" && !!m.pages?.length && m.pages.every((p) => p.scanned && !p.ocr);
