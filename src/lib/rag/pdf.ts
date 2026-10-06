/**
 * PDF → text (per-page) через `pdf-parse` v2 (класс PDFParse).
 * Импортируем динамически — pdfjs тащит большой воркер, не нужен в клиенте.
 */

import type { RawPage } from "./chunk";

export async function extractPdfPages(buffer: Buffer): Promise<{
  pages: RawPage[];
  totalPages: number;
}> {
  const mod = await import("pdf-parse");
  const PDFParse = mod.PDFParse as typeof import("pdf-parse").PDFParse;

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({});
    const pages: RawPage[] = (result.pages ?? []).map((p) => ({
      pageNumber: p.num,
      text: (p.text ?? "").trim(),
    }));
    return { pages, totalPages: result.total ?? pages.length };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
