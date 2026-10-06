import { describe, it, expect } from "vitest";
import { booleanFlag, optionalBooleanFlag } from "@/lib/validation/boolean-flag";

/**
 * Регрессия по разбору булевых флагов.
 *
 * `z.coerce.boolean()` опирается на `Boolean(value)`, поэтому строка "false",
 * "0" и "off" превращались в `true`. Для `includeAnswers` это означало, что
 * клиент, отправляющий данные формой вместо JSON, получал УЧИТЕЛЬСКУЮ
 * версию рабочего листа — вместе с ключами ответов для всего класса.
 */
describe("booleanFlag", () => {
  it("понимает настоящие булевы", () => {
    expect(booleanFlag.parse(true)).toBe(true);
    expect(booleanFlag.parse(false)).toBe(false);
  });

  it("понимает строковые формы из HTML-формы", () => {
    expect(booleanFlag.parse("true")).toBe(true);
    expect(booleanFlag.parse("1")).toBe(true);
    expect(booleanFlag.parse("on")).toBe(true);
    expect(booleanFlag.parse("yes")).toBe(true);
  });

  it("НЕ превращает строковые false/0/off в true", () => {
    expect(booleanFlag.parse("false")).toBe(false);
    expect(booleanFlag.parse("0")).toBe(false);
    expect(booleanFlag.parse("off")).toBe(false);
    expect(booleanFlag.parse("no")).toBe(false);
    expect(booleanFlag.parse("")).toBe(false);
  });

  it("понимает числа из FormData", () => {
    expect(booleanFlag.parse(1)).toBe(true);
    expect(booleanFlag.parse(0)).toBe(false);
  });

  it("отвергает мусор вместо молчаливого true", () => {
    expect(booleanFlag.safeParse("maybe").success).toBe(false);
    expect(booleanFlag.safeParse(7).success).toBe(false);
    expect(booleanFlag.safeParse(null).success).toBe(false);
    expect(booleanFlag.safeParse({}).success).toBe(false);
  });

  it("optional-версия сохраняет undefined", () => {
    expect(optionalBooleanFlag.parse(undefined)).toBeUndefined();
    expect(optionalBooleanFlag.parse("false")).toBe(false);
  });

  it("default применяется только к отсутствующему значению", () => {
    const schema = booleanFlag.default(true);
    expect(schema.parse(undefined)).toBe(true);
    expect(schema.parse("false")).toBe(false);
  });
});