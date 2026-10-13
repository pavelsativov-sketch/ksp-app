import type { RetrievedContext } from "./retrieve";

export interface RagSourceReference {
  id: string;
  pageNumber: number | null;
  chunkIndex: number;
}

export interface RagRunInfo {
  selected: boolean;
  textbookTitle: string | null;
  chunkCount: number;
  method: "vector" | "keyword" | null;
  status: "not_selected" | "unavailable" | "ok" | "degraded";
  warnings: string[];
  sources: RagSourceReference[];
}

/** Metadata only: never return the retrieved text or prompt block to the client. */
export function summarizeRagUse(selected: boolean, context: RetrievedContext | null): RagRunInfo {
  if (!selected) {
    return { selected: false, textbookTitle: null, chunkCount: 0, method: null, status: "not_selected", warnings: [], sources: [] };
  }
  if (!context) {
    return {
      selected: true,
      textbookTitle: null,
      chunkCount: 0,
      method: null,
      status: "unavailable",
      warnings: ["Выбранный учебник недоступен или не найден; план сгенерирован без опоры на него."],
      sources: [],
    };
  }
  const sources = context.promptBlock
    ? context.chunks.map((chunk) => ({ id: chunk.id, pageNumber: chunk.page_number, chunkIndex: chunk.chunk_index }))
    : [];
  const usedContext = sources.length > 0;
  return {
    selected: true,
    textbookTitle: context.textbookTitle,
    chunkCount: sources.length,
    method: context.method,
    status: usedContext ? context.status : "unavailable",
    warnings: context.warnings,
    sources,
  };
}
