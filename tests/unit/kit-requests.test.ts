import { describe, expect, it } from "vitest";
import { kitAnswersSchema, toLessonKit } from "@/lib/materials/kit";
import { slotRequest, slotStatus, type KitLessonContext } from "@/lib/materials/kit-requests";
import type { MaterialKind } from "@/lib/types/ksp";

const kit = toLessonKit(kitAnswersSchema.parse({
  workForms: ["individual", "group", "pair"], groups: 4, value: "Закон и порядок",
  oop: { present: true, needs: ["zpr"] },
  materials: ["worksheet", "oop_sheet", "group_cards", "pair_cards", "crossword", "flashcards", "deck"],
}), "ru");
const ctx: KitLessonContext = { planId: "64b7f0c2a1b2c3d4e5f60718", topic: "Дроби", subject: "Математика", grade: 5, language: "ru", values: "Трудолюбие" };
const slot = (kind: MaterialKind) => kit.slots.find((s) => s.kind === kind)!;

describe("kit slot requests", () => {
  it("creates each material through the route its button uses, tied to the lesson and its stage", () => {
    expect(slotRequest(slot("worksheet"), kit, ctx)).toMatchObject({ url: "/api/handouts/generate", body: { kind: "worksheet", withImages: true, planId: ctx.planId, stage: "middle" } });
    expect(slotRequest(slot("crossword"), kit, ctx)?.body).toMatchObject({ kind: "crossword", stage: "beginning" });
    expect(slotRequest(slot("flashcards"), kit, ctx)?.body).toMatchObject({ kind: "flashcards", stage: "end" });
    expect(slotRequest(slot("deck"), kit, ctx)).toEqual({ url: "/api/materials/deck", body: { planId: ctx.planId } });
  });

  it("asks for the chosen number of groups and the lesson value from the kit", () => {
    expect(slotRequest(slot("group_cards"), kit, ctx)).toMatchObject({ url: "/api/handouts/group", body: { mode: "group", count: 4, values: "Закон и порядок" } });
    expect(slotRequest(slot("pair_cards"), kit, ctx)?.body).toMatchObject({ mode: "pair", count: 4 });
  });

  it("has no request for the OOP sheet: it is built from the worksheet", () => {
    expect(slotRequest(slot("oop_sheet"), kit, ctx)).toBeNull();
  });
});

describe("kit slot status", () => {
  const now = 1_000_000;
  const windowMs = 240_000;

  it("is ready when the lesson has the material, and the OOP sheet follows the worksheet", () => {
    const saved = new Set<MaterialKind>(["worksheet"]);
    expect(slotStatus(slot("worksheet"), saved, undefined, now, windowMs)).toBe("ready");
    expect(slotStatus(slot("oop_sheet"), saved, undefined, now, windowMs)).toBe("ready");
    expect(slotStatus(slot("oop_sheet"), new Set(), undefined, now, windowMs)).toBe("planned");
  });

  it("shows a recent start as generating and an old one as not created", () => {
    expect(slotStatus(slot("crossword"), new Set(), now - 30_000, now, windowMs)).toBe("generating");
    expect(slotStatus(slot("crossword"), new Set(), now - 300_000, now, windowMs)).toBe("planned");
  });
});
