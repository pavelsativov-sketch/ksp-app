import { describe, expect, it } from "vitest";
import { oralPrompt, toOopSheet } from "@/lib/handouts/oop";
import type { Worksheet, WorksheetTask } from "@/lib/handouts/types";

const task = (patch: Partial<WorksheetTask>): WorksheetTask => ({ type: "open", prompt: "", criterion: "", descriptor: "", points: 1, ...patch });

const sheet: Worksheet = {
  kind: "worksheet",
  language: "ru",
  title: "Информация вокруг нас",
  intro: "",
  metaLine: "",
  tasks: [
    task({ type: "open", prompt: "Рассмотри объекты. Определи и запиши виды представленной информации.", points: 3 }),
    task({ type: "fill", prompt: "Код состоит из цифр ___ и ___.", expectedAnswer: "1; 0", points: 2 }),
    task({ type: "multiple_choice", prompt: "Какой вид у marks.xlsx?", options: ["Текстовая", "Звуковая", "Графическая", "Числовая"], correctIndex: 3, points: 1 }),
    task({ type: "match", prompt: "Соедини", options: ["a", "b", "c", "d", "e"], pairs: ["A", "B", "C", "D", "E"], points: 2 }),
    task({ type: "true_false", prompt: "Видео содержит звук.", correctIndex: 0, points: 1 }),
    task({ type: "reflection", prompt: "Как прошёл урок?", points: 0 }),
  ],
};

describe("toOopSheet", () => {
  const oop = toOopSheet(sheet);

  it("keeps the title, marks the sheet and leaves at most four tasks plus reflection", () => {
    expect(oop.title).toBe(sheet.title);
    expect(oop.oop).toBe(true);
    expect(oop.tasks.map((t) => t.type)).toEqual(["open", "fill_bank", "multiple_choice", "match", "reflection"]);
  });

  it("turns a written answer into an oral one, as in the owner's sample", () => {
    expect(oop.tasks[0]).toMatchObject({ oral: true, prompt: "Рассмотри объекты. Определи и расскажи виды представленной информации." });
    expect(oralPrompt("Объясни, зачем нужна стенка.", "ru")).toBe("Расскажи устно: объясни, зачем нужна стенка.");
    expect(oralPrompt("Жауабын жаз.", "kz")).toBe("Ауызша: Жауабын жаз.");
  });

  it("gives blanks a word bank and cuts options and pairs but keeps the right answer", () => {
    expect(oop.tasks[1]!.wordBank).toEqual(["0", "1"]);
    const choice = oop.tasks[2]!;
    expect(choice.options).toHaveLength(3);
    expect(choice.options![choice.correctIndex!]).toBe("Числовая");
    expect(oop.tasks[3]!.pairs).toEqual(["A", "B", "C", "D"]);
  });

  it("does not change the main sheet", () => {
    expect(sheet.tasks[0]!.prompt).toContain("запиши");
    expect(sheet.tasks).toHaveLength(6);
  });
});
