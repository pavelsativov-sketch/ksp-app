import { describe, it, expect } from "vitest";
import {
  resolveTableRows,
  resolveErrorsCount,
  DEFAULT_TABLE_ROWS,
  DEFAULT_ERRORS_COUNT,
} from "@/lib/handouts/layout";

/**
 * Регрессия: docx и предпросмотр держали разные значения по умолчанию
 * (4 строки в Word против 3 на экране, 3 ошибки против 2), поэтому учитель
 * получал на печати не то, что видел на экране.
 */
describe("нормализация размеров рабочего листа", () => {
  it("одинаковое значение по умолчанию для обоих рендереров", () => {
    expect(resolveTableRows(undefined)).toBe(DEFAULT_TABLE_ROWS);
    expect(resolveErrorsCount(undefined)).toBe(DEFAULT_ERRORS_COUNT);
  });

  it("уважает заданное значение", () => {
    expect(resolveTableRows(6)).toBe(6);
    expect(resolveErrorsCount(5)).toBe(5);
  });

  it("ограничивает значения снизу и сверху", () => {
    expect(resolveTableRows(0)).toBe(2);
    expect(resolveTableRows(100)).toBe(8);
    expect(resolveErrorsCount(0)).toBe(1);
    expect(resolveErrorsCount(99)).toBe(6);
  });

  it("не ломается на мусорных значениях", () => {
    expect(resolveTableRows(-5)).toBe(2);
    expect(resolveTableRows(NaN)).toBe(DEFAULT_TABLE_ROWS);
    expect(resolveErrorsCount(NaN)).toBe(DEFAULT_ERRORS_COUNT);
  });
});
