/**
 * Проверка: собирает рабочий лист по образцу и смотрит, что в docx попали
 * сплошной банк слов, высокие ячейки таблицы, пронумерованные линии и
 * финальная курсивная строка.
 *
 * Запуск: npx vitest run scripts/verify-handout-visual.ts
 * или напрямую: npx tsx scripts/verify-handout-visual.ts
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildHandoutDocx } from "@/lib/handouts/docx";
import type { Worksheet, WorksheetTask } from "@/lib/handouts/types";

const task = (over: Partial<WorksheetTask>): WorksheetTask => ({
  prompt: "",
  criterion: "c",
  descriptor: "d",
  points: 1,
  stage: "middle",
  ...over,
} as WorksheetTask);

const worksheet: Worksheet = {
  kind: "worksheet",
  title: "Личная безопасность и роль сервисных программ в ней",
  intro: "Работай с терминами и распредели их по двум направлениям.",
  metaLine: "ФИО ученика: ____ Класс: ____ Дата: ____",
  tasks: [
    task({
      type: "sort",
      prompt: "Задание 1. Распредели элементы по двум направлениям.",
      criterion: "Распределяет термины по двум группам",
      descriptor: "Все термины распределены верно",
      points: 5,
      groups: ["Защита учётной записи", "Защита компьютера и данных"],
      items: [
        "надёжный пароль", "двухфакторная аутентификация", "сложный пароль",
        "уникальный пароль", "специальные символы", "одноразовый код",
        "подтверждение входа", "защита аккаунта", "антивирус", "проверка файлов",
        "удаление вредоносных программ", "обновление антивируса", "архивация данных",
        "сжатие файлов", "ZIP", "RAR", "резервная копия", "облачное хранилище",
        "внешний диск", "восстановление данных", "защита файлов",
      ],
      expectedAnswer: "Группа А: надёжный пароль, …; Группа Б: антивирус, …",
    }),
    task({
      type: "open",
      prompt: "Задание 2. Перечисли требования к надёжному паролю.",
      criterion: "Перечисляет требования",
      descriptor: "Названо не менее 4 требований",
      points: 3,
      expectedAnswer: "Длина, спецсимволы, уникальность…",
    }),
    task({
      type: "creative",
      prompt: "Придумай пример надёжного пароля:",
      criterion: "Придумывает пример",
      descriptor: "Пароль соответствует требованиям",
      points: 2,
      expectedAnswer: "Ksp#2026!Ok",
    }),
  ],
};

async function documentXml(): Promise<string> {
  const buffer = await buildHandoutDocx(worksheet, {
    showPageNumbers: true,
    showHeader: true,
    showFooter: true,
  });
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("word/document.xml отсутствует в docx");
  return file.async("string");
}

describe("рабочий лист по образцу", () => {
  it("банк слов идёт сплошным списком через тире, без нумерации", async () => {
    const xml = await documentXml();
    const text = xml
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
    expect(text).toContain("Слова для распределения:");
    expect(text).toContain("надёжный пароль");
    expect(text).toContain("защита файлов");
    // Прежний формат нумеровал слова — в образце этого нет.
    expect(text).not.toContain("1. надёжный пароль");
    // Разделитель между терминами — тире, как в образце.
    expect(text).toMatch(/надёжный пароль\s*-\s*двухфакторная аутентификация/);
  });

  it("в таблице распределения стоят реальные направления и высокие ячейки", async () => {
    const xml = await documentXml();
    expect(xml).toContain("Защита учётной записи");
    expect(xml).toContain("Защита компьютера и данных");
    // Высота ячейки выросла с 480 до 1200 twips — иначе вписать нельзя.
    expect(xml).toContain('w:hRule="atLeast"');
    const heights = [...xml.matchAll(/<w:trHeight w:val="(\d+)"/g)].map((m) => Number(m[1]));
    expect(heights.some((h) => h >= 1000)).toBe(true);
    // Прежние ячейки содержали «№: » — в образце их нет.
    expect(xml).not.toContain("№: ");
  });

  it("задания на письменный ответ дают пронумерованные линии", async () => {
    const xml = await documentXml();
    const text = xml.replace(/<[^>]+>/g, "");
    expect(text).toContain("1");
    expect(text).toContain("5");
  });

  it("creative-задание выводится финальной курсивной строкой один раз", async () => {
    const xml = await documentXml();
    const text = xml.replace(/<[^>]+>/g, "");
    const needle = "Придумай пример надёжного пароля";
    const occurrences = text.split(needle).length - 1;
    expect(occurrences).toBe(1);
  });
});
