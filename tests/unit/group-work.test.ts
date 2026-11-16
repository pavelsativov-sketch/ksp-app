import { describe, expect, it } from "vitest";
import { parseGroupWork, withoutBlankChain } from "@/lib/handouts/group-work";

const card = (title: string, tasks = 5) => ({
  title,
  situation: ["Али готовился к олимпиаде.", "Он отправил решение учителю через мессенджер."],
  tasks: Array.from({ length: tasks }, (_, i) => ({ text: `Задание ${i + 1} по тексту ситуации`, schema: i === 3 ? ["Источник", "Канал связи", "Приёмник"] : null })),
  value: "Трудолюбие помогает достигать высоких результатов.",
  note: "Всё получится!",
  slogan: "Учись с упорством!",
  imagePrompt: "A boy studying at a desk with a laptop",
});

const input = { count: 2, mode: "group" as const, language: "ru" as const, topic: "Информация вокруг нас" };

describe("parseGroupWork", () => {
  it("reads cards wrapped in prose and keeps the schema only where the model gave one", () => {
    const raw = `Вот карточки:\n${JSON.stringify({ cards: [card("Шаг за шагом"), card("Работа должна быть качественной", 6)] })}`;
    const work = parseGroupWork(raw, input);
    expect(work).toMatchObject({ kind: "group", mode: "group", topic: "Информация вокруг нас" });
    expect(work.cards).toHaveLength(2);
    expect(work.cards[1]!.tasks).toHaveLength(5);
    expect(work.cards[0]!.tasks[3]!.schema).toEqual(["Источник", "Канал связи", "Приёмник"]);
    expect(work.cards[0]!.tasks[0]).not.toHaveProperty("schema");
  });

  it("drops the blank chain from a task whose schema is drawn as plaques", () => {
    expect(withoutBlankChain("Заполни пропуски в схеме передачи информации: ________ → ________ → ________")).toBe("Заполни пропуски в схеме передачи информации.");
    expect(withoutBlankChain("Определите источник и приёмник. Заполните схему.")).toBe("Определите источник и приёмник. Заполните схему.");
  });

  it("keeps a card whose model answer missed the picture, note or slogan", () => {
    const bare: Record<string, unknown> = { ...card("Без картинки") };
    delete bare.imagePrompt;
    delete bare.note;
    delete bare.slogan;
    const work = parseGroupWork(JSON.stringify({ cards: [card("Полная"), bare] }), input);
    expect(work.cards[1]).toMatchObject({ title: "Без картинки", imagePrompt: "", note: "", slogan: "" });
  });

  it("rejects too few cards or a card without enough tasks, so the next provider is tried", () => {
    expect(() => parseGroupWork(JSON.stringify({ cards: [card("Одна")] }), input)).toThrow();
    expect(() => parseGroupWork(JSON.stringify({ cards: [card("Мало", 3), card("Ок")] }), input)).toThrow();
  });
});
