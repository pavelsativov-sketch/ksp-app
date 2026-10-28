import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";
const EMAIL = `os.test.${Date.now()}@example.com`;
const PASS = "OsTestPass2026!";
const NAME = "ОС Тест";

const issues = [];
const consoleErrors = [];
const failedRequests = [];

function report(kind, title, detail = "") {
  issues.push({ kind, title, detail: String(detail).slice(0, 400) });
  console.log(`[${kind}] ${title}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("_next/hmr") && !msg.text().includes("WebSocket")) {
    consoleErrors.push(msg.text().slice(0, 300));
  }
});
page.on("requestfailed", (req) => {
  failedRequests.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText ?? "?"}`);
});
page.on("response", (res) => {
  if (res.status() >= 500) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  if (res.url().includes("/api/agents/task") && res.request().method() === "POST") {
    res.text().then((t) => console.log("AGENT_POST_RESP", res.status(), t.slice(0, 300))).catch(() => {});
  }
});

try {
  // ── 1. Регистрация ──
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.fill('input[name="fullName"]', NAME);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(welcome|dashboard|plans|school|login)/, { timeout: 30000 });
  console.log("reg landed:", page.url());

  // ── 2. Создание школы (все обязательные поля) ──
  await page.goto(`${BASE}/school/create`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (page.url().includes("/school/create")) {
    await page.fill('input[name="name"]', "ОС Тестовая школа");
    await page.fill('input[name="code"]', `OS${Date.now().toString().slice(-5)}`);
    await page.fill('input[name="region"]', "г. Тест");
    await page.fill('input[name="city"]', "Тестовск");
    await page.fill('input[name="academic_year"]', "2026-2027");
    await page.selectOption('select[name="shifts"]', "1");
    await page.selectOption('select[name="grading_system"]', "5-point");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log("school create →", page.url());
    // Server action уводит на /school/dashboard при успехе; если остались на
    // /school/create — ищем текст ошибки.
    const schoolErr = await page.evaluate(() => {
      const reds = [...document.querySelectorAll("p, span, div")].map(el => el.textContent?.trim() ?? "")
        .filter(t => /Не удалось|Ошибка|занят|Проверьте|неверно|короткий|минимум/i.test(t));
      return reds.slice(0, 3);
    });
    if (schoolErr.length) report("warning", "UI создания школы: сообщения об ошибке", JSON.stringify(schoolErr));
  }
  const schools = await page.evaluate(async () => {
    const r = await fetch("/api/school");
    return { status: r.status, body: await r.json().catch(() => null) };
  });
  console.log("schools api:", JSON.stringify(schools).slice(0, 300));
  if (schools.body?.schools?.length === 0) {
    report("error", "создание школы не удалось (школ нет)");
  }

  // ── 3. Рабочая область ──
  await page.goto(`${BASE}/school/workspace`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);

  // Вкладка «Рабочий стол» (role=tab)
  const desktopTab = page.locator('[role="tab"]', { hasText: "Рабочий стол" }).first();
  if (await desktopTab.count()) {
    await desktopTab.click();
    await page.waitForTimeout(1500);
    console.log("desktop tab clicked");
  }
  const windows = await page.locator("[class*=shadow-2xl]").count();
  console.log("OS windows после вкладки:", windows);

  // Иконки рабочего стола
  const deskButtons = await page.locator("button").allTextContents();
  const icons = deskButtons.filter((t) => /Браузер|Файлы|Редактор|Терминал|Чат агента|Журнал агента|Работа с компьютером/.test(t));
  console.log("desktop icons:", JSON.stringify(icons.slice(0, 12)));

  // Открыть Терминал иконкой
  const termIcon = page.locator("button", { hasText: /^Терминал$/ }).first();
  if (await termIcon.count()) {
    await termIcon.click();
    await page.waitForTimeout(1200);
    const termText = await page.evaluate(() => document.body.innerText.slice(-300));
    console.log("OS terminal window:", termText.replace(/\n+/g, " | ").slice(-160));
  }

  // Свернуть/развернуть окно
  const minimizeBtn = page.locator("button[aria-label*='Свернуть']").first();
  if (await minimizeBtn.count()) {
    await minimizeBtn.click();
    await page.waitForTimeout(500);
    console.log("windows после minimize (видимых):", await page.locator("[class*=shadow-2xl]").count());
    await page.locator("button[aria-label*='Свернуть']").first().click().catch(() => null);
    await page.waitForTimeout(500);
    console.log("windows после restore:", await page.locator("[class*=shadow-2xl]").count());
  }

  // Перезагрузка — восстановление окон
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  console.log("windows after reload:", await page.locator("[class*=shadow-2xl]").count());

  // ── 4. Агент ──
  await page.goto(`${BASE}/school/workspace`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const ta = page.locator("textarea#agent-prompt, textarea[placeholder*='Опишите задачу' i]").first();
  if (await ta.count()) {
    await ta.fill("Напиши кратко (2–3 предложения): что такое КСП и для чего он нужен учителю.");
    const launchBtn = page.locator("button", { hasText: "Запустить агента" }).first();
    console.log("launch disabled:", await launchBtn.isDisabled());
    await launchBtn.click().catch((e) => report("error", "клик Запустить не удался", e.message));
    await page.waitForTimeout(8000);
    const tasks = await page.evaluate(async () => {
      const r = await fetch("/api/agents/task");
      return await r.json().catch(() => null);
    });
    console.log("agent tasks api:", JSON.stringify(tasks).slice(0, 500));
    if (!tasks?.tasks?.length) report("error", "задача агента не создалась");
  } else {
    report("info", "поле композера агента не найдено");
  }
} catch (e) {
  report("error", "сценарий прерван", e.message);
}

console.log("\n===== ИТОГ =====");
console.log("issues:", issues.length);
for (const i of issues) console.log(` - ${i.kind}: ${i.title} ${i.detail}`);
console.log("console errors (без HMR):", consoleErrors.length);
for (const c of consoleErrors.slice(0, 10)) console.log(`  console: ${c}`);
console.log("failed/5xx requests:", failedRequests.length);
for (const f of failedRequests.slice(0, 15)) console.log(`  req: ${f}`);

await browser.close();
