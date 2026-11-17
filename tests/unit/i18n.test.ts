import { describe, expect, it } from "vitest";
import { dictionaries, isLocale, LOCALES } from "@/lib/i18n/dictionaries";
import { appCopy } from "@/components/app/copy";

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

    const appRuKeys = keys(appCopy("ru")).sort();
    const appKkKeys = keys(appCopy("kk")).sort();
    expect(appKkKeys).toEqual(appRuKeys);
  });

  it("kk strings are non-empty and translated across all major sections", () => {
    const ru = dictionaries.ru;
    const kk = dictionaries.kk;
    expect(kk.nav.library).toBeTruthy();
    expect(kk.nav.library).not.toBe(ru.nav.library);
    expect(kk.landing.heroA).not.toBe(ru.landing.heroA);
    expect(kk.landing.createNew).not.toBe(ru.landing.createNew);
    expect(kk.pricing.titleA).not.toBe(ru.pricing.titleA);
    expect(kk.pricing.lead).not.toBe(ru.pricing.lead);
    expect(kk.dashboard.title).not.toBe(ru.dashboard.title);
    expect(kk.library.title).not.toBe(ru.library.title);
    expect(kk.auth.loginTitle).not.toBe(ru.auth.loginTitle);
    expect(kk.handouts.create).not.toBe(ru.handouts.create);
    expect(kk.classes.title).not.toBe(ru.classes.title);
    expect(kk.gradebook.title).not.toBe(ru.gradebook.title);
    expect(kk.assignments.dialogTitle).not.toBe(ru.assignments.dialogTitle);
    expect(kk.runner.kicker).not.toBe(ru.runner.kicker);
    expect(kk.longterm.title).not.toBe(ru.longterm.title);
    expect(kk.feedback.title).not.toBe(ru.feedback.title);
    expect(kk.onboarding.welcomeTitle).not.toBe(ru.onboarding.welcomeTitle);
    expect(kk.toast.saved).not.toBe(ru.toast.saved);
    expect(kk.help.quarter).not.toBe(ru.help.quarter);
    expect(kk.school.dashboard.greeting).not.toBe(ru.school.dashboard.greeting);
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
