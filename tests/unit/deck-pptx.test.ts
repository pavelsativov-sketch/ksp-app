import { writeFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { addAnimations, buildDeckPptx, timingXml } from "@/lib/export/deck-pptx";
import { blankSlide, outlineFromPlan, parseOutline } from "@/lib/materials/deck";
import { emptyKsp, type LessonPlanRow } from "@/lib/types/ksp";

const slides = [
  blankSlide("title", "Нейронные сети", { lead: "11 класс" }),
  blankSlide("mood", "Психологический настрой", { points: ["Не бойся сложных задач", "Маленькие усилия каждый день", "Ошибайся и пробуй снова", "Не сравнивай себя с другими", "Знания превращай в умения", "Новый шанс стать сильнее"] }),
  blankSlide("guess", "Определи тему урока", { points: ["Что на картинке?", "Что общего?"] }),
  blankSlide("goals", "Цели урока", { points: ["Понять устройство сети", "Различать слои", "Сравнивать персептроны"] }),
  blankSlide("flow", "Нейронная сеть работает как конвейер обработки данных", { lead: "ИНС это вычислительная модель, вдохновлённая мозгом.", steps: ["Данные", "ИНС (обработка)", "Результат"], points: ["Получает входные данные", "Обрабатывает их", "Выявляет закономерности", "Формирует результат"] }),
  blankSlide("list", "Скрытый слой выполняет основную вычислительную работу", { points: ["Получает данные от входного слоя", "Преобразует информацию", "Ищет закономерности", "Передаёт результат дальше"], takeaway: "СКРЫТЫЙ СЛОЙ = ОБРАБОТКА ДАННЫХ" }),
  blankSlide("cards", "Где это используется", { points: ["Распознавание лиц", "Перевод текста", "Прогноз погоды", "Рекомендации фильмов"] }),
  blankSlide("question", "Почему сети нужны скрытые слои?", { points: ["Для сложных задач", "Чтобы искать признаки"] }),
  blankSlide("quiz", "Какой слой получает исходные данные?", { options: ["Входной", "Скрытый", "Выходной", "Синапс"], correctIndex: 0, notes: "Спросите двух учеников." }),
  blankSlide("activity", "Индивидуальная работа", { lead: "10 минут, рабочий лист", points: ["Соотнеси термины", "Вставь пропуски", "Заполни таблицу"] }),
  blankSlide("reflection", "Рефлексия", { points: ["Всё понял", "Есть вопросы", "Нужна помощь"] }),
  blankSlide("homework", "Домашнее задание", { points: ["Составь схему сети из 3 слоёв и подпиши элементы"] }),
  blankSlide("thanks", "Спасибо за урок!", { lead: "Сегодня мы узнали, как устроена нейронная сеть." }),
];

async function slideXml(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  return Promise.all(zip.file(/^ppt\/slides\/slide\d+\.xml$/).map((file) => file.async("string")));
}

describe("buildDeckPptx", () => {
  it("каждый слайд с переходом, а элементы появляются по очереди", async () => {
    const xml = await slideXml(await buildDeckPptx({ title: "T", slides, theme: "network" }));
    expect(xml).toHaveLength(slides.length);
    for (const slide of xml) expect(slide).toContain("<p:transition");
    expect(xml.filter((slide) => slide.includes("<p:timing>")).length).toBeGreaterThan(10);
  });

  it("верный ответ теста появляется по клику", async () => {
    const xml = (await slideXml(await buildDeckPptx({ title: "T", slides, theme: "lavender" }))).join("");
    expect(xml).toContain('nodeType="clickEffect"');
    expect(xml).toContain("✓  Входной");
  });

  it("автоподбор текста не дублируется, иначе PowerPoint не откроет файл", async () => {
    const xml = (await slideXml(await buildDeckPptx({ title: "T", slides, theme: "ocean" }))).join("");
    expect(xml).not.toMatch(/<a:normAutofit\/>\s*<a:normAutofit\/>/);
  });

  it("id анимаций уникальны", () => {
    const ids = [...timingXml([2, 3], [4]).matchAll(/<p:cTn id="(\d+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("слайд без подходящих объектов не ломается", async () => {
    await expect(addAnimations(await buildDeckPptx({ title: "T", slides: [blankSlide("goals", "Пусто")], theme: "sunset" }))).resolves.toBeInstanceOf(Buffer);
  });

  const PIXEL = { base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", mimeType: "image/png" };
  const images = new Map([slides[0], slides[1], slides[2], slides[5]].map((slide) => [slide!.id, PIXEL]));

  it("картинка попадает в файл и участвует в анимации", async () => {
    const buffer = await buildDeckPptx({ title: "T", slides, theme: "network" }, { images });
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file(/^ppt\/media\//).length).toBeGreaterThan(0);
    expect((await slideXml(buffer)).join("")).toContain('name="auto-img"');
  });

  it.skipIf(!process.env.RENDER_OUT)("файл для проверки в PowerPoint", async () => {
    writeFileSync(`${process.env.RENDER_OUT}/deck.pptx`, await buildDeckPptx({ title: "Нейронные сети", slides, theme: "network" }, { images }));
  });
});

describe("черновик презентации", () => {
  it("null, объекты и длинный текст не губят слайд", () => {
    const slide = { kind: "flow", title: "Т".repeat(300), lead: null, steps: [{ text: "Данные" }, "Результат"], points: null, takeaway: null, options: null, correctIndex: null, notes: null, imagePrompt: null };
    const [first] = parseOutline({ slides: Array.from({ length: 5 }, () => slide) });
    expect(first!.title).toHaveLength(200);
    expect(first!.steps).toEqual(["Данные", "Результат"]);
    expect(first!.correctIndex).toBeNull();
  });

  it("плохой слайд отбрасывается, остальные остаются", () => {
    const good = Array.from({ length: 5 }, () => ({ kind: "goals", title: "Цели", points: ["Понять"] }));
    expect(parseOutline({ slides: [...good, { kind: "нет такого", title: "x" }] })).toHaveLength(5);
  });

  it("шаги задания становятся пунктами, цвет убирается из подписи, финал идёт в конце", () => {
    const parsed = parseOutline({
      slides: [
        { kind: "title", title: "Тема" },
        { kind: "reflection", title: "Рефлексия", points: ["Зелёный: всё понятно", "Красный: нужна помощь"] },
        { kind: "activity", title: "Работа", steps: ["Нарисуй", "Подпиши"] },
        { kind: "homework", title: "Дома", points: ["Таблица"] },
        { kind: "list", title: "Отличия", points: ["Стенка"] },
      ],
    });
    expect(parsed.map((slide) => slide.kind)).toEqual(["title", "activity", "list", "reflection", "homework"]);
    expect(parsed[1]!.points).toEqual(["Нарисуй", "Подпиши"]);
    expect(parsed[3]!.points).toEqual(["всё понятно", "нужна помощь"]);
  });

  it("запасной черновик строится из плана без ИИ", () => {
    const content = emptyKsp();
    content.topic = "Дроби";
    content.lessonObjectives = ["Складывать дроби"];
    const plan = { id: "1", title: "T", grade: 5, language: "ru", content } as unknown as LessonPlanRow;
    const kinds = outlineFromPlan(plan).map((slide) => slide.kind);
    expect(kinds[0]).toBe("title");
    expect(kinds).toContain("reflection");
    expect(kinds.at(-1)).toBe("thanks");
  });
});
