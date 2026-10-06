import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType } from "docx";
import { parseBodyElements } from "@/lib/import/xml";
import { parseAssessmentCell } from "@/lib/import/docx";

/**
 * Round-trip: собираем настоящий .docx тем же пакетом `docx`, которым
 * пользуется экспорт, и проверяем, что импорт его читает.
 *
 * Это подтверждает, что новый обход XML работает на реальной структуре
 * OOXML (с `w:tblGrid`, `w:tcPr`, `w:pPr`, списками), а не только на
 * искусственных строках в тестах.
 */
async function buildDocx(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Этапы урока")] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Деятельность учителя")] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Деятельность ученика")] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Оценивание")] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Ресурсы")] })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun("Начало урока")] }),
                      new Paragraph({ children: [new TextRun("Второй абзац этапа")] }),
                    ],
                  }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Приветствует & объясняет")] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Слушает, отвечает")] })] }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun("Дескрипторы:")] }),
                      new Paragraph({ children: [new TextRun("Называет тему")] }),
                      new Paragraph({ children: [new TextRun("Формулирует вопрос")] }),
                      new Paragraph({ children: [new TextRun("Метод: наблюдение")] }),
                    ],
                  }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun("Презентация")] })] }),
                ],
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun("Обычный абзац вне таблицы.")] }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

describe("импорт настоящего .docx", () => {
  it("читает шапку таблицы, строки и абзацы вне таблицы", async () => {
    const buf = await buildDocx();
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    const elements = parseBodyElements(xml);

    const table = elements.find((e) => e.type === "table");
    expect(table).toBeDefined();
    expect(table!.rows).toHaveLength(2);
    // 5 колонок, как в школьном шаблоне
    expect(table!.rows![0]).toHaveLength(5);
    expect(table!.rows![0]![0]).toBe("Этапы урока");
    expect(table!.rows![1]![0]).toContain("Начало урока");
    expect(table!.rows![1]![0]).toContain("Второй абзац этапа");
    // HTML-экранирование амперсанда декодировано
    expect(table!.rows![1]![1]).toBe("Приветствует & объясняет");

    const paragraph = elements.find((e) => e.type === "paragraph");
    expect(paragraph?.text).toBe("Обычный абзац вне таблицы.");
  });

  it("различает «Дескрипторы:» (заголовок) и сами дескрипторы", async () => {
    const buf = await buildDocx();
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    const table = parseBodyElements(xml).find((e) => e.type === "table")!;

    const parsed = parseAssessmentCell(table.rows![1]![3]!);
    // Заголовок блока не должен попасть в список дескрипторов
    expect(parsed.descriptors).not.toContain("Дескрипторы:");
    expect(parsed.descriptors).toContain("Называет тему");
    expect(parsed.descriptors).toContain("Формулирует вопрос");
    expect(parsed.assessmentMethod).toBe("наблюдение");
  });
});