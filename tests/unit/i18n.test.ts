import { describe, expect, it } from "vitest";
import { dictionaries, isLocale, LOCALES } from "@/lib/i18n/dictionaries";

function keys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => keys(item, `${prefix}[${i}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      keys(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

describe("i18n dictionaries", () => {
  it("kk mirrors ru keys (no missing or extra)", () => {
    const ruKeys = keys(dictionaries.ru).sort();
    const kkKeys = keys(dictionaries.kk).sort();
    expect(kkKeys).toEqual(ruKeys);
  });
  it("kk strings are non-empty and translated", () => {
    const ru = dictionaries.ru;
    const kk = dictionaries.kk;
    expect(kk.nav.library).toBeTruthy();
    expect(kk.nav.library).not.toBe(ru.nav.library);
    expect(kk.landing.heroA).not.toBe(ru.landing.heroA);
    expect(kk.pricing.titleA).not.toBe(ru.pricing.titleA);
    expect(kk.landing.benefits).toHaveLength(ru.landing.benefits.length);
    expect(kk.landing.steps).toHaveLength(ru.landing.steps.length);
  });
  it("recognizes only ru/kk locales", () => {
    expect(LOCALES).toEqual(["ru", "kk"]);
    expect(isLocale("kk")).toBe(true);
    expect(isLocale("en")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
