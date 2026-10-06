import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Регрессия по двум багам тихой потери данных в конструкторе КСП.
 *
 * 1. «Сохранить черновик» не должен менять публичность плана.
 * 2. Применение результата AI не должно затирать правки, сделанные
 *    учителем во время ожидания ответа.
 *
 * Оба проверяются по исходному коду, а не по рантайму: обе проблемы
 * возникают из-за порядка вызовов и замыкания, которые рантайм-тест
 * компонента не воспроизводит дешёво.
 */

const ROOT = path.join(process.cwd(), "src");
const planForm = fs.readFileSync(path.join(ROOT, "components/ksp/plan-form.tsx"), "utf8");
const planVersions = fs.readFileSync(path.join(ROOT, "lib/plan-versions.ts"), "utf8");

describe("автосохранение черновика не трогает публичность", () => {
  it("updatePlanWithVersion сохраняет текущие visibility/is_draft для reason=draft", () => {
    // Ключевая строка: при автосохранении черновика решение о публикации
    // берётся из БД, а не из формы.
    expect(planVersions).toMatch(/reason === "draft"/);
    expect(planVersions).toMatch(/visibility: current\.visibility/);
    expect(planVersions).toMatch(/is_draft: current\.is_draft/);
  });

  it("ветка восстановления версии тоже не меняет публичность", () => {
    expect(planVersions).toMatch(/visibility: current\.visibility/);
    // Два независимых места: restore и draft.
    const occurrences = planVersions.match(/visibility: current\.visibility/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

describe("применение AI не затирает правки учителя", () => {
  it("нет ни одного вызова setContent, читающего content из замыкания", () => {
    // Раньше было `setContent({ ...content, X })`: content — снимок на момент
    // клика. Любая правка учителя во время ожидания ответа терялась.
    const stale = [...planForm.matchAll(/setContent\(\{ \.\.\.content/g)];
    expect(stale.map((m) => m[0])).toHaveLength(0);
  });

  it("все вызовы setContent, берущие spread, используют функциональную форму", () => {
    // Проверяем именно вызовы со spread: остальные (например, когда
    // передаётся готовый объект целиком) проблемы замыкания не имеют.
    const spreading = [...planForm.matchAll(/setContent\(\{\s*\.\.\.content\b/g)];
    expect(spreading).toHaveLength(0);

    const functional = [...planForm.matchAll(/setContent\(\(prev\) =>/g)];
    expect(functional.length).toBeGreaterThanOrEqual(25);
  });

  it("payload перед сохранением остаётся снимком — это корректно", () => {
    // `save()` строит payload в момент клика и сразу вызывает await:
    // замыкание здесь не пересекает время, в отличие от onApply после fetch.
    expect(planForm).toMatch(/content: \{ \.\.\.content, schoolProfile/);
  });
});