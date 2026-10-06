import { describe, expect, it } from "vitest";
import { enforceTenPoints } from "@/lib/handouts/generate";
import type { WorksheetTask } from "@/lib/handouts/types";

const task = (over: Partial<WorksheetTask>): WorksheetTask => ({
  prompt: "p",
  criterion: "c",
  descriptor: "d",
  points: 1,
  stage: "middle",
  ...over,
} as WorksheetTask);

const total = (tasks: WorksheetTask[]) => tasks.reduce((s, t) => s + t.points, 0);

describe("бюджет 10 баллов", () => {
  it("сумма оцениваемых заданий всегда ровно 10", () => {
    const tasks = enforceTenPoints([
      task({ type: "sort", items: new Array(18).fill("термин"), points: 1 }),
      task({ type: "checklist", options: ["а", "б"], points: 1 }),
      task({ type: "open", points: 1 }),
      task({ type: "creative", points: 7 }),
      task({ type: "reflection", reflectionOptions: ["а"], points: 1 }),
    ]);
    expect(total(tasks)).toBe(10);
  });

  it("рефлексия всегда 0 баллов, даже если модель поставила своё", () => {
    const tasks = enforceTenPoints([
      task({ type: "open", points: 3 }),
      task({ type: "reflection", reflectionOptions: ["а"], points: 4 }),
    ]);
    expect(tasks.find((t) => t.type === "reflection")?.points).toBe(0);
  });

  it("трудоёмкое задание весит больше простого, даже если модель ошиблась", () => {
    // Реальный случай: «Придумай пример» получило от модели 7 баллов,
    // а раздача 18 терминов — 1. Сумма была верной, распределение — нет.
    const tasks = enforceTenPoints([
      task({ type: "sort", items: new Array(18).fill("термин"), points: 1 }),
      task({ type: "checklist", options: ["а", "б"], points: 1 }),
      task({ type: "case_study", points: 1 }),
      task({ type: "creative", points: 7 }),
    ]);
    const sort = tasks.find((t) => t.type === "sort")!;
    const creative = tasks.find((t) => t.type === "creative")!;
    // Раздача терминов — самое трудоёмкое, финальное задание — самое дешёвое.
    expect(sort.points).toBeGreaterThan(creative.points);
    // creative входит в число самых низких по баллу, а не лидирует.
    const max = Math.max(...tasks.map((t) => t.points));
    expect(creative.points).toBeLessThan(max);
    // Мнение модели (7 баллов) не смогло пробить потолок.
    expect(creative.points).toBeLessThanOrEqual(2);
  });

  it("каждое оцениваемое задание получает минимум 1 балл", () => {
    const tasks = enforceTenPoints(
      new Array(6).fill(0).map((_, i) => task({ type: "open", points: 0 })),
    );
    expect(tasks.every((t) => t.points >= 1)).toBe(true);
    expect(total(tasks)).toBe(10);
  });

  it("больше 10 заданий: лишние обнуляются, сумма не ломается", () => {
    const tasks = enforceTenPoints(
      new Array(12).fill(0).map(() => task({ type: "open", points: 1 })),
    );
    expect(total(tasks)).toBe(10);
  });
});
