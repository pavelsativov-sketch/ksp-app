import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildHandoutDocx } from "@/lib/handouts/docx";
import type { Worksheet } from "@/lib/handouts/types";

/**
 * Регрессия по watermark.
 *
 * Колонтитулы собирались в массив, а в документ попадал только `footers[0]`.
 * При включённом футере (значение по умолчанию) это означало, что пометка
 * «бесплатный тариф» молча исчезала — то есть Free-тариф печатал чистый
 * документ. Разбираем настоящий ZIP, а не доверяем коду.
 */
const sheet: Worksheet = {
  kind: "worksheet",
  title: "Дроби — 7 класс",
  intro: "Работа по теме «Дроби».",
  metaLine: "ФИО ученика: ____ Класс: 7 Дата: ____",
  tasks: [
    {
      type: "sort",
      prompt: "Распредели элементы по двум направлениям.",
      criterion: "Разнесено верно",
      descriptor: "Все термины в своей колонке",
      points: 4,
      stage: "middle",
      groups: ["Понятия", "Примеры"],
      items: ["Понятие 1", "Понятие 2", "Пример 1", "Пример 2", "Понятие 3", "Пример 3", "Понятие 4", "Пример 4"],
      expectedAnswer: "Понятия: 1,2,5,7",
    },
  ],
};

async function footerTexts(docx: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docx);
  const names = Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n));
  const parts: string[] = [];
  for (const name of names) {
    const xml = await zip.file(name)!.async("string");
    parts.push(xml);
  }
  return parts.join("\n");
}

describe("buildHandoutDocx: watermark не теряется", () => {
  it("печатает пометку бесплатного тарифа вместе с номерами страниц", async () => {
    const docx = await buildHandoutDocx(sheet, { watermark: true, showPageNumbers: true });
    const text = await footerTexts(docx);
    expect(text).toContain("PAGE"); // нумерация страниц на месте
    expect(text).toMatch(/бесплатн/i);
  });

  it("печатает пометку даже при выключенной нумерации страниц", async () => {
    const docx = await buildHandoutDocx(sheet, { watermark: true, showPageNumbers: false });
    expect(await footerTexts(docx)).toMatch(/бесплатн/i);
  });

  it("не оставляет пометку на Pro-тарифе", async () => {
    const docx = await buildHandoutDocx(sheet, { watermark: false, showPageNumbers: true });
    expect(await footerTexts(docx)).not.toMatch(/бесплатн/i);
  });

  it("не создаёт пустой header.xml, когда нет школы и учителя", async () => {
    const docx = await buildHandoutDocx(sheet, { watermark: false });
    const zip = await JSZip.loadAsync(docx);
    const headerNames = Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n));
    for (const name of headerNames) {
      const xml = await zip.file(name)!.async("string");
      // header1.xml всегда содержит хотя бы один пустой <w:p/>: это нормально
      // для Word. Проверяем, что в нём нет НИКАКОГО текста.
      expect(xml.replace(/<[^>]+>/g, "").trim()).toBe("");
    }
  });
});