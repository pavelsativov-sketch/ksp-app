/**
 * Дымовая проверка живой ОС на развёрнутом Vercel.
 *
 * Локальные и живые тесты гоняют раннер у себя. Этот скрипт проверяет
 * единственное, что иначе не проверить: настоящую цепочку в проде —
 * Vercel Sandbox по OIDC, установку Playwright, раннер, Chromium и отзывчивость
 * ввода через реальную сеть. Идёт настоящим браузером по настоящему
 * интерфейсу, ровно как учитель.
 *
 * Учётные данные берутся из tests/e2e/.accounts.json (создаётся командой
 * `node scripts/seed-test-accounts.mjs 1 <адрес>`) и в вывод не попадают.
 * Форму входа скрипт не отправляет: пароль только печатается.
 *
 * Запуск: node scripts/smoke-production.mjs [адрес]
 *   по умолчанию https://ksp-app-pi.vercel.app
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const BASE_URL = process.argv[2] ?? "https://ksp-app-pi.vercel.app";
const ACCOUNTS = resolve(process.cwd(), "tests", "e2e", ".accounts.json");
const REPORT = resolve(process.cwd(), "node_modules", ".cache", "smoke-production.txt");

/** Учебная страница с полями логина и пароля. Форму не отправляем. */
const FORM_URL = "https://the-internet.herokuapp.com/login";
const VIEWPORT = { width: 1280, height: 800 };

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

function parseHeader(value) {
  if (!value) return undefined;
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return undefined;
  }
}

/** Медиана: среднее время здесь обманывает — один холодный старт лямбды
 *  растягивает его так, что обычный ввод кажется неотзывчивым. */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const creds = account();
  console.log(`Дымовая проверка ОС: ${BASE_URL}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];

  // Каждый запрос вкладки браузера к бэкенду — с временем ответа. Именно эти
  // задержки чувствует учитель, поэтому меряем их, а не время работы скрипта.
  const pending = new Map();
  const calls = [];
  let lastActiveField;
  let lastAuthBarrier;
  let lastPageUrl;

  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 140)));
  page.on("request", (req) => {
    if (req.url().includes("/api/agents/browser-stream")) pending.set(req, Date.now());
  });
  page.on("response", async (res) => {
    const req = res.request();
    const started = pending.get(req);
    if (started === undefined) return;
    pending.delete(req);
    const h = res.headers();
    const call = {
      method: req.method(),
      ms: Date.now() - started,
      status: res.status(),
      type: h["content-type"] ?? "",
      url: decodeURIComponent(h["x-page-url"] ?? ""),
      field: parseHeader(h["x-active-field"]),
      barrier: parseHeader(h["x-auth-barrier"]),
      body: "",
    };
    // Тело ошибки — самое ценное, что можно увидеть: в нём причина, по
    // которой кадр не пришёл.
    if (res.status() >= 400 || h["content-type"]?.includes("json")) {
      call.body = (await res.text().catch(() => "")).slice(0, 300);
    }
    calls.push(call);
    if (call.field) lastActiveField = call.field;
    if (call.barrier) lastAuthBarrier = call.barrier;
    if (call.url) lastPageUrl = call.url;
  });

  try {
    // ── 1. Вход настоящим тестовым учителем ──
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.fill('input[type="email"], input[name="email"]', creds.email);
    await page.fill('input[type="password"]', creds.password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }),
      page.click('button[type="submit"]'),
    ]);
    step("вход тестовым учителем", true, page.url().replace(BASE_URL, "") || "/");

    // ── 2. Вкладка «Браузер» и первый кадр ──
    await page.goto(`${BASE_URL}/school/workspace`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.getByRole("tab", { name: /браузер/i }).click({ timeout: 30_000 });

    // Холодная песочница ставит Playwright, Chromium и системные библиотеки —
// это минуты. Тёплая отвечает за секунды. Вкладка повторяет запрос сама,
// поэтому просто ждём кадра и печатаем, на сколько хватило.
    const started = Date.now();
    let frameReady = false;
    while (Date.now() - started < 480_000) {
      // Кадр кладётся как blob-URL, поэтому судим по загруженной картинке,
      // а не по длине src: у blob-адресов она короткая.
      const info = await page.evaluate(() => {
        const area = document.querySelector('[aria-label="Рабочая область браузера"]');
        const img = area?.querySelector("img");
        if (!img) return null;
        return { complete: img.complete, width: img.naturalWidth, height: img.naturalHeight };
      });
      if (info && info.complete && info.width > 100) { frameReady = true; break; }
      await page.waitForTimeout(2000);
    }
    if (!frameReady) {
      // Кадра нет — показываем ровно то, что видит учитель на экране, и что
      // приходило по сети. Эти две строки вместе обычно объясняют всё.
      const screen = await page.evaluate(() => ({
        area: Boolean(document.querySelector('[aria-label="Рабочая область браузера"]')),
        imgs: document.querySelectorAll('[aria-label="Рабочая область браузера"] img').length,
        text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 220),
      }));
      const failed = calls.filter((c) => c.status >= 400);
      const types = [...new Set(calls.map((c) => c.type.split(";")[0] || "нет"))].join(", ");
      const reason = failed.slice(-2).map((c) => `${c.status}: ${c.body}`).join(" | ")
        || (calls[0]?.body ? `200 c телом: ${calls[0].body}` : "ответов с ошибкой не было");
      step("браузер ОС поднялся в песочнице", false,
        `ожидание ${Math.round((Date.now() - started) / 1000)} с · запросов ${calls.length} · типы: ${types} · область:${screen.area} img:${screen.imgs} · экран: ${screen.text} · ${reason}`);
      throw new Error("кадр не появился — диагностика выше");
    }
    step("браузер ОС поднялся в песочнице", true,
      `ожидание ${Math.round((Date.now() - started) / 1000)} с`);

    // ── 3. Переход на страницу с формой входа ──
    // Адресная строка — обычная React-форма. Если вписать адрес и мгновенно
// нажать Enter, обработчик успевает взять старое значение поля, поэтому печатаем
// по-человечески и даём форме перерисоваться.
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
        if (lastPageUrl?.includes("/login")) { navigated = true; break; }
        await page.waitForTimeout(1000);
      }
    }
    step("переход на страницу входа выполнен", navigated, lastPageUrl ?? "адрес неизвестен");
    if (!navigated) throw new Error("переход на страницу входа не выполнился");

    // ── 4. Баннер «войдите сами» ──
    const bannerShown = await page
      .locator("text=/Кликните на поле логина или пароля|введите логин и пароль/i")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    step("показано предупреждение о входе", bannerShown,
      lastAuthBarrier?.reason?.slice(0, 60) ?? "");

    // ── 5. Находим поле пароля через данные самой ОС ──
    // ОС сообщает активное поле в заголовке X-Active-Field вместе с его
    // координатами в странице. Учитель кликает по кадру; скрипт делает то же,
    // а координаты берёт из ответа — без догадок о вёрстке чужого сайта.
    // Страница нужна только как набор полей ввода: форму не отправляем.
    const canvas = page.locator('[aria-label="Рабочая область браузера"]').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("не нашёл область браузера");
    const scale = box.width / VIEWPORT.width;
    const clickRemote = async (x, y) => {
      await page.mouse.click(box.x + x * scale, box.y + y * scale);
      await page.waitForTimeout(2200);
      return lastActiveField;
    };

    let found = false;
    let attempts = 0;
    let firstField;

    // Ищем поле ввода сеткой по кадру. Точная вёрстка стороннего сайта нам
    // неизвестна и меняется от загрузки к загрузке, поэтому перебираем
    // координаты и повторяем весь поиск: проверка не должна зависеть от того,
    // как именно устроена чужая страница.
    for (let round = 0; round < 2 && !found && !firstField; round++) {
      for (const y of [160, 200, 240, 280, 320, 360, 400]) {
        for (const x of [840, 640, 440, 240]) {
          attempts += 1;
          const field = await clickRemote(x, y);
          if (field?.box) {
            firstField = field;
            if (field.isPassword) found = true;
            break;
          }
        }
        if (firstField || found) break;
      }
    }

    // Обычно пароль лежит прямо под логином. Перебираем вертикальные
    // смещения под найденным полем: расстояние между полями неизвестно.
    if (!found && firstField?.box) {
      const cx = firstField.box.x + firstField.box.width / 2;
      for (const factor of [1.3, 1.7, 2.1, 2.5, 2.9, 1.05, 0.6]) {
        attempts += 1;
        const field = await clickRemote(cx, firstField.box.y + firstField.box.height * factor);
        if (field?.isPassword) { found = true; break; }
      }
    }

    step("поле пароля найдено и распознано", found,
      found
        ? `поле «${lastActiveField?.label ?? "пароль"}» с маскировкой`
        : `активное поле: ${lastActiveField?.label || "нет"} · попыток ${attempts}`);
    if (!found) throw new Error("поле пароля не найдено — ввод не проверяли");

    // ── 6. Отзывчивость ввода: жалобный сценарий целиком ──
    // Базовый круговой путь: ровно один и тот же запрос кадра без ввода и без
    // интерфейса. Всё, что медленнее этого, — цена самого ввода.
    const baselines = [];
    for (let i = 0; i < 4; i++) {
      baselines.push(await page.evaluate(async () => {
        const t = performance.now();
        const res = await fetch("/api/agents/browser-stream?action=screenshot", { cache: "no-store" });
        const blob = await res.blob();
        return { ms: Math.round(performance.now() - t), status: res.status, bytes: blob.size };
      }));
    }
    const baselineMedian = median(baselines.map((b) => b.ms));
    step("круговой путь кадра", baselines.every((b) => b.status === 200),
      `медиана ${baselineMedian} мс, кадр ${baselines[0].bytes} байт`);

    const pollStart = Date.now();
    const beforePolls = calls.length;
    await page.waitForTimeout(4000);
    const polls = calls.slice(beforePolls).filter((c) => c.method === "GET");
    const pollMedian = median(polls.map((c) => c.ms));

    const typing = calls.length;
    for (const chunk of ["Dem", "oPa", "ss2", "026", "De", "mo", "Pa", "ss"]) {
      await page.keyboard.type(chunk, { delay: 60 });
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(2500);

    const typed = calls.slice(typing).filter((c) => c.method === "POST");
    const durations = typed.map((c) => c.ms).sort((a, b) => a - b);
    const medianMs = median(typed.map((c) => c.ms));
    const worst = durations[durations.length - 1] ?? 0;
    const errors = typed.filter((c) => c.status !== 200);
    step("ввод пароля без ошибок", errors.length === 0,
      typed.length ? `запросов ${typed.length}, ошибок ${errors.length}` : "запросов не было");
    step("ввод пароля отзывчив", worst > 0 && worst < 5000,
      `медиана ${medianMs} мс, худший ${worst} мс · кадр сам по себе ${baselineMedian} мс, опрос вкладки ${pollMedian} мс · всего ${Date.now() - pollStart} мс`);

    // Пароль не должен попасть в переписку и лог: поле маскируется.
    const leaked = typed.some((c) => String(c.field?.value ?? "").includes("Demo"));
    step("пароль не показан в поле ввода", !leaked);

    step("без ошибок в странице", pageErrors.length === 0, pageErrors.slice(0, 2).join("; "));
  } catch (err) {
    step("сценарий прерван", false, err instanceof Error ? err.message.slice(0, 220) : String(err));
  } finally {
    await context.close();
    await browser.close();
  }

  const failures = steps.filter((s) => !s.ok).length;
  const report = [
    `Дымовая проверка ОС на ${BASE_URL}`,
    `Дата: ${new Date().toISOString()}`,
    "",
    ...steps.map((s) => `  ${s.ok ? "OK  " : "СБОЙ"} ${s.name}${s.detail ? ` — ${s.detail}` : ""}`),
    "",
    failures ? `ПРОВАЛЕНО ПУНКТОВ: ${failures}` : "Все проверки пройдены",
  ].join("\n");
  mkdirSync(resolve(process.cwd(), "node_modules", ".cache"), { recursive: true });
  writeFileSync(REPORT, report + "\n", "utf8");
  console.log(`\n${failures ? `ПРОВАЛЕНО ПУНКТОВ: ${failures}` : "Все проверки пройдены"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});