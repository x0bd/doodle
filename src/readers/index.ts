/**
 * Material (PLAN.md M3.1): any file Doodle reads, as one shape — its words
 * as Markdown (Fountain for a screenplay), its pages when it has them (a
 * PDF's, numbered, a scan marked), and the pictures kept from it. The
 * readers themselves: `import.rs` (Markdown, plain text, Fountain, Word),
 * `pdf.ts` (PDF, through pdf.js), and the asset store (pictures).
 */
import { readImport, readBytes, importAsset, PICTURES } from "../platform/fs";
import { readPdf, type PdfPage } from "./pdf";

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

/** A file, read. With `dir` (the open project) its pictures are kept in it;
 *  without, a picture cannot be read and a document's pictures are left out. */
export async function readMaterial(path: string, dir: string | null = null): Promise<Material> {
  if (/\.pdf$/i.test(path)) {
    const got = await readPdf(await readBytes(path));
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
  return { name: got.name, path, kind: got.kind as MaterialKind, text: got.text, pictures: got.pictures ?? [] };
}

/** a PDF made only of pictures of its pages — nothing to read until OCR (M3.2) */
export const onlyScans = (m: Material) => m.kind === "pdf" && !!m.pages?.length && m.pages.every((p) => p.scanned);
