/**
 * Проверка качества презентации.
 *
 * Что ломает показ на проекторе и не видно в ZIP: текст выходит за нижний
 * край, подсказка наезжает на водяной знак, водяной знак не читается на
 * тёмном фоне, казахский план получает русские подписи, пустые этапы
 * создают мусорные слайды, при 20+ слайдах нет ориентиров.
 */

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { buildKspPptx } from "@/lib/export/pptx";
import { emptyKsp } from "@/lib/types/ksp";
import type { LessonPlanRow } from "@/lib/types/ksp";

/** Высота слайда LAYOUT_WIDE, дюймы. */
const SLIDE_HEIGHT = 7.5;

function makePlan(overrides: Partial<LessonPlanRow["content"]> = {}): LessonPlanRow {
  const content = { ...emptyKsp(), ...overrides };
  return {
    id: "p1",
    userId: "u1",
    title: content.topic || "Дроби",
    content,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as LessonPlanRow;
}

async function slides(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter(
    (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name),
  );
  return Promise.all(names.sort().map((name) => zip.files[name].async("string")));
}

/** Число слайдов. */
async function slideCount(buffer: Buffer): Promise<number> {
  return (await slides(buffer)).length;
}

/**
 * Все прямоугольники текста слайда: x, y, w, h в дюймах.
 * Разбирается из XML, потому что переполнение видно только по координатам.
 */
function textBoxes(xml: string): { x: number; y: number; w: number; h: number }[] {
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  // off x=… y=…, ext cx=… cy=…
  const pattern =
    /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const emu = 914400;
    boxes.push({
      x: Number(match[1]) / emu,
      y: Number(match[2]) / emu,
      w: Number(match[3]) / emu,
      h: Number(match[4]) / emu,
    });
  }
  return boxes;
}

describe("презентация не выходит за край слайда", () => {
  it("ни один блок текста не выходит за границы слайда", async () => {
    const plan = makePlan({
      // Длинные цели и критерии — обычное дело, и именно они раньше
      // вылезали за нижний край.
      lessonObjectives: Array.from(
        { length: 12 },
        (_, i) => `Цель ${i + 1}: ученик объясняет понятие дроби и применяет его в решении задач повышенной сложности с обоснованием выбора способа`,
      ),
      assessmentCriteria: Array.from(
        { length: 12 },
        (_, i) => `Критерий ${i + 1}: приводит конкретный пример по теме и проверяет его правильность`,
      ),
      stages: {
        ...emptyKsp().stages,
        end: {
          ...emptyKsp().stages.end,
          reflectionQuestions: Array.from({ length: 6 }, (_, i) => `Вопрос для рефлексии номер ${i + 1}`),
          homework: "Домашнее задание: ".repeat(20),
        },
      },
    });

    const buffer = await buildKspPptx(plan);
    for (const [index, xml] of (await slides(buffer)).entries()) {
      for (const box of textBoxes(xml)) {
        expect(box.y + box.h, `слайд ${index + 1}: блок ниже края`).toBeLessThanOrEqual(SLIDE_HEIGHT + 0.01);
        expect(box.x + box.w, `слайд ${index + 1}: блок правее края`).toBeLessThanOrEqual(13.34);
      }
    }
  });

  it("основной текст слайда помечен на автоподгонку", async () => {
    const buffer = await buildKspPptx(
      makePlan({ lessonObjectives: ["Цель 1", "Цель 2"] }),
    );
    // `normAutofit` — указание PowerPoint уменьшить кегль. Без него длинный
    // текст просто обрезался краем слайда.
    const xml = (await slides(buffer)).join("");
    expect(xml).toContain("normAutofit");
  });
});

describe("оформление слайдов", () => {
  it("подсказка задания не наезжает на водяной знак", async () => {
    const content = emptyKsp();
    content.stages.middle.tasks = [
      {
        id: "t1",
        type: "MCQ",
        question: "Вопрос?",
        options: ["а", "б"],
        correctIndex: 0,
        points: 1,
        hint: "Подсказка к заданию",
      },
    ] as never;

    const buffer = await buildKspPptx(makePlan({ stages: content.stages }), { watermark: true });
    const found = (await slides(buffer)).map(textBoxes);
    const taskSlide = found.find(
      (boxes) => boxes.length > 3 && boxes.some((b) => b.y > 6 && b.y < 6.8),
    );
    expect(taskSlide, "слайд с подсказкой найден").toBeTruthy();
    const hint = taskSlide!.find((b) => b.y > 6 && b.y < 6.8)!;
    const marks = found.flat().filter((b) => b.y >= 6.9);
    for (const mark of marks) {
      const overlapX = Math.min(hint.x + hint.w, mark.x + mark.w) - Math.max(hint.x, mark.x);
      const overlapY = Math.min(hint.y + hint.h, mark.y + mark.h) - Math.max(hint.y, mark.y);
      // Прямоугольники не должны пересекаться ни по вертикали, ни по горизонтали.
      expect(overlapY > 0 && overlapX > 0, "подсказка и водяной знак не пересекаются").toBe(false);
    }
  });

  it("водяной знак и номера слайдов есть на каждом слайде", async () => {
    const buffer = await buildKspPptx(makePlan(), { watermark: true });
    for (const xml of await slides(buffer)) {
      expect(xml).toContain("Создано в Mekty");
    }
    // Номера: при нескольких слайдах учитель ориентируется по порядку.
    expect((await slides(buffer)).length).toBeGreaterThan(1);
    const first = await slides(buffer);
    expect(first[0]).toContain("1 /");
  });

  it("пустой этап не создаёт слайд", async () => {
    const empty = emptyKsp();
    const withStages = await buildKspPptx(makePlan({ stages: empty.stages }));
    // План без содержания этапов: титул + финал и ничего между ними.
    expect(await slideCount(withStages)).toBe(2);

    const filled = emptyKsp();
    filled.stages.middle.keyQuestions = ["Что мы уже знаем о дробях?"];
    const withContent = await buildKspPptx(makePlan({ stages: filled.stages }));
    expect(await slideCount(withContent)).toBe(3);
  });
});

describe("язык презентации", () => {
  it("казахский план получает казахские подписи", async () => {
    const content = emptyKsp();
    content.stages.middle.keyQuestions = ["Қандай білеміз?"];
    // Язык — поле строки плана, а не содержимого: содержимое на этом шаге
    // пустое, и подпись выбирается по строке.
    const plan = {
      ...makePlan({ stages: content.stages }),
      language: "kz" as const,
    } as LessonPlanRow;

    const buffer = await buildKspPptx(plan);
    const xml = (await slides(buffer)).join("");
    expect(xml).toContain("Сабақтың ортасы");
    expect(xml).not.toContain("Середина урока");
  });

  it("на титуле нет строки «undefined»", async () => {
    // План без класса и раздела: раньше подзаголовок печатал «undefined класс».
    const buffer = await buildKspPptx(makePlan({ topic: "Дроби" }));
    const xml = (await slides(buffer))[0];
    expect(xml).not.toContain("undefined");
    expect(xml).not.toContain("NaN");
  });

  it("русский план сохраняет русские подписи", async () => {
    const content = emptyKsp();
    content.stages.middle.keyQuestions = ["Что мы уже знаем о дробях?"];
    const buffer = await buildKspPptx(makePlan({ stages: content.stages }));
    const xml = (await slides(buffer)).join("");
    expect(xml).toContain("Середина урока");
  });

  it("буквы вариантов идут по алфавиту с Ә", async () => {
    const content = emptyKsp();
    content.stages.middle.tasks = [
      {
        id: "t1",
        type: "MCQ",
        question: "Выберите вариант",
        options: ["первый", "второй", "третий"],
        correctIndex: 0,
        points: 1,
      },
    ] as never;
    const buffer = await buildKspPptx(makePlan({ stages: content.stages }));
    const xml = (await slides(buffer)).join("");
    expect(xml).toContain("А. первый");
    expect(xml).toContain("Ә. второй");
  });
});

describe("слайд сопоставления", () => {
  it("колонки подписаны, иначе ученик не понимает задание", async () => {
    const content = emptyKsp();
    content.stages.middle.tasks = [
      {
        id: "t1",
        type: "MATCHING",
        question: "Соедините",
        left: ["влево1", "влево2"],
        right: ["вправо1", "вправо2"],
        pairs: [[0, 0], [1, 1]],
        points: 2,
      },
    ] as never;

    const buffer = await buildKspPptx(makePlan({ stages: content.stages }));
    const xml = (await slides(buffer)).join("");
    expect(xml).toContain("Слева");
    expect(xml).toContain("Справа");
  });
});
