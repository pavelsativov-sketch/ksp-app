/**
 * Доступ к тестовым аккаунтам для автотестов.
 *
 * Учётные данные создаёт `node scripts/seed-test-accounts.mjs`. Пока файла нет,
 * сценарии падают с понятным сообщением, а не молча идут мимо проверки.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

/**
 * Сессия для сценариев берётся из общего файла cookies (проект `setup`),
 * поэтому вход здесь больше не выполняется: сервер разрешает 10 входов на
 * почту за 15 минут, и прогон, входящий в каждом тесте, упирался в лимит.
 */

const ACCOUNTS_PATH = resolve(process.cwd(), "tests", "e2e", ".accounts.json");

export interface TestAccount {
  email: string;
  password: string;
  name: string;
}

export interface AccountsFile {
  baseUrl: string;
  runId: string;
  password: string;
  accounts: TestAccount[];
}

let cache: AccountsFile | null = null;

/**
 * Сохраняет свежие учётные данные в то же место, откуда их читают E2E-тесты.
 * Setup создаёт отдельного пользователя для текущего base URL, поэтому файл
 * от другого деплоя не может случайно сломать локальный прогон.
 */
export function saveAccounts(accounts: AccountsFile): void {
  writeFileSync(ACCOUNTS_PATH, JSON.stringify(accounts, null, 2), "utf8");
  cache = accounts;
}

export function loadAccounts(): AccountsFile {
  if (cache) return cache;
  if (!existsSync(ACCOUNTS_PATH)) {
    throw new Error(
      "Нет тестовых аккаунтов. Создайте их командой:\n" +
        "  node scripts/seed-test-accounts.mjs\n" +
        `Файл с учётными данными ожидается здесь: ${ACCOUNTS_PATH}`,
    );
  }
  cache = JSON.parse(readFileSync(ACCOUNTS_PATH, "utf8")) as AccountsFile;
  if (!cache.accounts?.length) {
    throw new Error(`Файл ${ACCOUNTS_PATH} есть, но аккаунтов в нём нет. Пересоздайте его скриптом seed-test-accounts.`);
  }
  return cache;
}

/** Аккаунт по индексу — для параллельных прогонов. */
export function accountAt(index: number): TestAccount {
  const { accounts } = loadAccounts();
  const account = accounts[index % accounts.length];
  expect(account, "тестовый аккаунт отсутствует").toBeTruthy();
  return account;
}

/**
 * Создаёт план урока из встроенного примера и возвращает адрес его страницы.
 *
 * Путь именно такой, каким идёт учитель: сохранить черновик, затем открыть
 * его из архива. Кнопка «Сохранить» (полное сохранение) на примере не
 * годится: она требует заполненного содержимого по строгой схеме и
 * возвращает ошибку валидации, не переходя на страницу плана.
 */
export async function createPlanFromExample(page: Page, topicLabel = /Математика/): Promise<string> {
  await page.goto("/plans/new");
  await page.getByRole("link", { name: topicLabel }).click();

  // Тема примера должна попасть в поле до сохранения, иначе сохранится пустой
  // план и сценарий пойдёт дальше по неверным данным.
  await expect(page.locator("#title")).not.toHaveValue("");

  await page.getByRole("button", { name: /сохранить черновик/i }).click();
  // Черновик сохраняется на сервере и остаётся на форме — ждём подтверждения,
  // а не перехода.
  await expect(page.getByText(/черновик сохранён/i).first()).toBeVisible({ timeout: 30_000 });

  await page.goto("/dashboard");
  const openLink = page.getByRole("link", { name: /открыть/i }).first();
  await expect(openLink).toBeVisible({ timeout: 30_000 });
  await openLink.click();
  await page.waitForURL(/\/plans\/[a-f0-9]{24}/, { timeout: 30_000 });
  return page.url();
}

/** Идентификатор плана из его адреса. */
export function planIdFrom(url: string): string {
  const id = url.split("/").pop() ?? "";
  expect(id, `не удалось получить id плана из адреса ${url}`).toMatch(/^[a-f0-9]{24}$/);
  return id;
}
