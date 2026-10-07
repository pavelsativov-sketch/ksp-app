/**
 * Тестовые аккаунты для автотестов.
 *
 * Создаёт N учителей через штатную форму регистрации — тем же путём, каким
 * пришёл бы живой человек. Обхода нет и не предполагается: никаких прав,
 * которых не получает обычная регистрация, аккаунты не выдают. Это тестовые
 * учителя бесплатного тарифа, и на них не открываются платные функции (КТП) —
 * как и задумано биллингом.
 *
 * Учётные данные пишутся в tests/e2e/.accounts.json, файл в .gitignore.
 *
 * Запуск: node scripts/seed-test-accounts.mjs [сколько] [адрес]
 *   по умолчанию 10 аккаунтов на http://localhost:3000
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const COUNT = Number(process.argv[2] ?? 10);
const BASE_URL = process.argv[3] ?? "http://localhost:3000";
const OUT_PATH = resolve(process.cwd(), "tests", "e2e", ".accounts.json");

/**
 * Ключ прогона входит в почту: иначе второй запуск на той же базе
 * натыкался бы на «почта уже занята» и падал бы.
 */
function runId() {
  return (process.env.TEST_RUN_ID ?? new Date().toISOString().slice(0, 10)).replace(/[^a-z0-9]/gi, "");
}

const PASSWORD = "AutotestKSP2026!pass";

function credentials(index) {
  const n = String(index + 1).padStart(2, "0");
  return {
    email: `autotest-${runId()}-${n}@example.test`,
    password: PASSWORD,
    name: `Автотест Учитель ${n}`,
  };
}

/** Регистрирует одного учителя через форму. Возвращает false, если уже существует. */
async function register(page, creds) {
  await page.goto(`${BASE_URL}/register`);
  await page.fill("#fullName", creds.name);
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);
  await Promise.all([
    page.waitForURL(/\/(welcome|dashboard|plans)/, { timeout: 30_000 }),
    page.getByRole("button", { name: /создать аккаунт/i }).click(),
  ]);
  // Онбординг мешает следующим шагам, поэтому закрываем его сразу.
  const skip = page.getByRole("button", { name: /пропустить/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
  return true;
}

async function main() {
  if (!Number.isInteger(COUNT) || COUNT < 1) {
    console.error("Количество аккаунтов должно быть целым положительным числом.");
    process.exit(2);
  }

  console.log(`Создание ${COUNT} тестовых аккаунтов на ${BASE_URL}`);
  const browser = await chromium.launch();
  const created = [];
  const failed = [];

  for (let i = 0; i < COUNT; i += 1) {
    const creds = credentials(i);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await register(page, creds);
      created.push(creds);
      console.log(`  [${i + 1}/${COUNT}] создан ${creds.email}`);
    } catch (err) {
      // Уже существующий аккаунт — не ошибка сценария: им можно пользоваться.
      const message = err instanceof Error ? err.message : String(err);
      const exists = /занят|already|уже есть/i.test(await page.content().catch(() => ""));
      if (exists) {
        created.push(creds);
        console.log(`  [${i + 1}/${COUNT}] уже существует ${creds.email}`);
      } else {
        failed.push({ ...creds, reason: message.slice(0, 160) });
        console.error(`  [${i + 1}/${COUNT}] НЕ создан ${creds.email}: ${message.slice(0, 120)}`);
      }
    } finally {
      await context.close();
    }
  }

  await browser.close();

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify({ baseUrl: BASE_URL, runId: runId(), password: PASSWORD, accounts: created }, null, 2),
    "utf8",
  );

  console.log(`\nГотово: ${created.length} из ${COUNT}. Учётные данные: ${OUT_PATH}`);
  if (failed.length) {
    console.log(`Не созданы: ${failed.map((f) => f.email).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});