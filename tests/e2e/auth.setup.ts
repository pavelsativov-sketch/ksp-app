/**
 * Вход в приложение один раз на весь прогон.
 *
 * Ограничение найдено при первом же прогоне: сервер разрешает 10 входов на
 * почту за 15 минут. Если каждый тест входит сам, прогон упирается в лимит
 * и падает не по существу, а с сообщением про вход. Правильный способ —
 * один вход и общий файл cookies.
 */

import { randomUUID } from "node:crypto";
import { test as setup, expect } from "@playwright/test";
import { accountAt, saveAccounts } from "./helpers/accounts";

const AUTH_FILE = "tests/e2e/.auth.json";

setup("вход и сохранение сессии", async ({ page }) => {
  const { baseUrl } = { baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:3000" };

  // Не используем сохранённый аккаунт от предыдущего запуска: он мог быть
  // создан на preview/production deployment, а Playwright по умолчанию
  // стартует localhost. Создаём одного изолированного учителя для текущего
  // адреса, затем проверяем именно обычный вход и сохраняем его cookies.
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const account = {
    email: `e2e-${runId}@example.test`,
    password: "AutotestKSP2026!pass",
    name: "Автотест Учитель",
  };

  await page.context().clearCookies();
  await page.goto(`${baseUrl}/register`);
  await page.fill("#fullName", account.name);
  await page.fill("#email", account.email);
  await page.fill("#password", account.password);
  await Promise.all([
    page.waitForURL(/\/(welcome|dashboard|plans)/, { timeout: 30_000 }),
    page.getByRole("button", { name: /создать аккаунт/i }).click(),
  ]);

  const firstSkip = page.getByRole("button", { name: /пропустить/i });
  if (await firstSkip.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await firstSkip.click();
  }
  await page.getByRole("button", { name: /выйти/i }).first().click();
  // logoutAction возвращает на главную, а не на /login.
  await page.waitForURL(/\/$/, { timeout: 30_000 });

  saveAccounts({ baseUrl, runId, password: account.password, accounts: [account] });
  expect(accountAt(0)).toMatchObject({ email: account.email });

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
