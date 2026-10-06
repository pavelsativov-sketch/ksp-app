import { describe, expect, it } from "vitest";
import { chunkPages, type RawPage } from "@/lib/rag/chunk";

const longText = (chars: number) => "я".repeat(chars);

/**
 * Разбиение учебника на чанки: короткие страницы, длинные страницы с
 * абзацами и предложениями, перекрытие и нормализация пробелов.
 */

describe("chunkPages: короткие страницы", () => {
  it("keeps a short page as a single chunk", () => {
    const chunks = chunkPages([{ pageNumber: 1, text: "Короткий текст." }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, pageNumber: 1, content: "Короткий текст." });
  });

  it("skips empty pages and pages with only whitespace", () => {
    const chunks = chunkPages([
      { pageNumber: 1, text: "" },
      { pageNumber: 2, text: "   \n\n  " },
      { pageNumber: 3, text: "Текст." },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageNumber).toBe(3);
  });

  it("normalizes line breaks, spaces and tabs", () => {
    const chunks = chunkPages([{ pageNumber: 1, text: "Строка1\r\nСтрока2\t\tс табами" }]);
    expect(chunks[0].content).toBe("Строка1\nСтрока2 с табами");
  });

  it("collapses 3+ newlines into 2", () => {
    const chunks = chunkPages([{ pageNumber: 1, text: "А\n\n\n\nБ" }]);
    expect(chunks[0].content).toBe("А\n\nБ");
  });
});

describe("chunkPages: длинные страницы", () => {
  it("splits a long page by paragraphs with overlap", () => {
    // Страница длиннее TARGET_SIZE + 200 → разбивается по абзацам.
    const para1 = longText(500);
    const para2 = longText(500);
    const chunks = chunkPages([{ pageNumber: 1, text: `${para1}\n\n${para2}` }]);
    expect(chunks.length).toBeGreaterThan(1);
    // Все чанки кроме последнего — размера TARGET_SIZE (700).
    for (const c of chunks.slice(0, -1)) {
      expect(c.content.length).toBeLessThanOrEqual(700);
    }
    // Перекрытие: хвост предыдущего чанка повторяется в начале следующего.
    if (chunks.length > 1) {
      const tail = chunks[0].content.slice(-100);
      expect(chunks[1].content.startsWith(tail)).toBe(true);
    }
  });

  it("splits an oversized paragraph by sentences", () => {
    // Один абзац длиннее TARGET_SIZE → разбивается по предложениям.
    const sentence = "Это предложение содержит достаточно символов для проверки разбиения на части. ";
    const para = sentence.repeat(12); // ~1000 символов
    const chunks = chunkPages([{ pageNumber: 1, text: para }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks.slice(0, -1)) {
      expect(c.content.length).toBeLessThanOrEqual(700);
    }
  });

  it("keeps the page number on all chunks of the same page", () => {
    const para = `${longText(800)}\n\n${longText(800)}`;
    const chunks = chunkPages([{ pageNumber: 7, text: para }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.pageNumber).toBe(7);
    }
  });

  it("numbers chunks sequentially across pages", () => {
    const chunks = chunkPages([
      { pageNumber: 1, text: "Короткий." },
      { pageNumber: 2, text: "Тоже короткий." },
    ]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });
});

describe("chunkPages: границы", () => {
  it("returns an empty array for no pages", () => {
    expect(chunkPages([])).toEqual([]);
  });

  it("handles a page exactly at the short-page boundary", () => {
    // TARGET_SIZE + 200 = 900 — страница короче или равна этому порогу
    // целиком без разбиения.
    const text = longText(900);
    const chunks = chunkPages([{ pageNumber: 1, text }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
  });

  it("handles a page just over the boundary", () => {
    // 901 символ с границами предложений — разбивается.
    const sentence = "Это предложение содержит достаточно символов для проверки разбиения на части. ";
    const text = sentence.repeat(12); // ~1000 символов
    expect(text.length).toBeGreaterThan(900);
    const chunks = chunkPages([{ pageNumber: 1, text }]);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("does not mutate the input pages", () => {
    const pages: RawPage[] = [{ pageNumber: 1, text: "Текст." }];
    const before = structuredClone(pages);
    chunkPages(pages);
    expect(pages).toEqual(before);
  });
});
