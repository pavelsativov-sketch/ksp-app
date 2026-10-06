import { describe, expect, it } from "vitest";
import {
  DEFAULT_ERRORS_COUNT,
  DEFAULT_TABLE_ROWS,
  MAX_ERRORS_COUNT,
  MAX_TABLE_ROWS,
  MIN_ERRORS_COUNT,
  MIN_TABLE_ROWS,
  resolveErrorsCount,
  resolveTableRows,
} from "@/lib/handouts/layout";

/**
 * Нормализация размеров рабочего листа: границы, нечисловые значения и
 * дробные числа. Базовый путь покрыт handouts-layout.test.ts.
 */

describe("resolveTableRows: границы и мусор", () => {
  it("clamps finite values to MIN_TABLE_ROWS and MAX_TABLE_ROWS", () => {
    expect(resolveTableRows(-1000)).toBe(MIN_TABLE_ROWS);
    expect(resolveTableRows(1000)).toBe(MAX_TABLE_ROWS);
    expect(resolveTableRows(Number.MAX_SAFE_INTEGER)).toBe(MAX_TABLE_ROWS);
    expect(resolveTableRows(Number.MIN_SAFE_INTEGER)).toBe(MIN_TABLE_ROWS);
  });

  it("returns the default for infinite values", () => {
    expect(resolveTableRows(-Infinity)).toBe(DEFAULT_TABLE_ROWS);
    expect(resolveTableRows(Infinity)).toBe(DEFAULT_TABLE_ROWS);
  });

  it("keeps fractional values within the valid range", () => {
    expect(resolveTableRows(2.4)).toBe(2.4);
    expect(resolveTableRows(7.9)).toBe(7.9);
  });

  it("returns the default for non-finite values", () => {
    for (const v of [NaN, Infinity, -Infinity, undefined, null as unknown as number]) {
      expect(resolveTableRows(v)).toBe(DEFAULT_TABLE_ROWS);
    }
  });

  it("respects an explicit valid value", () => {
    expect(resolveTableRows(5)).toBe(5);
    expect(resolveTableRows(MIN_TABLE_ROWS)).toBe(MIN_TABLE_ROWS);
    expect(resolveTableRows(MAX_TABLE_ROWS)).toBe(MAX_TABLE_ROWS);
  });
});

describe("resolveErrorsCount: границы и мусор", () => {
  it("clamps to MIN_ERRORS_COUNT and MAX_ERRORS_COUNT", () => {
    expect(resolveErrorsCount(-1000)).toBe(MIN_ERRORS_COUNT);
    expect(resolveErrorsCount(1000)).toBe(MAX_ERRORS_COUNT);
  });

  it("returns the default for infinite values", () => {
    expect(resolveErrorsCount(-Infinity)).toBe(DEFAULT_ERRORS_COUNT);
    expect(resolveErrorsCount(Infinity)).toBe(DEFAULT_ERRORS_COUNT);
  });

  it("keeps fractional values within the valid range", () => {
    expect(resolveErrorsCount(1.4)).toBe(1.4);
    expect(resolveErrorsCount(5.9)).toBe(5.9);
  });

  it("returns the default for non-finite values", () => {
    for (const v of [NaN, Infinity, -Infinity, undefined, null as unknown as number]) {
      expect(resolveErrorsCount(v)).toBe(DEFAULT_ERRORS_COUNT);
    }
  });
});

describe("константы размеров", () => {
  it("keep table rows and errors count within sane bounds", () => {
    expect(MIN_TABLE_ROWS).toBe(2);
    expect(MAX_TABLE_ROWS).toBe(8);
    expect(DEFAULT_TABLE_ROWS).toBe(4);
    expect(MIN_ERRORS_COUNT).toBe(1);
    expect(MAX_ERRORS_COUNT).toBe(6);
    expect(DEFAULT_ERRORS_COUNT).toBe(3);
  });
});
