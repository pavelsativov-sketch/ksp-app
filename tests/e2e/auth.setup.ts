/**
 * Вход в приложение один раз на весь прогон.
 *
 * Ограничение найдено при первом же прогоне: сервер разрешает 10 входов на
 * почту за 15 минут. Если каждый тест входит сам, прогон упирается в лимит
 * и падает не по существу, а с сообщением про вход. Правильный способ —
 * один вход и общий файл cookies.
 */

import { test as setup, expect } from "@playwright/test";
import { accountAt } from "./helpers/accounts";

const AUTH_FILE = "tests/e2e/.auth.json";

setup("вход и сохранение сессии", async ({ page }) => {
  const account = accountAt(0);
  const { baseUrl } = { baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:3000" };

  await page.goto(`${baseUrl}/login`);
  await page.fill("#email", account.email);
  await page.fill("#password", account.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|welcome|plans)/, { timeout: 30_000 }),
    page.getByRole("button", { name: /войти/i }).click(),
  ]);

  // Первое действие нового учителя — приветственный диалог. Он перекрывает
  // шапку, поэтому признак входа («Выйти») не видно, пока диалог не закрыт.
  const skip = page.getByRole("button", { name: /пропустить/i });
  if (await skip.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await skip.click();
  }

  // Признак успешного входа — кнопка выхода в шапке. Проверяем её, иначе
  // «успешный» прогон может записать в файл пустую сессию.
  await expect(page.getByRole("button", { name: /выйти/i }).first()).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});