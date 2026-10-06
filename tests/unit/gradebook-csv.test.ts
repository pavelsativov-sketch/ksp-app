import { describe, it, expect } from "vitest";
import { escapeCsvValue } from "@/lib/gradebook";

/**
 * Регрессия по формульной инъекции в CSV.
 *
 * Имя ученика вводит сам ученик при отправке ответа (до 100 символов) и
 * оно попадает в ячейку выгрузки журнала. Раньше экранировались только
 * запятая, кавычка и перевод строки, поэтому `=HYPERLINK(...)` или
 * `+cmd|...` выполнялись Excel'ом/LibreOffice при открытии файла.
 */
describe("escapeCsvValue", () => {
  it("нейтрализует формулы Excel", () => {
    // Значение с запятой дополнительно оборачивается в кавычки по правилам CSV
    expect(escapeCsvValue('=HYPERLINK("http://evil","open")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""open"")"',
    );
    expect(escapeCsvValue("+cmd|'/c calc'!A1")).toBe("'+cmd|'/c calc'!A1");
    expect(escapeCsvValue("-2+3+cmd|'/c calc'!A1")).toBe("'-2+3+cmd|'/c calc'!A1");
    expect(escapeCsvValue("@SUM(1+1)")).toBe("'@SUM(1+1)");
  });

  it("нейтрализует формулу, спрятанную за невидимыми символами", () => {
    // Excel игнорирует управляющие символы при разборе формулы
    expect(escapeCsvValue("=\u0001A1")).toBe("'=A1");
    expect(escapeCsvValue("\u0002=1+1")).toBe("'=1+1");
  });

  it("не ломает обычные значения", () => {
    expect(escapeCsvValue("Айгерим")).toBe("Айгерим");
    expect(escapeCsvValue("Иванов И.И.")).toBe("Иванов И.И.");
    expect(escapeCsvValue("5-6 класс")).toBe("5-6 класс");
    expect(escapeCsvValue(0)).toBe("0");
    expect(escapeCsvValue(87)).toBe("87");
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined as unknown as null)).toBe("");
  });

  it("экранирует разделители и кавычки", () => {
    expect(escapeCsvValue('Ахмет, Айгерим')).toBe('"Ахмет, Айгерим"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvValue("строка1\nстрока2")).toBe('"строка1\nстрока2"');
  });

  it("пустая строка после очистки не получает апостроф", () => {
    expect(escapeCsvValue("")).toBe("");
    expect(escapeCsvValue("   ")).toBe("");
    expect(escapeCsvValue("\u0000\u0001")).toBe("");
  });

  it("минус в начале числа-ответа тоже экранируется", () => {
    // Оценка может прийти отрицательной из-за сб��я сервера — в CSV это
    // тоже выглядит как формула, поэтому префикс обязателен.
    expect(escapeCsvValue("-3")).toBe("'-3");
  });
});