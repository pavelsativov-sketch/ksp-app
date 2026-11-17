import { describe, expect, it } from "vitest";
import { shuffleIndices } from "@/components/ksp/task-player";

describe("shuffleIndices", () => {
  it("детерминирован по seed — сервер и клиент рисуют одинаковый порядок", () => {
    expect(shuffleIndices(8, "task-1:mcq")).toEqual(shuffleIndices(8, "task-1:mcq"));
  });

  it("возвращает перестановку всех индексов", () => {
    const order = shuffleIndices(10, "task-2:order");
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("разные задачи перемешиваются по-разному", () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) => shuffleIndices(6, `task-${i}`).join(",")),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
