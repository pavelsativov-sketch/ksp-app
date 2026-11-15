import { describe, expect, it } from "vitest";
import { matchObjectives, resolveGosoSubject } from "@/lib/goso/match";

describe("matchObjectives", () => {
  it("подбирает реальные цели ГОСО по теме", () => {
    const result = matchObjectives({ subject: "Математика", grade: 5, topic: "Обыкновенные дроби" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.every((o) => o.code.startsWith("5.") && /дроб/i.test(o.text))).toBe(true);
  });

  it("не придумывает цели: тема без совпадений даёт пустой список", () => {
    expect(matchObjectives({ subject: "Математика", grade: 5, topic: "Xyzzy qwerty" })).toEqual([]);
  });

  it("неизвестный предмет не угадывается", () => {
    expect(resolveGosoSubject("математика")).toBe("Математика");
    expect(resolveGosoSubject("Кулинария")).toBeNull();
    expect(matchObjectives({ subject: "Кулинария", grade: 5, topic: "дроби" })).toEqual([]);
  });

  it("редкое слово темы важнее частого: клетка, а не строение листа", () => {
    const codes = matchObjectives({ subject: "Биология", grade: 7, topic: "Строение клетки растения" }).map((o) => o.code);
    expect(codes[0]).toBe("7.4.2.2");
    expect(codes).not.toContain("7.1.2.1");
  });

  it("берёт цели только своего класса", () => {
    const result = matchObjectives({ subject: "Математика", grade: 6, topic: "дроби", limit: 10 });
    expect(result.every((o) => o.code.startsWith("6."))).toBe(true);
  });
});

import { emptyKsp } from "@/lib/types/ksp";
import { mergeAiIntoKsp } from "@/lib/ai/merge";

describe("mergeAiIntoKsp и цели ГОСО", () => {
  const picked = [{ code: "5.1.1.9", text: "усвоить понятие обыкновенной дроби;" }];

  it("подставляет подобранные цели в пустой план", () => {
    expect(mergeAiIntoKsp(emptyKsp(), { learningObjectives: picked }).learningObjectives).toEqual(picked);
  });

  it("не затирает цели, выбранные учителем", () => {
    const own = { ...emptyKsp(), learningObjectives: [{ code: "5.1.1.10", text: "своя цель" }] };
    expect(mergeAiIntoKsp(own, { learningObjectives: picked }).learningObjectives).toEqual(own.learningObjectives);
  });

  it("игнорирует мусор вместо целей", () => {
    expect(mergeAiIntoKsp(emptyKsp(), { learningObjectives: ["текст", { code: 1 }] }).learningObjectives).toEqual([]);
  });
});
