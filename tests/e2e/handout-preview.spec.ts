/**
 * Предпросмотр раздаточного материала — сценарий с вызовом ИИ.
 *
 * Отдельный файл и отдельный флаг. Предпросмотр нельзя открыть без
 * генерации, а генерация занимает около полутора минут и тратит квоту:
 * в обычном прогоне это даёт нестабильные результаты и лишний расход.
 *
 * Запуск:
 *   node scripts/reset-test-rate-limits.mjs
 *   E2E_AI=1 npx playwright test handout-preview
 *
 * Без E2E_AI сценарий пропускается с явной пометкой, а не молча: иначе
 * «зелёный» прогон выглядел бы как проверенный предпросмотр.
 */

import { test, expect } from "@playwright/test";
import { createPlanFromExample } from "./helpers/accounts";

const aiEnabled = process.env.E2E_AI === "1";

test.describe("предпросмотр памяток", () => {
  test.skip(!aiEnabled, "Требуется E2E_AI=1: генерация тратит квоту и время");
  test.setTimeout(300_000);

  test("карточки открываются с настройками и печатью", async ({ page }) => {
    await createPlanFromExample(page);
    await page.getByRole("button", { name: /памятки/i }).first().click();
    await page.getByRole("button", { name: /создать и посмотреть/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 240_000 });

    // Панель настроек: её не было в работавшей версии компонента, она
    // перенесена из неиспользуемого дубля. Без неё нельзя увеличить шрифт
    // для первоклассника и нельзя убрать ответы с экрана перед печатью.
    await page.getByTitle("Настройки").click();
    await expect(page.getByText("Размер шрифта")).toBeVisible();
    await expect(page.getByText("Отступы между заданиями")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Печать$/ })).toBeVisible();

    // Карточки оформлены, а не серые прямоугольники.
    await expect(dialog.locator("article").first()).toBeVisible();
  });
});