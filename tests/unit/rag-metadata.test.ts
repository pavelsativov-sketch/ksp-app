import { describe, expect, it } from "vitest";
import { summarizeRagUse } from "@/lib/rag/metadata";
import type { RetrievedContext } from "@/lib/rag/retrieve";

const context: RetrievedContext = {
  textbookTitle: "Алгебра 5",
  promptBlock: "СЫРОЙ ТЕКСТ, ПЕРЕДАННЫЙ В МОДЕЛЬ",
  method: "vector",
  status: "degraded",
  warnings: ["Atlas-поиск недоступен; применён резервный поиск."],
  chunks: [
    { id: "507f1f77bcf86cd799439001", chunk_index: 3, page_number: 17, content: "Private excerpt", similarity: 0.8 },
    { id: "507f1f77bcf86cd799439002", chunk_index: 4, page_number: null, content: "Another excerpt", similarity: 0.6 },
  ],
};

describe("summarizeRagUse", () => {
  it("distinguishes no selected textbook from a selected but unavailable source", () => {
    expect(summarizeRagUse(false, null)).toMatchObject({ selected: false, status: "not_selected", chunkCount: 0, sources: [] });
    expect(summarizeRagUse(true, null)).toMatchObject({ selected: true, status: "unavailable", chunkCount: 0, sources: [] });
  });

  it("reports only source metadata for fragments actually present in the prompt", () => {
    const summary = summarizeRagUse(true, context);
    expect(summary).toMatchObject({
      selected: true,
      textbookTitle: "Алгебра 5",
      chunkCount: 2,
      method: "vector",
      status: "degraded",
      sources: [
        { id: "507f1f77bcf86cd799439001", pageNumber: 17, chunkIndex: 3 },
        { id: "507f1f77bcf86cd799439002", pageNumber: null, chunkIndex: 4 },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain("СЫРОЙ ТЕКСТ");
    expect(JSON.stringify(summary)).not.toContain("Private excerpt");
  });
});
