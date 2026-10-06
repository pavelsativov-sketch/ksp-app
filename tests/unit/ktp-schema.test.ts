import { describe, expect, it } from "vitest";
import { buildKtp, isCalendarDate, ktpRequestSchema } from "@/lib/ktp";
import { emptyKsp } from "@/lib/types/ksp";

/**
 * Дополнительные тесты схемы запроса КТП: существующий ktp.test.ts проверяет
 * счастливый путь, здесь — отказы валидации и граничные случаи.
 */

const validPlanId = "a".repeat(24);

describe("ktpRequestSchema: отказы", () => {
  it("rejects a malformed planId", () => {
    for (const planId of ["", "abc", "a".repeat(23), "a".repeat(25), "g".repeat(24), "a".repeat(24) + " "]) {
      const result = ktpRequestSchema.safeParse({ planId });
      expect(result.success, `planId="${planId}"`).toBe(false);
    }
  });

  it("accepts uppercase hex in planId (regex is case-insensitive)", () => {
    expect(ktpRequestSchema.safeParse({ planId: "A".repeat(24) }).success).toBe(true);
  });

  it("rejects an empty topics array", () => {
    expect(ktpRequestSchema.safeParse({ planId: validPlanId, topics: [] }).success).toBe(false);
  });

  it("rejects more than 40 topics", () => {
    const topics = Array.from({ length: 41 }, () => "Тема");
    expect(ktpRequestSchema.safeParse({ planId: validPlanId, topics }).success).toBe(false);
  });

  it("rejects an empty topic or a topic longer than 300 chars", () => {
    expect(ktpRequestSchema.safeParse({ planId: validPlanId, topics: [""] }).success).toBe(false);
    expect(ktpRequestSchema.safeParse({ planId: validPlanId, topics: ["  "] }).success).toBe(false);
    expect(ktpRequestSchema.safeParse({ planId: validPlanId, topics: ["я".repeat(301)] }).success).toBe(false);
  });

  it("rejects a malformed startDate", () => {
    for (const startDate of ["2026-13-01", "2026-02-30", "2026-1-1", "20260101", "01-01-2026"]) {
      expect(ktpRequestSchema.safeParse({ planId: validPlanId, startDate }).success).toBe(false);
    }
  });

  it("accepts a valid request without optional fields", () => {
    const parsed = ktpRequestSchema.parse({ planId: validPlanId });
    expect(parsed).toEqual({ planId: validPlanId });
  });

  it("trims topics and keeps 40 of 300 chars each", () => {
    const topics = Array.from({ length: 40 }, () => ` ${"я".repeat(300)} `);
    const parsed = ktpRequestSchema.parse({ planId: validPlanId, topics });
    expect(parsed.topics).toHaveLength(40);
    expect(parsed.topics![0]).toHaveLength(300);
  });
});

describe("isCalendarDate: граничные случаи", () => {
  it("accepts leap-day in a leap year and rejects it in a non-leap year", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2023-02-29")).toBe(false);
    expect(isCalendarDate("1900-02-29")).toBe(false); // вековой год без високоса
    expect(isCalendarDate("2000-02-29")).toBe(true); // вековой год с високосом
  });

  it("rejects month and day out of range", () => {
    expect(isCalendarDate("2026-00-10")).toBe(false);
    expect(isCalendarDate("2026-13-10")).toBe(false);
    expect(isCalendarDate("2026-01-00")).toBe(false);
    expect(isCalendarDate("2026-01-32")).toBe(false);
    expect(isCalendarDate("2026-04-31")).toBe(false); // в апреле 30 дней
  });
});

describe("buildKtp: граничные случаи", () => {
  const plan = () => ({
    title: "Дроби", grade: 5, language: "ru" as const,
    content: { ...emptyKsp(), topic: "Дроби", learningObjectives: [{ code: "5.1", text: "Сравнивать дроби" }] },
  });

  it("joins multiple objectives with a newline", () => {
    const p = plan();
    p.content.learningObjectives = [
      { code: "5.1", text: "Сравнивать дроби" },
      { code: "5.2", text: "Складывать дроби" },
    ];
    const ktp = buildKtp(p, "Математика");
    expect(ktp.rows[0].objectives).toBe("5.1 — Сравнивать дроби\n5.2 — Складывать дроби");
  });

  it("skips empty code and text in objectives", () => {
    const p = plan();
    p.content.learningObjectives = [
      { code: "", text: "Без кода" },
      { code: "5.2", text: "" },
      { code: "  ", text: "  " },
    ];
    const ktp = buildKtp(p, "Математика");
    expect(ktp.rows[0].objectives).toBe("Без кода\n5.2");
  });

  it("trims the source topic and matches it case-sensitively after trim", () => {
    const p = plan();
    p.content.topic = "  Дроби  ";
    const ktp = buildKtp(p, "Математика", { topics: ["  Дроби  ", "ДРОБИ"] });
    expect(ktp.rows[0].topic).toBe("Дроби");
    expect(ktp.rows[0].objectives).toBe("5.1 — Сравнивать дроби");
    expect(ktp.rows[1].topic).toBe("ДРОБИ");
    expect(ktp.rows[1].objectives).toBe("");
  });

  it("always marks the result as a draft", () => {
    expect(buildKtp(plan(), "Математика").draft).toBe(true);
  });
});
