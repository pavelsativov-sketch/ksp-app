import { describe, expect, it } from "vitest";
import { applyKitToContent, kitAnswersSchema, kitMaterials, kitPromptSection, toLessonKit } from "@/lib/materials/kit";
import { buildUserPrompt } from "@/lib/ai/prompt";
import { emptyKsp } from "@/lib/types/ksp";
import { kspContentSchema } from "@/lib/validation/ksp";

const answers = (patch: Record<string, unknown> = {}) => kitAnswersSchema.parse(patch);

describe("lesson kit", () => {
  it("defaults to an individual lesson with a worksheet and a presentation", () => {
    const kit = toLessonKit(answers(), "ru");
    expect(kit.workForms).toEqual(["individual"]);
    expect(kit.minutes).toBe(45);
    expect(kit.slots.map((slot) => [slot.kind, slot.stage])).toEqual([["deck", "beginning"], ["worksheet", "middle"]]);
  });

  it("keeps group and pair cards only when that form of work is chosen", () => {
    const materials = ["worksheet", "group_cards", "pair_cards"] as const;
    expect(kitMaterials(answers({ materials, workForms: ["individual"] }))).toEqual(["worksheet"]);
    expect(kitMaterials(answers({ materials, workForms: ["individual", "group"] }))).toEqual(["group_cards", "worksheet"]);
  });

  it("adds the OOP sheet only for a pupil with OOP and a worksheet", () => {
    const oop = { present: true, needs: ["zpr"] };
    expect(kitMaterials(answers({ materials: ["worksheet", "oop_sheet"], oop }))).toContain("oop_sheet");
    expect(kitMaterials(answers({ materials: ["oop_sheet"], oop }))).not.toContain("oop_sheet");
    expect(kitMaterials(answers({ materials: ["worksheet", "oop_sheet"] }))).not.toContain("oop_sheet");
    expect(toLessonKit(answers({ oop: { ...oop, notes: "быстро устаёт" } }), "ru").oop).toEqual({ present: true, notes: "ЗПР, быстро устаёт" });
  });

  it("tells the model about groups, OOP, 40 minutes, value and materials by stage", () => {
    const kit = toLessonKit(answers({
      workForms: ["individual", "group"], groups: 4, minutes: 40, value: "Закон и порядок",
      oop: { present: true, needs: ["vision"] }, materials: ["worksheet", "oop_sheet", "group_cards", "crossword", "deck"],
    }), "ru");
    const text = kitPromptSection(kit);
    expect(text).toContain("ровно 4 группы");
    expect(text).toContain("«1–8 мин», «9–32 мин», «33–40 мин»");
    expect(text).toContain("Ученик с ООП: …");
    expect(text).toContain("нарушение зрения");
    expect(text).toContain("«Закон и порядок»");
    expect(text).toMatch(/Начало урока \(beginning\): «Кроссворд по терминам урока»/);
    expect(text).toMatch(/Середина урока \(middle\): «Карточки групповой работы \(4 группы\)»; «Рабочий лист/);
  });

  it("drops the default worksheet line from the prompt when the kit has no worksheet", () => {
    const base = { grade: 5, subject: "Математика", topic: "Дроби", language: "ru" as const };
    expect(buildUserPrompt(base)).toContain("В middle обязательно предусмотрите рабочий лист");
    const prompt = buildUserPrompt({ ...base, kit: toLessonKit(answers({ materials: ["deck"] }), "ru") });
    expect(prompt).not.toContain("В middle обязательно предусмотрите рабочий лист");
    expect(prompt).toContain("Рабочего листа на этом уроке нет");
  });

  it("links stages to the kit materials and survives plan validation", () => {
    const kit = toLessonKit(answers({ workForms: ["individual", "pair"], materials: ["worksheet", "pair_cards", "flashcards", "deck"] }), "ru");
    const base = { ...emptyKsp(), topic: "Дроби" };
    const content = applyKitToContent({ ...base, stages: { ...base.stages, middle: { ...base.stages.middle, resources: "Учебник по предмету" } } }, kit);
    expect(content.stages.middle.resources).toBe("Учебник по предмету\nПрезентация к уроку\nКарточки парной работы\nРабочий лист (индивидуальная работа, 10 баллов)");
    expect(content.stages.middle.activities).toEqual([
      { form: "pair", title: "Карточки парной работы", slotId: "slot_pair_cards" },
      { form: "individual", title: "Рабочий лист (индивидуальная работа, 10 баллов)", slotId: "slot_worksheet" },
    ]);
    expect(content.stages.end.activities?.[0].slotId).toBe("slot_flashcards");
    expect(content.stages.beginning.activities).toBeUndefined();
    expect(base.stages.middle.activities).toBeUndefined();
    const parsed = kspContentSchema.parse(content);
    expect(parsed.kit?.slots).toHaveLength(4);
    expect(parsed.stages.middle.activities).toHaveLength(2);
  });

  it("writes Kazakh slot titles for a Kazakh lesson", () => {
    const kit = toLessonKit(answers({ workForms: ["group"], groups: 2, materials: ["group_cards"] }), "kz");
    expect(kit.slots[0].title).toBe("Топтық жұмыс карточкалары (2 топ)");
  });
});
