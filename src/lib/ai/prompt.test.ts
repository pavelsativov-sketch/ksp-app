import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt";

describe("buildSystemPrompt", () => {
  it("RU prompt contains all KEY_REQUIREMENT clauses", () => {
    const out = buildSystemPrompt("ru");
    expect(out).toMatch(/КЛЮЧЕВОЕ ТРЕБОВАНИЕ № 1/);
    expect(out).toMatch(/КЛЮЧЕВОЕ ТРЕБОВАНИЕ № 2/);
    // Stage structure must mention all three phases.
    expect(out).toMatch(/Начало:/);
    expect(out).toMatch(/Середина:/);
    expect(out).toMatch(/Конец:/);
    // pointsScale + overallRubric requirements (PR-6 fix #1 + PR-9).
    expect(out.toLowerCase()).toMatch(/баллов/);
  });

  it("KZ prompt has KZ-language guidance", () => {
    const out = buildSystemPrompt("kz");
    expect(out).toMatch(/ҚМЖ/);
    expect(out).toMatch(/JSON/);
  });

  it("RU and KZ prompts are different", () => {
    expect(buildSystemPrompt("ru")).not.toEqual(buildSystemPrompt("kz"));
  });
});
