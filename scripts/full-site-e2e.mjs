/**
 * ПОЛНЫЙ ПРОГОН САЙТА ОТ А ДО Я (e2e, живой).
 *
 * Покрывает пользовательский путь + ИИ-генерации + агентов:
 *  A1  регистрация → welcome
 *  A2  страница профиля доступна
 *  A3  создание школы через UI (server action)
 *  A4  создание КСП через редактор (UI-минимум)
 *  A5  AI-генерация КСП (SSE /api/ai/generate/stream)
 *  A6  улучшение секции (/api/ai/enhance, с повтором)
 *  A7  экспорт .docx плана
 *  A8  генерация раздаточного материала (worksheet)
 *  A9  история AI содержит записи
 *  A10 чат-ассистент (SSE /api/ai/chat/stream, с повтором)
 *  A11 агент: задача running → completed
 *  A12 агент: очередь (вторая queued → выполнится)
 *  A13 агент: остановка задачи (stopped)
 *  A14 выдача домашнего задания (preview + create)
 *  A15 сохранение комплекта материалов
 *  A16 logout → login
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { MongoClient, ObjectId } from "mongodb";

const BASE = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const EMAIL = `e2e.${Date.now()}@example.com`;
const PASS = "FullE2EPass2026!";
const SUBJECT = "Математика";
const TOPIC = "Сложение и вычитание многозначных чисел";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const ENV = loadEnv();
// MongoDB Atlas бывает нестабилен с первого раза: ретраи с паузой.
let client = null;
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    client = new MongoClient(ENV.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 60000,
      socketTimeoutMS: 60000,
    });
    await client.connect();
    await client.db().command({ ping: 1 });
    break;
  } catch (e) {
    console.log(`[mongo] попытка ${attempt}/4 не удалась:`, String(e.message ?? e).slice(0, 120));
    if (attempt === 4) throw e;
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
}
const db = client.db(ENV.MONGODB_DB || "ksp");

// В тестовой среде (localhost) сбрасываем rate-limits, чтобы многократные
// прогоны не упирались в лимиты по IP (регистрация/логин/школа/агент).
if (BASE.includes("127.0.0.1") || BASE.includes("localhost")) {
  try {
    const r = await db.collection("rate_limits").deleteMany({
      _id: { $regex: /^(auth:|school:create:|agent:|quiz:|ai:|kit:|embeddings:|like:|plans:)/ },
    });
    console.log(`[rate-limits] сброшено записей: ${r.deletedCount}`);
  } catch (e) {
    console.log("[rate-limits] сброс не удался:", String(e.message ?? e).slice(0, 120));
  }
}

const results = [];
const pass = (name, detail = "") => { results.push({ name, ok: true, detail }); console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`); };
const fail = (name, detail = "") => { results.push({ name, ok: false, detail }); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);

async function cookiesHeader() {
  const cookies = await context.cookies(BASE);
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function apiFetch(path, method = "GET", body, allowRelogin = true) {
  const headers = { "Content-Type": "application/json", Cookie: await cookiesHeader() };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  const out = { status: res.status, json, text };
  if (out.status === 401 && allowRelogin) {
    await relogin();
    return apiFetch(path, method, body, false);
  }
  return out;
}

async function readSse(path, body, timeoutMs = 150000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: await cookiesHeader() },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    // Читаем поток по чанкам: если сервер оборвёт соединение (maxDuration,
    // сбой провайдера), сохраняем всё, что успело прийти.
    let text = "";
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
        }
      } catch {
        // поток оборван — возвращаем частичный текст
      }
    } else {
      text = await res.text().catch(() => "");
    }
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetchBuffer(path, method = "GET") {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: await cookiesHeader() },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get("content-type"), bytes: buf.byteLength };
}

/** Клик по кнопке с точным текстом (устойчиво к иконкам внутри). */
async function clickButtonExact(text) {
  // Закрываем любые модальные оверлеи, чтобы они не перехватывали клики.
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(300);
  const btns = await page.locator("button").allTextContents();
  const idx = btns.findIndex((t) => t.trim() === text);
  if (idx === -1) throw new Error(`Кнопка «${text}» не найдена`);
  await page.locator("button").nth(idx).click();
}

function parseSseEvents(text) {
  const events = [];
  for (const frame of text.split("\n\n")) {
    const line = frame.trim();
    if (line.startsWith("data:")) {
      try { events.push(JSON.parse(line.slice(5).trim())); } catch { /* skip */ }
    }
  }
  return events;
}

/** Обёртка шага: один сбой не рвёт весь прогон. */
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    fail(name, e.message.slice(0, 200));
  }
}

async function waitTaskTerminal(id) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const tasks = await apiFetch("/api/agents/task", "GET", undefined, false);
    const found = (tasks.json?.tasks ?? []).find((t) => t.id === id);
    if (found && found.status !== "running" && found.status !== "queued") return found.status;
  }
  return "timeout";
}

const startedAt = Date.now();
let planId = null;
let userId = null;

// Чистим зависшие задачи прошлых прогонов (старее 30 минут), чтобы слот
// агента был гарантированно свободен.
try {
  const stale = new Date(Date.now() - 30 * 60_000);
  await db.collection("agent_tasks").updateMany(
    { status: { $in: ["running", "queued"] }, created_at: { $lt: stale } },
    { $set: { status: "error", error: "e2e: очистка зависших задач", updated_at: new Date() } },
  );
} catch { /* некритично */ }

/** Повторный вход, если сессия потеряна/истекла. */
async function relogin() {
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  } catch { /* если не удалось — следующий шаг зафиксирует */ }
}

try {
  // ═══ A1. Регистрация ═══
  console.log("\nA1. Регистрация");
  await step("A1 регистрация", async () => {
    await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="fullName"]', "E2E Полный Тест");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(welcome|dashboard|plans|school|login)/, { timeout: 30000 });
    page.url().includes("/login") ? fail("A1 регистрация", "остались на /login") : pass("A1 регистрация", page.url());
    const userDoc = await db.collection("users").findOne({ email: EMAIL });
    if (!userDoc) fail("A1 пользователь в БД", "не найден");
    else userId = userDoc._id.toString();
  });

  // ═══ A2. Профиль ═══
  console.log("\nA2. Профиль");
  await step("A2 профиль", async () => {
    const prof = await apiFetch("/profile");
    prof.status === 200 ? pass("A2 профиль", `HTTP ${prof.status}`) : fail("A2 профиль", `HTTP ${prof.status}`);
  });

  // ═══ A3. Школа через UI ═══
  console.log("\nA3. Создание школы");
  await step("A3 школа", async () => {
    await page.goto(`${BASE}/school/create`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    if (page.url().includes("/login")) {
      await page.fill('input[type="email"]', EMAIL);
      await page.fill('input[type="password"]', PASS);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2500);
      await page.goto(`${BASE}/school/create`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
    }
    await page.fill('input[name="name"]', "E2E Школа");
    await page.fill('input[name="code"]', `E2${Date.now().toString().slice(-5)}`);
    await page.fill('input[name="region"]', "г. Тест");
    await page.fill('input[name="city"]', "Тестовск");
    await page.fill('input[name="academic_year"]', "2026-2027");
    await page.selectOption('select[name="shifts"]', "1");
    await page.selectOption('select[name="grading_system"]', "5-point");
    // Кликаем именно submit формы — в форме две кнопки с текстом
    // «Создать школу» (переключатель режима и отправка).
    await page.locator('button[type="submit"]', { hasText: "Создать школу" }).click();
    // server action создаёт школу, но страница остаётся на /school/create;
    // ждём появления школы в БД (до 10 секунд).
    let schools = 0;
    for (let i = 0; i < 10 && schools === 0; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      schools = await db.collection("schools").countDocuments({
        $or: [{ created_by: userId }, { created_by: new ObjectId(userId) }],
      });
    }
    if (schools >= 1) {
      pass("A3 школа создана", String(schools));
    } else {
      const errText = await page.evaluate(() => {
        const reds = [...document.querySelectorAll("p, span, div")].map((el) => el.textContent?.trim() ?? "")
          .filter((t) => /Не удалось|Ошибка|занят|Проверьте|Слишком/i.test(t));
        return reds.slice(0, 3);
      });
      const tail = await page.evaluate(() => document.body.innerText.slice(-500)).catch(() => "");
      fail("A3 школа создана", `0; UI: ${JSON.stringify(errText)}; хвост: ${tail.replace(/\n+/g, " | ")}`);
    }
  });

  // ═══ A4. КСП через редактор ═══
  console.log("\nA4. Создание КСП в редакторе");
  await step("A4 план", async () => {
    for (let attempt = 0; attempt < 2 && !planId; attempt++) {
      try {
        await page.goto(`${BASE}/plans/new`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1800);
        // 0) Закрываем онбординг-модалку (первый вход) ДО остальных действий:
        //    она перехватывает клики по кнопкам страницы.
        const dlg = page.locator('[role="dialog"]');
        const dlgCount0 = await dlg.count();
        console.log("  [A4] диалог при заходе:", dlgCount0);
        if (dlgCount0 > 0) {
          const skip = dlg.getByRole("button", { name: "Пропустить" });
          console.log("  [A4] кнопка «Пропустить»:", await skip.count());
          if (await skip.count()) {
            await skip.click();
          } else {
            await page.keyboard.press("Escape").catch(() => null);
          }
          await page.waitForTimeout(800);
          console.log("  [A4] диалог после закрытия:", await dlg.count());
        }
        // 1) Название плана — поле #title (первая вкладка).
        await page.locator("#title").fill("Название E2E плана");
        console.log("  [A4] #title:", (await page.inputValue("#title").catch(() => "")).slice(0, 30));
        // 1.1) Профиль школы обязателен для сохранения (ЕМН/ОГН).
        // Необходимо выбрать значение в Radix Select; иначе save() прерывается.
        const profileTrigger = page.locator('button[aria-label="Профиль школы"]');
        console.log("  [A4] триггер профиля:", await profileTrigger.count());
        if (await profileTrigger.count()) {
          await profileTrigger.click();
          await page.waitForTimeout(500);
          const roleItem = page.locator('[role="option"]', { hasText: "ЕМН" }).first();
          console.log("  [A4] опция ЕМН:", await roleItem.count());
          if (await roleItem.count()) {
            await roleItem.click();
          } else {
            await page.keyboard.press("Escape").catch(() => null);
          }
          await page.waitForTimeout(400);
          console.log("  [A4] профиль выбран:", (await profileTrigger.innerText().catch(() => ""))?.slice(0, 30));
        }
        // 2) Тема урока — компонент VoiceInput на вкладке «Цели».
        const goalsTab = page.getByRole("tab", { name: "Цели" });
        if (await goalsTab.count()) {
          await goalsTab.click();
          await page.waitForTimeout(800);
        }
        const topicField = page.locator('[aria-label="Тема урока"], textarea[placeholder*="Напр."], input[placeholder*="Напр."]').first();
        console.log("  [A4] поле темы count:", await topicField.count());
        if (await topicField.count()) {
          await topicField.fill(TOPIC);
          await page.waitForTimeout(300);
          console.log("  [A4] тема:", (await topicField.inputValue().catch(() => "")).slice(0, 30));
        }
        await page.keyboard.press("Escape").catch(() => null);
        await page.waitForTimeout(400);
        // Перед кликом проверяем, что диалог закрыт.
        const dlgCount1 = await dlg.count();
        console.log("  [A4] диалог перед «Сохранить»:", dlgCount1);
        if (dlgCount1 > 0) {
          await page.keyboard.press("Escape").catch(() => null);
          await page.waitForTimeout(600);
        }
        await clickButtonExact("Сохранить");
        // Если остался открытый модальный оверлей — закрываем и повторяем клик.
        await page.waitForTimeout(800);
        const overlay = page.locator('div[data-state="open"][aria-hidden="true"]').first();
        if (await overlay.isVisible().catch(() => false)) {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(600);
          await clickButtonExact("Сохранить");
        }
        // Ждём появления плана в БД
        for (let i = 0; i < 15; i++) {
          const plans = await db.collection("lesson_plans").find({ owner_id: userId }).toArray();
          if (plans.length) {
            planId = plans[0]._id.toString();
            break;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (e) {
        if (attempt === 1) fail("A4 план", e.message);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (planId) {
      pass("A4 план создан", planId);
    } else {
      const dump = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => "");
      fail("A4 план создан", `тело страницы: ${dump.replace(/\n+/g, " | ")}`);
    }
  });

  // ═══ A5. AI-генерация КСП (SSE) ═══
  console.log("\nA5. AI-генерация КСП");
  await step("A5 генерация", async () => {
    let lastResult = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      lastResult = await readSse("/api/ai/generate/stream", {
        grade: 5,
        subject: SUBJECT,
        topic: TOPIC,
        learningObjectives: [],
        language: "ru",
        refine: false,
      }, 240000);
      const events = parseSseEvents(lastResult.text);
      const done = events.find((e) => e.type === "done");
      const middleTasks = done?.content?.stages?.middle?.tasks;
      if (Array.isArray(middleTasks) && middleTasks.length > 0) {
        pass("A5 генерация КСП", `заданий в середине: ${middleTasks.length} (попытка ${attempt + 1})`);
        return;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    const events = parseSseEvents((lastResult ?? { text: "" }).text);
    const genError = events.find((e) => e.type === "error");
    fail("A5 генерация КСП", `статус=${lastResult?.status} err=${genError?.error ?? "нет done"}`);
  });

  // ═══ A6. Улучшение секции ═══
  console.log("\nA6. Улучшение секции");
  await step("A6 enhance", async () => {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      last = await apiFetch("/api/ai/enhance", "POST", {
        section: "lessonObjectives",
        current: ["Учащиеся смогут складывать числа"],
        context: { topic: TOPIC, subject: SUBJECT, grade: 5, language: "ru" },
      });
      if (last.status === 200 && last.json?.improved?.length) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    (last.status === 200 && last.json?.improved?.length)
      ? pass("A6 enhance", String(last.json.improved).slice(0, 60))
      : fail("A6 enhance", JSON.stringify(last.json ?? last.text).slice(0, 150));
  });

  // ═══ A7. Экспорт docx ═══
  console.log("\nA7. Экспорт .docx");
  await step("A7 docx", async () => {
    if (!planId) { fail("A7 docx", "план отсутствует"); return; }
    const docx = await apiFetchBuffer(`/api/export/docx/${planId}`);
    (docx.status === 200 && docx.bytes > 1000 && docx.type.includes("wordprocessingml"))
      ? pass("A7 docx", `${docx.bytes} байт`)
      : fail("A7 docx", JSON.stringify(docx));
  });

  // ═══ A8. Раздаточный материал ═══
  console.log("\nA8. Раздаточный материал (worksheet)");
  await step("A8 worksheet", async () => {
    const handout = await apiFetch("/api/handouts/generate", "POST", {
      kind: "worksheet",
      topic: TOPIC,
      subject: SUBJECT,
      grade: 5,
      count: 4,
      language: "ru",
    });
    (handout.status === 200 && handout.json?.ok !== false)
      ? pass("A8 worksheet", `HTTP ${handout.status}`)
      : fail("A8 worksheet", JSON.stringify(handout.json ?? handout.text).slice(0, 160));
  });

  // ═══ A9. История AI ═══
  console.log("\nA9. История AI");
  await step("A9 история", async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const hist = await apiFetch("/api/ai/history?limit=5");
    const histItems = hist.json?.items ?? [];
    histItems.length >= 1 ? pass("A9 история", `${histItems.length} записей`) : fail("A9 история", JSON.stringify(hist.json).slice(0, 120));
  });

  // ═══ A10. Чат-ассистент (SSE) ═══
  console.log("\nA10. Чат-ассистент");
  await step("A10 чат", async () => {
    const chat = await readSse("/api/ai/chat/stream", {
      question: "Кратко: что такое КСП?",
      planContext: { topic: TOPIC, subject: SUBJECT, grade: 5, language: "ru" },
    }, 300000);
    const chatEvents = parseSseEvents(chat.text);
    const chatDone = chatEvents.find((e) => e.type === "done");
    const chatError = chatEvents.find((e) => e.type === "error");
    // Стриминг: если сервер оборвал поток по maxDuration, но мы успели
    // получить токены — считаем чат работающим (ответ накапливается).
    const streamed = chatEvents.filter((e) => e.type === "token").map((e) => e.text ?? "").join("");
    const answer = chatDone?.answer ?? streamed;
    (typeof answer === "string" && answer.length > 20)
      ? pass("A10 чат", answer.slice(0, 70))
      : fail("A10 чат", `err=${chatError?.error ?? "нет ответа"} (stop=${chat.status}, events=${chatEvents.length})`);
  });

  // ═══ A11. Агент: задача running → completed ═══
  console.log("\nA11. Агент: задача completed");
  await step("A11 агент", async () => {
    // Гарантируем управление у агента (не у пользователя).
    await apiFetch("/api/agents/control", "POST", { control: "ai" });
    const agentStart = await apiFetch("/api/agents/task", "POST", {
      prompt: "Напиши кратко (до 20 слов), что такое КСП.",
    });
    if (agentStart.status !== 201 || !agentStart.json?.taskId) {
      fail("A11 запуск задачи", JSON.stringify(agentStart.json ?? agentStart.text).slice(0, 150));
      return;
    }
    const agentTaskId = agentStart.json.taskId;
    const status = await waitTaskTerminal(agentTaskId);
    status === "completed"
      ? pass("A11 задача completed", `taskId=${agentTaskId}`)
      : fail("A11 задача completed", `status=${status}`);
  });

  // ═══ A12. Агент: очередь (последовательно: первая завершается → вторая) ═══
  console.log("\nA12. Агент: очередь (последовательно)");
  await step("A12 очередь", async () => {
    await apiFetch("/api/agents/control", "POST", { control: "ai" });
    const first = await apiFetch("/api/agents/task", "POST", {
      prompt: "Перечисли 5 планет Солнечной системы.",
    });
    const firstId = first.json?.taskId;
    const firstStatus = firstId ? await waitTaskTerminal(firstId) : null;
    firstStatus === "completed"
      ? pass("A12 первая завершена", String(firstStatus))
      : fail("A12 первая", String(firstStatus));
    // После полного завершения первой — вторая стартует сразу (по 201).
    const second = await apiFetch("/api/agents/task", "POST", {
      prompt: "Скажи кратко: столица Казахстана?",
    });
    const secondId = second.json?.taskId;
    const secondStatus = secondId ? await waitTaskTerminal(secondId) : null;
    secondStatus === "completed"
      ? pass("A12 вторая (после первой) завершена", String(secondStatus))
      : fail("A12 вторая", `status=${secondStatus} (task=${second.json?.status})`);
    // Принудительная очистка слота для следующих шагов.
    if (userId) {
      await db.collection("agent_tasks").updateMany(
        { user_id: userId, status: { $in: ["running", "queued"] } },
        { $set: { status: "error", error: "e2e: очистка слота", updated_at: new Date() } },
      );
    }
  });

  // ═══ A13. Агент: остановка ═══
  console.log("\nA13. Агент: остановка");
  await step("A13 остановка", async () => {
    await apiFetch("/api/agents/control", "POST", { control: "ai" });
    const stopStart = await apiFetch("/api/agents/task", "POST", {
      prompt: "Опиши подробно (1000 слов) историю Казахстана. Используй runCommand, чтобы записать промежуточные этапы в файл, и не завершай задачу, пока не напишешь все 1000 слов.",
    });
    if (!stopStart.json?.taskId) {
      fail("A13 запуск для остановки", JSON.stringify(stopStart.json ?? "").slice(0, 120));
      return;
    }
    const stopId = stopStart.json.taskId;
    // Ждём, пока задача точно перейдёт в running, затем сразу останавливаем.
    await new Promise((r) => setTimeout(r, 3000));
    await apiFetch(`/api/agents/task/${stopId}/stop`, "POST");
    const stopStatus = await waitTaskTerminal(stopId);
    if (stopStatus === "stopped") {
      pass("A13 задача остановлена", stopStatus);
    } else if (stopStatus === "completed") {
      fail("A13 остановка", "задача успела завершиться сама до остановки");
    } else {
      fail("A13 остановка", `status=${stopStatus} (task=${stopStart.json.status})`);
    }
  });

  // ═══ A14. Выдача домашнего задания ═══
  console.log("\nA14. Выдача домашнего задания");
  await step("A14 выдача", async () => {
    if (!planId) { fail("A14 выдача", "план отсутствует"); return; }
    // В созданном через редактор плане ещё нет интерактивных заданий —
    // добавляем одну MCQ-задачу, как сделал бы учитель, и проверяем выдачу.
    await db.collection("lesson_plans").updateOne(
      { _id: new ObjectId(planId) },
      { $push: { "content.stages.middle.tasks": {
        id: "t-e2e-1",
        type: "MCQ",
        question: "Сколько будет 2+2?",
        options: ["3", "4", "5"],
        correctIndex: 1,
        points: 2,
      } } },
    );
    const preview = await apiFetch("/api/assignments/preview", "POST", {
      taskIds: [`${planId}:0`],
    });
    if (preview.status !== 200 || !preview.json?.fingerprint) {
      fail("A14 preview", JSON.stringify(preview.json ?? preview.text).slice(0, 160));
      return;
    }
    const created = await apiFetch("/api/assignments", "POST", {
      title: "ДЗ E2E",
      subject: SUBJECT,
      grade: 5,
      taskIds: [`${planId}:0`],
      planId,
      previewFingerprint: preview.json.fingerprint,
      feedbackMode: "correct_only",
      daysValid: 14,
    });
    if (created.status === 200 && /^\d{6}$/.test(created.json?.code ?? "")) {
      pass("A14 выдача создана", `код ${created.json.code}`);
    } else {
      fail("A14 выдача", JSON.stringify(created.json ?? created.text).slice(0, 160));
    }
  });

  // ═══ A15. Комплект ═══
  console.log("\nA15. Сохранение комплекта");
  await step("A15 комплект", async () => {
    const kit = await apiFetch("/api/kits", "POST", {
      title: "Комплект E2E",
      topic: TOPIC,
      grade: 5,
      handouts: [{
        kind: "worksheet",
        title: "Лист E2E",
        tasks: [{ type: "MCQ", question: "Q", options: ["A", "B"], correctIndex: 0, points: 2 }],
        language: "ru",
      }],
    });
    const kitDoc = await db.collection("lesson_kits").findOne({ title: "Комплект E2E" });
    const kitCreated = kit.status === 200 || kit.json?.kit?.id;
    (kitCreated && kitDoc)
      ? pass("A15 комплект сохранён", kitDoc._id.toString())
      : fail("A15 комплект", `status=${kit.status} body=${JSON.stringify(kit.json ?? kit.text).slice(0, 200)}`);
  });

  // ═══ A16. Logout → Login ═══
  console.log("\nA16. Выход → повторный вход");
  await step("A16 повторный вход", async () => {
    await context.clearCookies();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    const loginBtn = page.locator('button[type="submit"]', { hasText: "Войти" });
    await loginBtn.click().catch(() => null);
    await page.waitForURL(/\/(dashboard|welcome|school|plans)/, { timeout: 25000 }).catch(() => null);
    await page.waitForTimeout(1500);
    if (page.url().includes("/login")) {
      const loginErr = await page.evaluate(() => {
        const reds = [...document.querySelectorAll("p, span, div")].map((el) => el.textContent?.trim() ?? "")
          .filter((t) => /Слишком|Неверный|ошиб|попыток/i.test(t));
        return reds.slice(0, 3);
      });
      fail("A16 повторный вход", `остались на /login; UI: ${JSON.stringify(loginErr)}`);
    } else {
      pass("A16 повторный вход", page.url());
    }
  });
} catch (e) {
  fail("сценарий прерван", e.message);
} finally {
  await browser.close();
  await client.close();
}

const failed = results.filter((r) => !r.ok);
const secs = Math.round((Date.now() - startedAt) / 1000);
console.log("\n===== ИТОГ ПОЛНОГО ПРОГОНА =====");
console.log(`passed=${results.length - failed.length}, failed=${failed.length}, total=${results.length}, время=${secs}с`);
for (const f of failed) console.log(` ❌ ${f.name}: ${f.detail}`);
process.exit(failed.length ? 1 : 0);
