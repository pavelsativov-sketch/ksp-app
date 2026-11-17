import { describe, expect, it } from "vitest";
import { emptyKsp, type KspContent } from "@/lib/types/ksp";
import { kitAnswersSchema, toLessonKit } from "@/lib/materials/kit";
import { applyWorksheetAssessment, assessmentState, attachMaterial, pointsWord, worksheetAssessmentLines } from "@/lib/materials/kit-sync";
import { kspContentSchema } from "@/lib/validation/ksp";

const tasks = [
  { descriptor: "Находит числитель и знаменатель.", criterion: "", points: 2 },
  { descriptor: "", criterion: "Сравнивает дроби", points: 3 },
  { descriptor: "Рисует схему", criterion: "", points: 0 },
  { descriptor: "Решает задачу", criterion: "", points: 5 },
];

function plan(): KspContent {
  const base = { ...emptyKsp(), topic: "Дроби" };
  return {
    ...base,
    stages: {
      beginning: { ...base.stages.beginning, descriptors: ["Отвечает на вопросы — 1 балл", "Называет тему"] },
      middle: { ...base.stages.middle, descriptors: ["Выполняет задание 1 (2 балла)", "Работает в группе"] },
      end: { ...base.stages.end, descriptors: ["Оценивает себя: 1 балл"] },
    },
  };
}

describe("worksheet points into the KSP assessment", () => {
  it("writes one line per scored task, numbered as on the sheet", () => {
    expect(worksheetAssessmentLines(tasks, "ru")).toEqual([
      "Рабочий лист, задание 1: Находит числитель и знаменатель — 2 балла",
      "Рабочий лист, задание 2: Сравнивает дроби — 3 балла",
      "Рабочий лист, задание 4: Решает задачу — 5 баллов",
    ]);
    expect(worksheetAssessmentLines(tasks, "kz")[0]).toBe("Жұмыс парағы, тапсырма 1: Находит числитель и знаменатель — 2 балл");
    expect([1, 2, 5, 11, 21, 22].map((n) => pointsWord(n, "ru"))).toEqual(["балл", "балла", "баллов", "баллов", "балл", "балла"]);
  });

  it("makes the sheet the 10-point scale: replaces scored lines on its stage, strips points elsewhere", () => {
    const lines = worksheetAssessmentLines(tasks, "ru");
    const before = plan();
    const after = applyWorksheetAssessment(before, "middle", lines);
    expect(after.stages.middle.descriptors).toEqual(["Работает в группе", ...lines]);
    expect(after.stages.beginning.descriptors).toEqual(["Отвечает на вопросы", "Называет тему"]);
    expect(after.stages.end.descriptors).toEqual(["Оценивает себя"]);
    expect(before.stages.middle.descriptors).toHaveLength(2);
    expect(assessmentState(before, "middle", lines)).toBe("stale");
    expect(assessmentState(after, "middle", lines)).toBe("synced");
    expect(assessmentState(after, "middle", [])).toBe("none");
  });

  it("replaces old sheet lines when the sheet is regenerated", () => {
    const first = applyWorksheetAssessment(plan(), "middle", worksheetAssessmentLines(tasks, "ru"));
    const second = applyWorksheetAssessment(first, "middle", worksheetAssessmentLines([{ descriptor: "Новое", criterion: "", points: 10 }], "ru"));
    expect(second.stages.middle.descriptors).toEqual(["Работает в группе", "Рабочий лист, задание 1: Новое — 10 баллов"]);
  });
});

describe("attaching a material to a stage", () => {
  it("adds a material made from a tile to a lesson without a kit", () => {
    const content = attachMaterial(plan(), { kind: "crossword", stage: "end" }, "ru");
    expect(content.kit?.slots).toEqual([{ id: "slot_crossword", kind: "crossword", stage: "end", status: "ready", title: "Кроссворд по терминам урока" }]);
    expect(content.stages.end.resources).toContain("Кроссворд по терминам урока");
    expect(content.stages.end.activities).toEqual([{ form: "individual", title: "Кроссворд по терминам урока", slotId: "slot_crossword" }]);
    expect(kspContentSchema.parse(content).kit?.slots).toHaveLength(1);
  });

  it("moves an attached material to another stage and turns on its form of work", () => {
    const kit = toLessonKit(kitAnswersSchema.parse({ materials: ["worksheet"] }), "ru");
    const withKit = { ...plan(), kit };
    const moved = attachMaterial(attachMaterial(withKit, { kind: "group_cards", stage: "middle", title: "Карточки групповой работы (3)" }, "ru"), { kind: "group_cards", stage: "end" }, "ru");
    expect(moved.kit?.workForms).toContain("group");
    expect(moved.kit?.slots.find((s) => s.kind === "group_cards")?.stage).toBe("end");
    expect(moved.stages.middle.resources).not.toContain("Карточки групповой работы (3)");
    expect(moved.stages.middle.activities?.map((a) => a.slotId)).toEqual(["slot_worksheet"]);
    expect(moved.stages.end.activities?.map((a) => a.slotId)).toEqual(["slot_group_cards"]);
  });
});
