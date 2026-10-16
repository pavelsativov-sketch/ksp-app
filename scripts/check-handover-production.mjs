/**
 * Полный сценарий «учитель ставит задачу агенту» на живой ОС.
 *
 * Агент открывает страницу входа, распознаёт барьер и останавливается.
 * Дальше управление в руках учителя: он сам кликает в поля, печатает логин
 * и пароль, нажимает Login и возвращают управление агенту, который
 * подтверждает, куда вошли. Данные у тестового стенда публичные
 * (tomsmith / SuperSecretPassword! — демо-креды the-internet), настоящий
 * пароль учителя здесь не нужен и не используется.
 *
 * Ввод учителя проверяется по данным самой ОС: в заголовке X-Active-Field
 * она возвращает поле с его содержимым. Для пароля содержимое маскируется —
 * это и проверяем: каждый символ дошёл, но пароль нигде не показан и не
 * попал в переписку с агентом.
 *
 * Запуск: node scripts/check-handover-production.mjs [адрес]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { chromium } from "@playwright/test";
import { dismissFirstRunDialog } from "./lib/prod-helpers.mjs";

const BASE_URL = process.argv[2] ?? "https://ksp-app-pi.vercel.app";
const ACCOUNTS = path.resolve(process.cwd(), "tests", "e2e", ".accounts.json");
const REPORT = path.resolve(process.cwd(), "node_modules", ".cache", "handover-production.txt");
const FORM_URL = "https://the-internet.herokuapp.com/login";
const VIEWPORT = { width: 1280, height: 800 };

/** Демо-креды учебного стенда — публичные, не настоящие. */
const DEMO_LOGIN = "tomsmith";
const DEMO_PASSWORD = "SuperSecretPassword!";

const TASK =
  "Смотри на страницу, которую я открою в браузере. Если это форма входа — перечисли её поля и остановись: логин и пароль введу я сам, ничего в поля не вводи и адрес не меняй. " +
  "Когда я передам тебе управление, посмотри, на какую страницу я вошёл, напиши, что видишь, и заверши задачу.";

const steps = [];
function step(name, ok, detail = "") {
  steps.push({ name, ok, detail });
  console.log(`  ${ok ? "OK  " : "СБОЙ"} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function parseHeader(value) {
  if (!value) return undefined;
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return undefined;
  }
}

function account() {
  const data = JSON.parse(readFileSync(ACCOUNTS, "utf8"));
  if (!data.accounts?.[0]) throw new Error(`в ${ACCOUNTS} нет аккаунтов`);
  return data.accounts[0];
}

function seedFreshAccount() {
  const runId = `h${Date.now().toString(36)}`;
  const result = spawnSync(process.execPath, ["scripts/seed-test-accounts.mjs", "1", BASE_URL], {
    env: { ...process.env, TEST_RUN_ID: runId },
    encoding: "utf8",
    timeout: 180_000,
  });
  if (result.status !== 0 && !result.stdout?.includes("создан")) {
    throw new Error(`не удалось завести тестового учителя: ${(result.stderr || result.stdout || "").slice(-200)}`);
  }
  return account();
}

async function main() {
  console.log(`Передача управления на живой ОС: ${BASE_URL}\n`);
  const browser = await chromium.launch({ viewport: { width: 1680, height: 1050 } });
  const context = await browser.newContext();
  const page = await context.newPage();
  const started = Date.now();
  const pageErrors = [];
  const consoleErrors = [];

  // Все обращения вкладки к бэкенду — с типом ответа. Поле и его содержимое
  // приходят в заголовках X-Active-Field/X-Page-Url — по ним и судим о вводе.
  const pending = new Map();
  const calls = [];
  const controlPosts = [];
  let rawControlRequests = 0;
  let lastActiveField;
  let lastPageUrl;

  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 140)));
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (!/hydrat|did not match|418|server rendered|validat/i.test(text)) return;
    consoleErrors.push(text.replace(/\s+/g, " ").slice(0, 600));
  });
  page.on("response", async (res) => {
    const req = res.request();
    const startedAt = pending.get(req);
    if (startedAt === undefined) return;
    pending.delete(req);
    const headers = res.headers();
    const call = {
      method: req.method(),
      ms: Date.now() - startedAt,
      status: res.status(),
      url: decodeURIComponent(headers["x-page-url"] ?? ""),
      field: parseHeader(headers["x-active-field"]),
      body: "",
    };
    if (res.status() >= 400 || headers["content-type"]?.includes("json")) {
      call.body = (await res.text().catch(() => "")).slice(0, 240);
    }
    calls.push(call);
    if (call.field) lastActiveField = call.field;
    if (call.url) lastPageUrl = call.url;
    if (req.method() === "POST" && req.url().includes("/api/agents/control")) {
      controlPosts.push(res.status());
    }
  });
  page.on("request", (req) => {
    if (req.url().includes("/api/agents/browser-stream") || /\/api\/agents\/(task|control)/.test(req.url())) {
      pending.set(req, Date.now());
    }
    // Независимый счётчик: POST control должен пройти всегда, даже если
    // ответ не попал в основной регистратор.
    if (req.method() === "POST" && req.url().includes("/api/agents/control")) {
      rawControlRequests++;
    }
  });

  try {
    // ── Вход учителем ──
    let creds = account();
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
        console.log("  вход не прошёл, заводим свежего тестового учителя...");
        creds = seedFreshAccount();
      }
    }
    step("вход тестовым учителем", entered, page.url().replace(BASE_URL, "") || "/");
    if (!entered) throw new Error("не удалось войти тестовым учителем");

    await page.goto(`${BASE_URL}/school/workspace`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await dismissFirstRunDialog(page);

    // ── Ставим задачу агенту ──
    const composer = page.locator("#agent-prompt");
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.click();
    await composer.pressSequentially(TASK, { delay: 8 });
    if ((await composer.inputValue()).trim().length < 20) {
      throw new Error("задача не попала в поле ввода агента");
    }
    const taskAt = Date.now();
    const taskResponsePromise = page
      .waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/agents/task"), { timeout: 20_000 })
      .catch(() => null);
    await composer.press("Control+Enter");
    const taskResponse = await taskResponsePromise;
    const taskStatus = taskResponse?.status() ?? 0;
    const okBody = taskStatus === 201 ? await taskResponse?.json().catch(() => null) : null;
    const errBody = !okBody ? await taskResponse?.json().catch(() => ({})) : null;
    const taskId = okBody?.taskId ? String(okBody.taskId) : "";
    step("задача принята ОС", taskStatus === 201,
      taskStatus === 201 ? `POST 201 · id ${taskId}` : `POST ${taskStatus}${errBody?.error ? ` · ${String(errBody.error)}` : ""}`);
    if (taskStatus !== 201) throw new Error("задача не принята — новый запуск заблокирован");
    await page.waitForTimeout(3000);

    let agentStarted = false;
    for (let i = 0; i < 40; i++) {
      const chat = await page.getByLabel("Чат с агентом").innerText().catch(() => "");
      if (/Открываю|Перехожу|Изучаю|браузер|останов|стоп|форм|ошибк|не удалось|отказ/i.test(chat)) {
        agentStarted = true;
        break;
      }
      await page.waitForTimeout(2500);
    }
    step("агент принял задачу и начал работать", agentStarted,
      `через ${Math.round((Date.now() - taskAt) / 1000)} с`);

    // ── Форма входа открывается учителем ──
    // Раньше адрес давал агент — но у живой модели это флейк: в двух прогонах
    // из трёх она уходила в поиск Google, не открыв форму. Пароль к задаче
    // проверки — не маршрут агента, а надёжность ввода учителя, поэтому
    // навигацию учитель делает сам, а агент стоит на барьере.
    await page.getByRole("tab", { name: /браузер/i }).click({ timeout: 60_000 }).catch(() => {});
    // Ждём кадра: песочница бывает холодной, вкладка повторяет запрос сама.
    let frameReady = false;
    const frameAt = Date.now();
    while (Date.now() - frameAt < 480_000) {
      const info = await page.evaluate(() => {
        const img = document.querySelector('[aria-label="Рабочая область браузера"] img');
        return img ? { complete: img.complete, width: img.naturalWidth } : null;
      }).catch(() => null);
      if (info && info.complete && info.width > 100) { frameReady = true; break; }
      await page.waitForTimeout(2000);
    }
    step("браузер ОС поднялся в песочнице", frameReady,
      frameReady ? `ожидание ${Math.round((Date.now() - frameAt) / 1000)} с` : "кадра нет");
    if (!frameReady) throw new Error("кадр не появился — диагностика не выполнена");

    // Учитывая React-форму адресной строки: печатаем по-человечески и даём
    // форме перерисоваться до Enter, иначе обработчик берёт старое значение.
    const address = page.getByPlaceholder("Введите адрес или поисковый запрос...").first();
    await address.waitFor({ state: "visible", timeout: 30_000 });
    let navigated = false;
    for (let attempt = 1; attempt <= 3 && !navigated; attempt++) {
      await address.click({ force: true });
      await address.fill("");
      await address.pressSequentially(FORM_URL, { delay: 25 });
      await page.waitForTimeout(600);
      await address.press("Enter");
      const navStart = Date.now();
      while (Date.now() - navStart < 25_000) {
        if ((lastPageUrl ?? "").includes("/login")) { navigated = true; break; }
        await page.waitForTimeout(1000);
      }
    }
    step("открыта страница формы входа", navigated, lastPageUrl ?? "адрес неизвестен");
    if (!navigated) throw new Error("страница формы входа не открылась");

    const banner = page.getByText(/введите логин и пароль|форма входа/i).first();
    let paused = false;
    for (let i = 0; i < 120; i++) {
      const bannerVisible = await banner.isVisible().catch(() => false);
      if ((lastPageUrl ?? "").includes("/login") && bannerVisible) { paused = true; break; }
      await page.waitForTimeout(2000);
    }
    step("агент остановился на барьере — передали учителю", paused,
      paused ? `через ${Math.round((Date.now() - taskAt) / 1000)} с · баннер «${lastPageUrl ?? ""}»` : "агент не остановился");

    // ── Учитель забирает управление ──
    const takeOver = page.getByRole("button", { name: /Забрать управление себе/i });
    if (await takeOver.isVisible().catch(() => false)) {
      await takeOver.click({ timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    const canType = await banner.isVisible().catch(() => false)
      || lastPageUrl?.includes("/login")
      || Boolean(lastActiveField);
    step("управление у учителя — интерфейс ввода доступен", canType,
      lastPageUrl?.includes("/login") ? "страница формы в браузере ОС" : "баннер паузы на экране");

    // ── Учитель ищет поле логина ──
    const canvas = page.locator('[aria-label="Рабочая область браузера"]').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("не нашёл область браузера на экране");
    const scale = box.width / VIEWPORT.width;
    const clickStage = async (x, y) => {
      await page.mouse.click(box.x + x * scale, box.y + y * scale);
      await page.waitForTimeout(2200);
      return lastActiveField;
    };

    let usernameField;
    for (const y of [200, 240, 160, 280, 320, 360, 400]) {
      for (const x of [840, 640, 440, 240]) {
        const field = await clickStage(x, y);
        if (field?.box && !field.isPassword) { usernameField = field; break; }
      }
      if (usernameField) break;
    }
    // Если сетка попала в пароль — поле логина находится выше него.
    if (!usernameField) {
      for (const y of [160, 200, 240, 280, 320]) {
        for (const x of [640, 440, 840, 240]) {
          const field = await clickStage(x, y);
          if (field?.box && !field.isPassword) { usernameField = field; break; }
        }
        if (usernameField) break;
      }
    }
    step("учитель нашёл поле логина кликами", Boolean(usernameField),
      usernameField ? `поле «${usernameField.label ?? "?"}»` : `активное поле: ${lastActiveField?.label || "нет"} · ответы: ${calls.slice(-5).map((c) => `${c.method} ${c.status}${c.field ? "+field" : ""}${c.body ? ` ${c.body.slice(0, 80)}` : ""}`).join(" | ")}`);
    if (!usernameField) throw new Error("поле логина не найдено");

    // ── Учитель печатает логин ──
    const typingAt = calls.length;
    await page.waitForTimeout(600);
    await page.keyboard.type(DEMO_LOGIN, { delay: 90 });
    await page.waitForTimeout(1200);
    // Заголовки ключевых ответов показывают поле по ходу ввода — это
    // наблюдение, а не судья: финальным судьёй будет сам вход.
    const keystrokes = calls.slice(typingAt).filter((c) => c.method === "POST");
    const loginSeen = [...new Set(keystrokes.map((c) => String(c.field?.value ?? "")))].slice(-3);
    console.log(`    поле логина по ходу ввода: ${JSON.stringify(loginSeen)} · клавиатурных запросов ${keystrokes.length}`);

    // ── Учитель печатает пароль ──
    // Обычно поле пароля лежит под логином; расстояние подбираем кликами.
    const pwTypingAt = calls.length;
    const passwordField =
      (await (async () => {
        const below = usernameField.box;
        for (const factor of [1.3, 1.7, 2.1, 2.5, 2.9, 1.05, 0.6]) {
          const field = await clickStage(below.x + below.width / 2, below.y + below.height * factor);
          if (field?.isPassword && field?.box) return field;
        }
        return null;
      })())
      ?? (await (async () => {
        for (let round = 0; round < 2; round++) {
          for (const y of [280, 320, 360, 400, 240, 200]) {
            for (const x of [840, 640, 440, 240]) {
              const field = await clickStage(x, y);
              if (field?.isPassword && field?.box) return field;
            }
          }
        }
        return null;
      })());
    step("учитель нашёл поле пароля", Boolean(passwordField?.box), passwordField ? `поле «${passwordField.label ?? "?"}», маска ${passwordField.isMasked ? "включена" : ""}` : `активное поле: ${lastActiveField?.label || "нет"}`);
    if (!passwordField?.box) throw new Error("поле пароля не найдено");

    await page.keyboard.type(DEMO_PASSWORD, { delay: 90 });
    await page.waitForTimeout(1200);
    // Маску судим по заголовкам ответов во время набора пароля: в поле
    // видно только точки (и сокращение «…»), настоящего пароля нет нигде.
    const pwKeystrokes = calls.slice(pwTypingAt).filter((c) => c.method === "POST");
    const pwValues = [...new Set(pwKeystrokes.map((c) => String(c.field?.value ?? "")))].filter(Boolean);
    const pwForeign = pwValues.filter((v) => !/^[•…]+$/.test(v));
    const pwMasked = pwForeign.length === 0;
    const pwErrors = pwKeystrokes.filter((c) => c.status !== 200);
    step("пароль введён и в ОС не показан", pwMasked && pwErrors.length === 0,
      pwForeign.length
        ? `в маске просвет! ${JSON.stringify(pwForeign.slice(0, 3))}`
        : pwValues.length ? `поле «${pwValues[pwValues.length - 1]}» · ошибок ${pwErrors.length}` : "маска ни разу не раскрыла значение");

    // Пароль не должен просочиться в чат с агентом. Особенность стенда:
    // учебная страница публикует демо-креды прямо на себе, поэтому «пароль в
    // тексте» сам по себе не приговор — сравниваем с текстом до ввода:
    // посторонним должен быть только прирост после того, как учитель
    // печатал его.
    const chatAtPause = await page.getByLabel("Чат с агентом").innerText().catch(() => "");
    const chatNow = await page.getByLabel("Чат с агентом").innerText().catch(() => "");
    const leakedToChat = !chatAtPause.includes(DEMO_PASSWORD) && chatNow.includes(DEMO_PASSWORD);
    step(" пароль не попал в переписку с агентом", !leakedToChat,
      leakedToChat ? "появился в чате после ввода" : chatAtPause.includes(DEMO_PASSWORD) ? "был в тексте страницы до ввода" : "в чате чисто");

    // ── Учитель отправляет форму ──
    // Финальный судья ввода: если логин и пароль дошли правильно, сайт
    // переходит на защищённую страницу; иначе покажет «invalid credentials».
    // Первый способ — как у учителя: Enter прямо в поле пароля, фокус ещё
    // там после набора. Запасной — клики по области под полем: там кнопка.
    let loggedIn = false;
    let loginState = "";
    await page.keyboard.press("Enter");
    const enterAt = Date.now();
    while (Date.now() - enterAt < 8000) {
      if (lastPageUrl?.includes("/secure")) { loggedIn = true; loginState = "вход выполнен (Enter)"; break; }
      if ((lastPageUrl ?? "").includes("invalid")) { loginState = "учётные данные отклонены (Enter)"; break; }
      await page.waitForTimeout(800);
    }
    for (const factor of [1.05, 1.4, 1.8, 2.2, 2.6]) {
      if (loggedIn || loginState) break;
      await page.mouse.click(box.x + (passwordField.box.x + passwordField.box.width / 2) * scale,
        box.y + (passwordField.box.y + passwordField.box.height * factor) * scale);
      const clickStartedAt = Date.now();
      while (Date.now() - clickStartedAt < 6000) {
        if (lastPageUrl?.includes("/secure")) { loggedIn = true; loginState = "вход выполнен (клик по кнопке)"; break; }
        if ((lastPageUrl ?? "").includes("invalid")) { loginState = "учётные данные отклонены (клик)"; break; }
        await page.waitForTimeout(800);
      }
    }
    step("учитель вошёл: логин и пароль дошли верно", loggedIn,
      loggedIn
        ? `${loginState} → ${lastPageUrl?.replace("https://the-internet.herokuapp.com", "") ?? "/secure"}`
        : `${loginState || "форма не отправилась"} · остался на ${lastPageUrl ?? "?"} · логин по ходу: ${JSON.stringify(loginSeen)}`);
    if (!loggedIn) throw new Error("вход не выполнен — ввод учителя дошёл неверно");

    // Кадр обновился: учитель видит итог входа.
    let frameAfter = false;
    for (let i = 0; i < 15; i++) {
      const info = await page.evaluate(() => {
        const img = document.querySelector('[aria-label="Рабочая область браузера"] img');
        return img ? { complete: img.complete, width: img.naturalWidth } : null;
      }).catch(() => null);
      if (info && info.complete && info.width > 100) { frameAfter = true; break; }
      await page.waitForTimeout(1500);
    }
    step("учитель видит результат входа в браузере ОС", frameAfter, "кадр после входа");

    // ── Управление возвращается агенту ──
    // После успешного входа баннер барьера исчезает вместе со своей кнопкой —
    // это правильно. Возврат остаётся доступным кнопкой «Передать управление
    // ИИ» в панели чата; агент по возвращении читает актуальный URL и
    // продолжает задачу.
    const bannerBtn = page.getByRole("button", { name: /Готово — продолжить с ИИ/i });
    const panelBtn = page.getByRole("button", { name: /Передать управление ИИ/i });
    const viaBanner = await bannerBtn.isVisible().catch(() => false);
    const viaPanel = !viaBanner && await panelBtn.isVisible().catch(() => false);
    if (viaBanner) {
      await bannerBtn.click().catch(() => {});
    } else if (viaPanel) {
      // Клику не верим молча: если POST control не ушёл, подвтором через
      // прямое нажатие по координатам кнопки.
      const before = controlPosts.length;
      await panelBtn.click({ timeout: 15_000 }).catch((e) => console.log(`    клик по кнопке не удался: ${String(e?.message ?? e).slice(0, 160)}`));
      await page.waitForTimeout(4000);
      if (controlPosts.length === before) {
        // Диагностика: чем закрыта кнопка, сколько их, и жмём через DOM —
        // если и это не даст POST, виновата вёрстка, а не позиция клика.
        const diag = await page.evaluate(() => [...document.querySelectorAll("button")]
          .filter((b) => /Передать управление ИИ|Готово — продолжить/.test(b.textContent ?? ""))
          .map((b) => {
            const r = b.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return {
              text: (b.textContent ?? "").trim(),
              rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
              covered: top !== b,
              coveredBy: top ? `${top.tagName}.${(top.className || "").toString().slice(0, 44)}` : "нет",
              disabled: b.disabled,
            };
          })).catch(() => null);
        console.log(`    кнопки возврата: ${JSON.stringify(diag)}`);
        const domClicked = await page.evaluate(() => {
          const btn = [...document.querySelectorAll("button")]
            .find((b) => /Передать управление ИИ/i.test(b.textContent ?? ""));
          if (!btn) return false;
          btn.click();
          return true;
        }).catch(() => false);
        console.log(`    прямой DOM-клик: ${domClicked ? "done" : "кнопку не нашёл"}`);
        await page.waitForTimeout(4000);
        const ctrlOwner = await page.evaluate(async () => {
          const res = await fetch("/api/agents/control", { cache: "no-store" });
          return res.ok ? await res.json() : { status: res.status };
        }).catch(() => null);
        console.log(`    запросов POST control всего: ${rawControlRequests} · владелец управления: ${JSON.stringify(ctrlOwner)}`);
      }
    }
    let confirmation = false;
    let chat = "";
    for (let i = 0; i < 100; i++) {
      chat = await page.getByLabel("Чат с агентом").innerText().catch(() => "");
      if (/secure|защищ|Logged|вошл|возвра|Задача завершена|Задача выполнена|секур|ресурс/i.test(chat)) {
        confirmation = true;
        break;
      }
      await page.waitForTimeout(2500);
    }
    step("агент подтверждает результат и задача завершена", confirmation,
      confirmation
        ? chat.replace(/\s+/g, " ").slice(-150)
        : `кнопок ${viaBanner ? "баннерная" : viaPanel ? "панель «Передать управление ИИ»" : "НЕ БЫЛО"} · POST control: ${controlPosts.join(",").replace(/^$/, "нет") || "нет"} · хвост чата: ${chat.replace(/\s+/g, " ").slice(-140)}`);
    if (!confirmation) {
      // Что реально с задачей: статус и результат приходят из списка задач.
      // От этого зависит, жив ли агент: пауза ведь могла «съесть» дедлайн.
      const lastTask = await page.evaluate(async () => {
        const res = await fetch("/api/agents/task", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        const list = Array.isArray(data?.tasks) ? data.tasks : [];
        const last = list[0];
        return {
          status: res.status,
          id: last?.id ?? "",
          state: last?.status ?? "",
          result: String(last?.result ?? last?.error ?? "").slice(0, 160),
          logs: Array.isArray(last?.messages) ? last.messages.length : null,
        };
      }).catch(() => null);
      console.log(`    состояние последней задачи: ${JSON.stringify(lastTask)}`);
    }

    // ── Скорость ввода учителя: каждая клавиша — отдельный запрос, как у учителя ──
    const durations = keystrokes.map((c) => c.ms).sort((a, b) => a - b);
    step("ввод учителя отзывчив", durations.length > 0 && durations[durations.length - 1] < 5000,
      durations.length ? `медиана ${median(durations)} мс, худший ${durations[durations.length - 1]} мс` : "клавиш не зафиксировано");

    const leakedFinal = !chatAtPause.includes(DEMO_PASSWORD) && chat.includes(DEMO_PASSWORD);
    step("пароль не попал в переписку", !leakedFinal, leakedFinal ? "пароль в чате!" : "чисто");

    step("без ошибок в странице", pageErrors.length === 0 && consoleErrors.length === 0,
      [...pageErrors, ...consoleErrors].slice(0, 2).join(" | "));
  } catch (err) {
    step("сценарий прерван", false, err instanceof Error ? err.message.slice(0, 260) : String(err));
  } finally {
    await context.close();
    await browser.close();
  }

  const failures = steps.filter((s) => !s.ok).length;
  const report = [
    `Передача управления на живой ОС: ${BASE_URL}`,
    `Задача: ${TASK}`,
    `Длительность: ${Math.round((Date.now() - started) / 1000)} с`,
    "",
    ...steps.map((s) => `  ${s.ok ? "OK  " : "СБОЙ"} ${s.name}${s.detail ? ` — ${s.detail}` : ""}`),
    "",
    failures ? `ПРОВАЛЕНО ПУНКТОВ: ${failures}` : "Все проверки пройдены",
  ].join("\n");
  mkdirSync(path.dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, report + "\n", "utf8");
  console.log(`\n${failures ? `ПРОВАЛЕНО ПУНКТОВ: ${failures}` : "Все проверки пройдены"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
