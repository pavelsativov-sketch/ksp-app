/**
 * Поиск ошибок гидратации на живых страницах.
 *
 * React в проде сообщает о несовпадении серверного и клиентского HTML только
 * ссылкой на свой сайт, без указания компонента. Но перед этим он пишет
 * подробности в консоль браузера — вот их и ловим. Скрипт обходит все
 * вкладки рабочей области и перезагружает страницу несколько раз: ошибка
 * плавающая и за один проход может не проявиться.
 *
 * Учётные данные берутся из tests/e2e/.accounts.json и в вывод не попадают.
 *
 * Запуск: node scripts/check-hydration.mjs [адрес] [повторов]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { chromium } from "@playwright/test";
import { dismissFirstRunDialog } from "./lib/prod-helpers.mjs";

const BASE_URL = process.argv[2] ?? "https://ksp-app-pi.vercel.app";
const ROUNDS = Number(process.argv[3] ?? 4);
const ACCOUNTS = path.resolve(process.cwd(), "tests", "e2e", ".accounts.json");
const REPORT = path.resolve(process.cwd(), "node_modules", ".cache", "hydration.txt");
const TABS = ["Рабочий стол", "Браузер", "Файлы", "Редактор", "Терминал"];

const PATTERN = /hydrat|did not match|server rendered|418|425|validateDOMNesting|Warning:/i;

function account() {
  const data = JSON.parse(readFileSync(ACCOUNTS, "utf8"));
  const first = data.accounts?.[0];
  if (!first) throw new Error(`в ${ACCOUNTS} нет аккаунтов`);
  return first;
}

async function main() {
  let creds = account();
  const findings = [];
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const watch = () => {
    page.on("console", (msg) => {
      if (msg.type() !== "error" && msg.type() !== "warning") return;
      const text = msg.text();
      if (!PATTERN.test(text)) return;
      let where = page.url().replace(BASE_URL, "");
      try {
        const loc = msg.location();
        if (loc?.url) where += ` [src: ${loc.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60)}]`;
      } catch { /* нет места — не беда */ }
      findings.push({ where, text: text.replace(/\s+/g, " ").slice(0, 700) });
    });
    page.on("pageerror", (e) => {
      if (!PATTERN.test(String(e.message))) return;
      findings.push({ where: page.url().replace(BASE_URL, ""), text: String(e.message).slice(0, 400) });
    });
  };
  watch();

  try {
    // Вход с запасным аккаунтом: после частых прогонов вход троттлится.
    let entered = false;
    for (let attempt = 1; attempt <= 2 && !entered; attempt++) {
      await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.fill('input[type="email"], input[name="email"]', creds.email);
      await page.fill('input[type="password"]', creds.password);
      entered = await Promise.all([
        page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 }).then(() => true).catch(() => false),
        page.click('button[type="submit"]').catch(() => {}),
      ]).then(([ok]) => ok);
      if (!entered && attempt === 1) {
        const runId = `h${Date.now().toString(36)}`;
        spawnSync(process.execPath, ["scripts/seed-test-accounts.mjs", "1", BASE_URL], {
          env: { ...process.env, TEST_RUN_ID: runId },
          encoding: "utf8",
          timeout: 180_000,
        });
        creds = account();
      }
    }
    if (!entered) throw new Error("не удалось войти");
    console.log(`Вход выполнен. Обходим вкладки ${ROUNDS} раз(а).\n`);

    for (let round = 1; round <= ROUNDS; round++) {
      await page.goto(`${BASE_URL}/school/workspace`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await dismissFirstRunDialog(page);
      await page.waitForTimeout(2500);
      for (const tab of TABS) {
        await page.getByRole("tab", { name: new RegExp(tab, "i") }).click({ timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      console.log(`  раунд ${round}: замечаний ${findings.length}`);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const unique = [];
  const seen = new Set();
  for (const f of findings) {
    if (seen.has(f.text)) continue;
    seen.add(f.text);
    unique.push(f);
  }

  const report = [
    `Проверка гидратации: ${BASE_URL}`,
    `Раундов: ${ROUNDS}, вкладок на раунд: ${TABS.length}`,
    "",
    unique.length
      ? unique.map((f) => `НА ${f.where}\n  ${f.text}`).join("\n\n")
      : "Ошибок гидратации не найдено",
  ].join("\n");
  mkdirSync(path.dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, report + "\n", "utf8");
  console.log(`\n${report}`);
  process.exit(unique.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });