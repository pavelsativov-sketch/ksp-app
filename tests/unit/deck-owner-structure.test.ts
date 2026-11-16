import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildDeckPptx } from "@/lib/export/deck-pptx";
import { blankSlide, parseOutline } from "@/lib/materials/deck";
import { descriptorPoints, parseBranch, splitThesis } from "@/lib/materials/deck-types";

describe("макеты по образцу учителя", () => {
  it("разбирает ветвь инфографики, тезис и баллы дескриптора", () => {
    expect(parseBranch("🌡️ Числовая форма: числа, температура")).toEqual({ icon: "🌡️", head: "Числовая форма", caption: "числа, температура" });
    expect(parseBranch("Текстовая форма — текст, сообщение")).toEqual({ icon: "", head: "Текстовая форма", caption: "текст, сообщение" });
    expect(splitThesis("Одна информация — разные формы")).toEqual(["Одна информация — ", "разные формы"]);
    expect(splitThesis("Виды информации")).toEqual(["Виды информации", ""]);
    expect(descriptorPoints("Задание 1. Определяет виды информации — 2 балла")).toEqual({ text: "Задание 1. Определяет виды информации", points: 2 });
    expect(descriptorPoints("Соотносит файлы (1 б.)")).toEqual({ text: "Соотносит файлы", points: 1 });
    expect(descriptorPoints("Приводит пример")).toEqual({ text: "Приводит пример", points: null });
  });

  it("ставит настрой и повторение в начало, оценивание перед рефлексией", () => {
    const raw = ["title", "infographic", "assessment", "groups", "review", "reflection", "mood", "activity", "homework"].map((kind) => ({ kind, title: `Слайд ${kind}`, points: ["пункт"] }));
    expect(parseOutline({ slides: raw }).map((slide) => slide.kind)).toEqual(["mood", "review", "title", "infographic", "groups", "activity", "assessment", "reflection", "homework"]);
  });

  it("не теряет слайды без заголовка: подставляет стандартный по типу и языку", () => {
    // У инфографики стандартного заголовка нет: её тезис пишет модель.
    const raw = ["goals", "reflection", "homework", "thanks", "infographic"].map((kind) => ({ kind, title: kind === "infographic" ? "Одна информация — разные формы" : "", points: ["пункт"] }));
    const ru = parseOutline({ slides: raw });
    expect(ru.map((slide) => slide.title)).toEqual(["Цели урока", "Одна информация — разные формы", "Рефлексия", "Домашнее задание", "Спасибо за урок!"]);
    expect(parseOutline({ slides: raw }, "kz").find((slide) => slide.kind === "homework")?.title).toBe("Үй тапсырмасы");
  });

  it("собирает новые слайды в PowerPoint с текстом ветвей, групп и итогом баллов", async () => {
    const deck = [
      blankSlide("review", "Повторение", { points: ["Что такое информация?", "Где мы её встречаем?"] }),
      blankSlide("infographic", "Одна информация — разные формы", { lead: "Погода", points: ["📝 Текстовая форма: сообщение", "🌡️ Числовая форма: температура", "🔊 Звуковая форма: прогноз по радио"], takeaway: "Содержание одно, формы разные." }),
      blankSlide("groups", "Групповая работа", { lead: "Разделитесь на 3 группы", points: ["Группа 1: найдите формы информации", "Группа 2: заполните схему"] }),
      blankSlide("assessment", "Оценивание", { points: ["Задание 1. Определяет виды информации — 2 балла", "Задание 2. Соотносит файлы — 3 балла"] }),
    ];
    const zip = await JSZip.loadAsync(await buildDeckPptx({ title: "T", slides: deck, theme: "lavender" }));
    const xml = (await Promise.all(zip.file(/^ppt\/slides\/slide\d+\.xml$/).map((file) => file.async("string")))).join("");
    expect(xml).toContain("Числовая форма");
    expect(xml).toContain("разные формы");
    expect(xml).toContain("Группа 2");
    expect(xml).toContain("Итого: 5 б.");
  });
});
