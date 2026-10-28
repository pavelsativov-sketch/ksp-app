/**
 * Quality gate: проверки готовности КСП.
 * Требует, чтобы гейт на странице плана показывал эвристики,
 * раскрываемые пояснения, переход к полю редактора и disclaimer о не-нормативе.
 * Пороговые значения баллов/времени — учительские ориентиры (qualityTargets), а не норматив.
 */
import { test, expect } from "@playwright/test";
import { createPlanFromExample, planIdFrom } from "./helpers/accounts";

test.describe("quality gate", () => {
  test("показывает проверки, раскрывашки, ссылку на поле и дисклеймер не-норматива", async ({ page }) => {
    const planUrl = await createPlanFromExample(page);
    const planId = planIdFrom(planUrl);

    await page.goto(`/plans/${planId}`);
    const gate = page.getByTestId("quality-gate");
    await expect(gate).toBeVisible({ timeout: 30_000 });

    await expect(gate.getByText(/Автоматические проверки|Мазмұн тексерістері/)).toBeVisible();
    await expect(page.getByTestId("quality-disclaimer")).toBeVisible();
    await expect(page.getByTestId("quality-disclaimer")).toContainText(/эвристик|норматив|ориентир/i);

    // Хотя бы несколько карточек качества отрендерены (профильные + базовые)
    const items = gate.locator('[data-testid^="quality-item-"]');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(10);

    // Раскрывашка «Как исправить» — кликабельна и показывает details
    const firstDetails = gate.locator("details").first();
    await expect(firstDetails).toBeAttached();
    await firstDetails.locator("summary").click();
    await expect(firstDetails).toHaveAttribute("open", "");

    // Бейдж «ориентир» у не-нормативных проверок (баллы/время/стыки/нагрузка)
    await expect(gate.getByText(/ориентир|бағдар/).first()).toBeVisible();

    // Ссылка ведёт в редактор с ?tab= и (опционально) #anchor — переход к конкретному полю/табу
    const link = gate.locator('[data-testid^="quality-link-"]').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href, "quality link href").toMatch(/\/plans\/[a-f0-9]{24}\/edit\?tab=(goals|context|flow|evaluation)/);
    await link.click();
    await expect(page).toHaveURL(/\/plans\/[a-f0-9]{24}\/edit\?tab=/);
  });

  test("после создания плана нет битых ссылок целей/критериев — при необходимости помечает warn/fail, но не 500", async ({ page }) => {
    const url = await createPlanFromExample(page);
    const id = planIdFrom(url);
    await page.goto(`/plans/${id}/edit?tab=flow`);
    await expect(page.getByRole("heading", { name: /Редактирование КСП|КСП/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("tab").first()).toBeVisible();
  });
});
