import { describe, expect, it } from "vitest";
import {
  isBoundedPlan,
  MAX_PLAN_BYTES,
  MAX_PLAN_VERSIONS,
  planMutationError,
  planState,
  PLAN_CONFLICT,
} from "@/lib/plan-versions";
import { emptyKsp } from "@/lib/types/ksp";

/**
 * Чистые функции модуля истории версий: нормализация состояния, провка
 * размера и маппинг ошибок. Транзакционную логику покрывает plan-versions.test.ts.
 */

describe("planState", () => {
  it("fills defaults for missing optional fields", () => {
    const state = planState({ title: "Т", content: emptyKsp() } as never);
    expect(state).toMatchObject({
      title: "Т",
      subject_id: undefined,
      grade: undefined,
      quarter: undefined,
      section: undefined,
      visibility: undefined,
      language: undefined,
      is_draft: false,
      class_id: null,
    });
  });

  it("keeps explicit values and does not mutate the input", () => {
    const input = {
      title: "План", subject_id: "sub", grade: 5, quarter: 1, section: "s",
      content: emptyKsp(), visibility: "public" as const, language: "kz" as const,
      is_draft: true, class_id: "cls",
    };
    const snapshot = structuredClone(input);
    const state = planState(input);
    expect(state).toEqual(input);
    expect(input).toEqual(snapshot);
  });

  it("normalizes missing is_draft and class_id to false/null", () => {
    const state = planState({ title: "Т", content: emptyKsp() } as never);
    expect(state.is_draft).toBe(false);
    expect(state.class_id).toBeNull();
  });
});

describe("isBoundedPlan", () => {
  it("accepts a small plan", () => {
    expect(isBoundedPlan({ title: "Т", content: emptyKsp() })).toBe(true);
  });

  it("rejects a plan larger than MAX_PLAN_BYTES", () => {
    const huge = { title: "Т", content: { ...emptyKsp(), topic: "я".repeat(MAX_PLAN_BYTES) } };
    expect(isBoundedPlan(huge)).toBe(false);
  });

  it("returns false for unserializable input", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(isBoundedPlan(circular)).toBe(false);
  });

  it("accepts a plan exactly at the boundary", () => {
    // Тема ровно в пределах лимита: заголовок JSON + тема < MAX_PLAN_BYTES.
    const atLimit = { title: "Т", content: { ...emptyKsp(), topic: "а".repeat(1000) } };
    expect(Buffer.byteLength(JSON.stringify(atLimit), "utf8")).toBeLessThan(MAX_PLAN_BYTES);
    expect(isBoundedPlan(atLimit)).toBe(true);
  });
});

describe("planMutationError", () => {
  it("passes through known safe messages", () => {
    for (const message of [
      PLAN_CONFLICT,
      "План не найден",
      "Версия не найдена",
      "Некорректный id",
      "План слишком большой",
      "Предыдущая версия слишком большая для истории. Изменения не сохранены.",
    ]) {
      expect(planMutationError(new Error(message), "fallback")).toBe(message);
    }
  });

  it("replaces unknown errors with the fallback", () => {
    expect(planMutationError(new Error("secret database error"), "Не удалось сохранить")).toBe("Не удалось сохранить");
    expect(planMutationError("not an error", "fallback")).toBe("fallback");
    expect(planMutationError(null, "fallback")).toBe("fallback");
  });
});

describe("константы истории версий", () => {
  it("retains last 30 snapshots and 256 KB per snapshot", () => {
    expect(MAX_PLAN_VERSIONS).toBe(30);
    expect(MAX_PLAN_BYTES).toBe(256 * 1024);
  });
});
