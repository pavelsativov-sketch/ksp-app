/**
 * Агент на живом проде: настоящая модель, боевая Vercel Sandbox, развёрнутые
 * функции. Локальные живые тесты гоняют раннер у себя, поэтому связка
 * «агент → песочница на Vercel» оставалась непроверенной.
 *
 * Сценарий учителя: поставить задачу в composer, дождаться, что агент сам
 * откроет вкладку «Браузер», дойдёт до страницы с формой входа, остановится
 * и попросит ввести пароль вручную (пароль за агента не вводится), после
 * возврата управления — закончит задачу.
 *
 * Форму входа не отправляем: чужие учётные данные не используются.
 * Проверка тратит квоту AI-провайдера, поэтому запускается вручную.
 *
 * Запуск: node scripts/check-agent-production.mjs [адрес]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { chromium } from "@playwright/test";
import { dismissFirstRunDialog } from "./lib/prod-helpers.mjs";

const BASE_URL = process.argv[2] ?? "https://ksp-app-pi.vercel.app";
const ACCOUNTS = path.resolve(process.cwd(), "tests", "e2e", ".accounts.json");
const REPORT = path.resolve(process.cwd(), "node_modules", ".cache", "agent-production.txt");

/** Учебная страница с формой входа: агент дойдёт до неё и остановится. */
const TASK = "Открой https://the-internet.herokuapp.com/login в браузере и посмотри, что на странице.";

const steps = [];

function step(name, ok, detail = "") {
  steps.push({ name, ok, detail });
  console.log(`  ${ok ? "OK  " : "СБОЙ"} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

function account() {
  const data = JSON.parse(readFileSync(ACCOUNTS, "utf8"));
  const first = data.accounts?.[0];
  if (!first) throw new Error(`в ${ACCOUNTS} нет аккаунтов`);
  return first;
}

async function main() {
  let creds = account();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
  const page = await context.newPage();
  const started = Date.now();

  // Каждый запрос к агенту с ответом: без этого нельзя отличить «агент не
  // пошёл» от «агент пошёл и молчит».
  const api = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (!/\/api\/agents/.test(url) || /browser-stream/.test(url)) return;
    api.push({
      path: url.replace(BASE_URL, "").replace(/\?.*/, ""),
      method: res.request().method(),
      status: res.status(),
      body: res.status() >= 400 ? (await res.text().catch(() => "")).slice(0, 200) : "",
    });
  });

  try {
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
        spawnSync(process.execPath, ["scripts/seed-test-accounts.mjs", "1", BASE_URL], {
          env: { ...process.env, TEST_RUN_ID: `a${Date.now().toString(36)}` },
          encoding: "utf8",
          timeout: 180_000,
        });
        creds = account();
      }
    }
    if (!entered) throw new Error("не удалось войти тестовым учителем");
    step("вход тестовым учителем", true, page.url().replace(BASE_URL, ""));

    await page.goto(`${BASE_URL}/school/workspace`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    // У нового учителя поверх всей страницы висит приветственное окно. Пока
    // его не закрыли, поле задачи недоступно и агента не запустить.
    const onboarded = await dismissFirstRunDialog(page);
    if (onboarded) console.log("  закрыто окно первого входа");

    // ── Ставим задачу агенту как учитель ──
    // Печатаем, а не подставляем значение: кнопка запуска зависит от
    // состояния React, и мгновенная подстановка оставляет её disabled.
    const composer = page.locator("#agent-prompt");
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.click();
    await composer.pressSequentially(TASK, { delay: 10 });
    // Подсказок «Опишите задачу» на странице несколько, и текст уходил не в
    // то поле — задача просто не отправлялась. Проверяем, что дошла.
    if ((await composer.inputValue()).trim().length < 10) {
      throw new Error("задача не попала в поле ввода агента");
    }

    // Кнопку берём по тексту, а не по роли: панель агента на узком экране
// сворачивается, и по роли Playwright считает кнопку невидимой.
    // Отправляем задачу так, как предлагает сам интерфейс: Ctrl+Enter в поле
    // задачи. Кнопка «Запустить агента» перекрывается панелью, а горячая
    // клавиша — тот же путь, которым пользуется учитель.
    const taskAt = Date.now();
    await composer.press("Control+Enter");
    await page.waitForTimeout(3000);

    // ── Агент принял задачу ──
    // Смотрим переписку ДО открытия вкладки «Браузер»: иначе кадр показал бы
    // браузер, который открыл сам тест, и ничего бы не доказывал.
    let agentStarted = false;
    for (let i = 0; i < 40; i++) {
      const chat = await page.getByLabel("Чат с агентом").innerText().catch(() => "");
      if (/Открываю|Перехожу|Изучаю|Инструмент|браузер|ошибк|не удалось|отказ/i.test(chat)) {
        agentStarted = true;
        break;
      }
      await page.waitForTimeout(2500);
    }
    step("агент принял задачу и начал работать", agentStarted,
      `через ${Math.round((Date.now() - taskAt) / 1000)} с`);

    // ── Смотрим браузер, в котором работает агент ──
    await page.getByRole("tab", { name: /браузер/i }).click({ timeout: 60_000 }).catch(() => {});
    let frameSeen = false;
    for (let i = 0; i < 60; i++) {
      const info = await page.evaluate(() => {
        const img = document.querySelector('[aria-label="Рабочая область браузера"] img');
        return img ? { complete: img.complete, width: img.naturalWidth } : null;
      }).catch(() => null);
      if (info && info.complete && info.width > 100) { frameSeen = true; break; }
      await page.waitForTimeout(2000);
    }
    step("браузер агента показывает страницу", frameSeen,
      frameSeen ? `через ${Math.round((Date.now() - taskAt) / 1000)} с` : "кадра нет");

    // ── Дошёл ли агент до страницы с формой входа ──
    // Признак один: ОС показывает баннер «введите логин и пароль».
    const loginBanner = page.getByText(/введите логин и пароль|форма входа/i).first();
    let reachedLogin = false;
    for (let i = 0; i < 60; i++) {
      if (await loginBanner.isVisible().catch(() => false)) { reachedLogin = true; break; }
      await page.waitForTimeout(2000);
    }
    step("агент дошёл до страницы с формой входа", reachedLogin,
      reachedLogin ? `через ${Math.round((Date.now() - taskAt) / 1000)} с` : "не дошёл");

    // ── Агент обязан остановиться и отдать пароль учителю ──
    step("агент остановился и позвал учителя вводить пароль",
      await loginBanner.isVisible().catch(() => false));

    // Учитель пароль в чужой сервис не вводит, поэтому нажимать «продолжить» может
    // и не быть: кнопка появляется, когда учитель берёт управление на себя.
    // Проверяем, что агент оставил задачу в состоянии ожидания, а не завис.
    const handover = page.getByRole("button", { name: /Готово — продолжить с ИИ/i });
    const hasHandover = await handover.isVisible().catch(() => false);
    const canTakeOver = await page
      .getByRole("button", { name: /Забрать управление себе/i })
      .isVisible().catch(() => false);
    step("агент передал управление учителю", hasHandover || canTakeOver,
      hasHandover ? "есть кнопка возврата" : canTakeOver ? "есть кнопка «Забрать управление себе»" : "нет ни одной");

    // ── Задача должна завершиться ──
    let finished = false;
    let chat = "";
    for (let i = 0; i < 120; i++) {
      chat = await page.getByLabel("Чат с агентом").innerText().catch(() => "");
      if (/Задача завершена|Задача выполнена|Выполнено|completed/i.test(chat)) { finished = true; break; }
      await page.waitForTimeout(2500);
    }
    step("агент завершил задачу", finished,
      finished ? chat.replace(/\s+/g, " ").slice(-160) : `ждём ${Math.round((Date.now() - taskAt) / 1000)} с`);

    // Что бы ни случилось выше, показываем переписку: по ней видно, что
    // агент думал и почему остановился. Без неё отчёт бесполезен.
    const chatTail = chat.replace(/\s+/g, " ").slice(-500);
    globalThis.__chatTail = chatTail;
    globalThis.__api = api;
    console.log(`\n  Переписка (хвост): ${chatTail || "пусто"}`);
    console.log(`  Обращения к /api/agents: ${api.length ? api.map((a) => `${a.method} ${a.path} → ${a.status}${a.body ? ` ${a.body}` : ""}`).join("; ") : "не было"}`);
  } catch (e) {
    step("сценарий прерван", false, e instanceof Error ? e.message.slice(0, 900) : String(e));
  } finally {
    await context.close();
    await browser.close();
  }

  const failures = steps.filter((s) => !s.ok).length;
  const chatTail = (globalThis.__chatTail ?? "").replace(/\s+/g, " ").slice(-700);
  const report = [
    `Агент на живом проде: ${BASE_URL}`,
    `Задача: ${TASK}`,
    `Длительность: ${Math.round((Date.now() - started) / 1000)} с`,
    "",
    ...steps.map((s) => `  ${s.ok ? "OK  " : "СБОЙ"} ${s.name}${s.detail ? ` — ${s.detail}` : ""}`),
    "",
    `Переписка (хвост): ${chatTail || "пусто"}`,
    `Обращения к /api/agents: ${globalThis.__api?.length ? globalThis.__api.map((a) => `${a.method} ${a.path} → ${a.status}${a.body ? ` ${a.body}` : ""}`).join("; ") : "не было"}`,
    "",
    failures ? `ПРОВАЛЕНО ПУНКТОВ: ${failures}` : "Все проверки пройдены",
  ].join("\n");
  mkdirSync(path.dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, report + "\n", "utf8");
  console.log(`\n${failures ? `ПРОВАЛЕНО ПУНКТОВ: ${failures}` : "Все проверки пройдены"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });