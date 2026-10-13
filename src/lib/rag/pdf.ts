/**
 * PDF → text (per-page) через `pdf-parse` v2 (класс PDFParse).
 * Импортируем динамически — pdfjs тащит большой воркер, не нужен в клиенте.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RawPage } from "./chunk";

let workerConfigured = false;

export async function extractPdfPages(buffer: Buffer): Promise<{
  pages: RawPage[];
  totalPages: number;
}> {
  const mod = await import("pdf-parse");
  const PDFParse = mod.PDFParse as typeof import("pdf-parse").PDFParse & {
    setWorker?: (workerSrc?: string) => string;
  };

  if (!workerConfigured && typeof PDFParse.setWorker === "function") {
    const candidates = [
      path.resolve(process.cwd(), "node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs"),
      path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          PDFParse.setWorker(pathToFileURL(candidate).href);
          workerConfigured = true;
        } catch {
          // ignore if setWorker fails in test mock
        }
        break;
      }
    }
  }

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
