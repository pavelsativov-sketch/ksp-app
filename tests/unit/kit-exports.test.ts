import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { applyKitToDeck, blankSlide, deckFactsFromPlan } from "@/lib/materials/deck";
import { activityLine, applyKitToContent, kitAnswersSchema, kitSummaryRows, toLessonKit } from "@/lib/materials/kit";
import { worksheetDeckPoints } from "@/lib/materials/kit-sync";
import { buildKspDocx } from "@/lib/export/docx";
import { emptyKsp, type LessonPlanRow } from "@/lib/types/ksp";

const kitGroup = toLessonKit(kitAnswersSchema.parse({ workForms: ["individual", "group"], groups: 3, oop: { present: true, needs: ["zpr"] }, minutes: 40, materials: ["worksheet", "group_cards", "deck"] }), "ru");

function plan(kit = kitGroup): LessonPlanRow {
  const content = applyKitToContent({ ...emptyKsp(), topic: "Дроби" }, kit);
  return {
    id: "64b7f0c2a1b2c3d4e5f60718", owner_id: "u1", title: "Математика: Дроби", subject_id: null, grade: 5, quarter: null, section: null,
    content, visibility: "private", language: "ru", created_at: "2026-11-17T00:00:00.000Z", updated_at: "2026-11-17T00:00:00.000Z",
  } as LessonPlanRow;
}

const slides = () => [
  blankSlide("title", "Дроби"),
  blankSlide("groups", "Групповая работа", { lead: "Делимся на группы", points: ["Группа 1: что-то придуманное"], notes: "Раздайте карточки" }),
  blankSlide("activity", "Индивидуальная работа"),
  blankSlide("assessment", "Оценивание", { points: ["Выдуманный дескриптор — 4 балла"] }),
  blankSlide("reflection", "Рефлексия"),
];

describe("presentation from the lesson kit", () => {
  it("shows the real group cards and the worksheet points, keeping the teacher notes", () => {
    const facts = deckFactsFromPlan(plan(), {
      groups: { mode: "group", cards: [{ title: "Пицца на троих", tasks: ["Раздели"] }, { title: "Шоколадка", tasks: [] }] },
      assessment: worksheetDeckPoints([{ descriptor: "Находит числитель", criterion: "", points: 4 }, { descriptor: "Сравнивает", criterion: "", points: 6 }], "ru"),
    });
    const out = applyKitToDeck(slides(), facts, "ru");
    const groups = out.find((s) => s.kind === "groups")!;
    expect(groups.points).toEqual(["Группа 1: Пицца на троих", "Группа 2: Шоколадка"]);
    expect(groups.notes).toBe("Раздайте карточки");
    expect(groups.lead).toBe("Делимся на группы");
    expect(out.find((s) => s.kind === "assessment")!.points).toEqual(["Задание 1. Находит числитель — 4 балла", "Задание 2. Сравнивает — 6 баллов"]);
    expect(out.at(-1)?.kind).toBe("reflection");
  });

  it("names the slide for pairs and adds it when the model forgot it", () => {
    const facts = deckFactsFromPlan(plan(), { groups: { mode: "pair", cards: [{ title: "Пара А", tasks: [] }] } });
    const out = applyKitToDeck(slides().filter((s) => s.kind !== "groups"), facts, "ru");
    const at = out.findIndex((s) => s.kind === "groups");
    expect(out[at]).toMatchObject({ title: "Парная работа", points: ["Пара 1: Пара А"] });
    expect(out[at + 1].kind).toBe("activity");
  });

  it("drops the group slide for an individual-only lesson, but keeps it for lessons without a kit", () => {
    const solo = toLessonKit(kitAnswersSchema.parse({ workForms: ["individual"], materials: ["worksheet"] }), "ru");
    expect(applyKitToDeck(slides(), deckFactsFromPlan(plan(solo), {}), "ru").some((s) => s.kind === "groups")).toBe(false);
    const noKit = { ...plan(), content: { ...emptyKsp(), topic: "Дроби" } };
    expect(applyKitToDeck(slides(), deckFactsFromPlan(noKit, {}), "ru").some((s) => s.kind === "groups")).toBe(true);
  });
});

describe("KSP Word from the lesson kit", () => {
  it("summarises the kit for the header and names stage activities", () => {
    expect(kitSummaryRows(kitGroup)).toEqual([
      ["Формы работы", "Индивидуальная, групповая (3 группы)"],
      ["Ученики с ООП", "есть: ЗПР"],
      ["Длительность урока", "40 мин"],
    ]);
    expect(activityLine({ form: "group", title: "Карточки групповой работы (3 группы)" })).toBe("Групповая работа: Карточки групповой работы (3 группы)");
  });

  it("puts the kit rows and stage activities into the document", async () => {
    const zip = await JSZip.loadAsync(await buildKspDocx(plan()));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Формы работы");
    expect(xml).toContain("Индивидуальная, групповая (3 группы)");
    expect(xml).toContain("есть: ЗПР");
    expect(xml).toContain("Групповая работа: Карточки групповой работы (3 группы)");
    expect(xml).toContain("Индивидуальная работа: Рабочий лист (индивидуальная работа, 10 баллов)");
  });
});
