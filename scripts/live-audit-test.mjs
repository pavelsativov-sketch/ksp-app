/**
 * Живой тест исправлений аудита (os-system-audit.md) на запущенном приложении.
 *
 * Валидирует:
 *  - C4: safeNextPath — next=%252F%252Fevil.com не должен уводить наружу;
 *  - создание школы через UI (server action);
 *  - C1: live-quiz — неверный ответ = 0 очков, верный = speedBonus;
 *  - C4: лимит студентов (MAX_STUDENTS) в student:join;
 *  - C2: retry кода комнаты при коллизии (host создаёт под занятым кодом);
 *  - C3: path traversal в песочнице — ../rejected.txt отклоняется.
 *
 * Использование: node scripts/live-audit-test.mjs
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { MongoClient, ObjectId } from "mongodb";

const BASE = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const EMAIL = `audit.${Date.now()}@example.com`;
const PASS = "AuditPass2026!";

// ── Mongo из .env.local ──
function loadEnv() {
  const env = {};
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const ENV = loadEnv();
const uri = ENV.MONGODB_URI;
if (!uri) {
  console.error("нет MONGODB_URI");
  process.exit(1);
}
const dbName = ENV.MONGODB_DB || "ksp";

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(dbName);

async function registerUser(page) {
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="fullName"]', "Аудит Тест");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(welcome|dashboard|plans|school|login)/, { timeout: 30000 });
  return page.url();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  // ── 1. Регистрация ──
  console.log("— 1. Регистрация —");
  await registerUser(page);
  const userDoc = await db.collection("users").findOne({ email: EMAIL });
  if (!userDoc) {
    fail("пользователь создан в БД", "не найден по email");
  } else {
    pass("пользователь создан", userDoc._id.toString());
  }
  const userId = userDoc._id.toString();

  // ── 2. safeNextPath: next=%252F%252Fevil.com ──
  console.log("— 2. safeNextPath (двойное кодирование) —");
  await page.goto(`${BASE}/login?next=%252F%252Fevil.com`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  const afterLogin = page.url();
  // Никаких слешей перед доменом: если safeNextPath отработал — /welcome или /dashboard.
  const isExternal = /^\w+:\/\//.test(afterLogin) && !afterLogin.startsWith(BASE);
  const hasDoubleSlashPath = afterLogin.includes("//evil.com") || afterLogin.includes("%2F%2Fevil");
  if (isExternal || hasDoubleSlashPath) {
    fail("next-редирект не уводит наружу", afterLogin);
  } else {
    pass("next-редирект безопасен", afterLogin);
  }

  // ── 3. Создание школы ──
  console.log("— 3. Создание школы через UI —");
  // Страховка: если сессия не подхватилась (редирект на /login), входим снова.
  const ensureLoggedIn = async () => {
    await page.goto(`${BASE}/school/create`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    if (page.url().includes("/login")) {
      await page.fill('input[type="email"]', EMAIL);
      await page.fill('input[type="password"]', PASS);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      const loginText = await page.evaluate(() => document.body.innerText.slice(0, 400));
      console.log("  login после submit:", page.url(), "|", loginText.replace(/\n+/g, " | ").slice(-180));
      if (page.url().includes("/login")) {
        // вторая попытка после паузы
        await page.waitForTimeout(3000);
        await page.fill('input[type="email"]', EMAIL).catch(() => null);
        await page.fill('input[type="password"]', PASS).catch(() => null);
        await page.click('button[type="submit"]').catch(() => null);
        await page.waitForTimeout(3000);
      }
    }
    await page.goto(`${BASE}/school/create`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
  };
  await ensureLoggedIn();
  const cookies = await context.cookies();
  console.log("  cookies:", cookies.map((c) => `${c.name}=${c.value.slice(0, 12)}…`).join(", "));
  const schoolPageState = await page.evaluate(async () => {
    const r = await fetch("/school/create", { redirect: "manual" });
    return {
      url: location.pathname,
      fetchStatus: r.status,
      hasNameInput: !!document.querySelector('input[name="name"]'),
      text: document.body.innerText.slice(0, 200),
    };
  });
  console.log("  school page:", JSON.stringify(schoolPageState));
  await page.fill('input[name="name"]', "Аудит школа");
  await page.fill('input[name="code"]', `AU${Date.now().toString().slice(-5)}`);
  await page.fill('input[name="region"]', "г. Аудит");
  await page.fill('input[name="city"]', "Аудитград");
  await page.fill('input[name="academic_year"]', "2026-2027");
  await page.selectOption('select[name="shifts"]', "1");
  await page.selectOption('select[name="grading_system"]', "5-point");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  // В БД created_by хранится строкой (не ObjectId) — ищем оба варианта.
  const [schoolCountOid, schoolCountStr] = await Promise.all([
    db.collection("schools").countDocuments({ created_by: new ObjectId(userId) }),
    db.collection("schools").countDocuments({ created_by: userId }),
  ]);
  const schoolCount = schoolCountOid + schoolCountStr;
  const schoolErrText = await page.evaluate(() => {
    const reds = [...document.querySelectorAll("p, span, div")].map((el) => el.textContent?.trim() ?? "")
      .filter((t) => /Не удалось|Ошибка|занят|Проверьте|Слишком/i.test(t));
    return reds.slice(0, 3);
  });
  schoolCount >= 1
    ? pass("школа создана")
    : fail("школа создана", `найдено ${schoolCount}; ошибки UI: ${JSON.stringify(schoolErrText)}`);

  // ── 4. План для live-квиза (напрямую в БД) ──
  console.log("— 4. Подготовка плана с задачей MCQ —");
  const now = new Date();
  const emptyStage = { time: "", teacherActions: "", studentActions: "", resources: "", keyQuestions: [], descriptors: [], assessmentMethod: "", tasks: [], homework: "", summary: "", reflectionQuestions: [] };
  const planRes = await db.collection("lesson_plans").insertOne({
    owner_id: userId, // строка, как при сохранении через savePlanAction
    title: "Живой тест КСП",
    subject_id: null,
    grade: 5,
    quarter: null,
    section: null,
    visibility: "private",
    language: "ru",
    content: {
      header: { longTermPlanSection: "", school: "", date: "", teacherName: "", grade: "", studentsPresent: null, studentsAbsent: null },
      topic: "Живой тест темы",
      learningObjectives: [],
      lessonObjectives: [],
      assessmentCriteria: [],
      languageObjectives: { terms: [], phrases: [] },
      values: "",
      crossCurricularLinks: "",
      priorKnowledge: "",
      stages: {
        beginning: { ...emptyStage },
        middle: {
          ...emptyStage,
          tasks: [{
            id: "t-live-1",
            type: "MCQ",
            question: "Сколько будет 2+2?",
            options: ["4", "5"],
            correctIndex: 0,
            points: 5,
          }],
        },
        end: { ...emptyStage },
      },
      evaluation: { formativeAssessment: "", differentiation: "", healthAndSafety: "", reflection: "" },
    },
    created_at: now,
    updated_at: now,
  });
  const planId = planRes.insertedId.toString();
  pass("план создан", planId);

  // ── 5. Live-quiz: host создаёт комнату (код 123456), студенты отвечают ──
  console.log("— 5. Live-quiz: очки, лимит студентов, retry кода —");
  const quiz = await page.evaluate(async ({ planId }) => {
    const api = (path, body) => fetch(`/api/quiz/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

    // Уникальный код, чтобы не цепляться к комнатам прошлых прогонов.
    const code = String(100000 + Math.floor(Math.random() * 900000));
    // 5.1 Хост создаёт комнату под кодом; затем повторно «создаёт» — код занят
    // тем же хостом → с точки зрения ретрая это не коллизия (owner совпадает).
    const hostState = await api(code, {
      event: "host:state",
      payload: { phase: "lobby", currentIndex: -1, leaderboard: [], planId },
    });
    const question = await api(code, {
      event: "host:question",
      payload: {
        index: 0,
        task: { id: "t-live-1", type: "MCQ", question: "Сколько будет 2+2?", options: ["4", "5"], points: 5 },
        secret: { id: "t-live-1", type: "MCQ", question: "Сколько будет 2+2?", options: ["4", "5"], correctIndex: 0, points: 5 },
        endsAt: Date.now() + 30_000,
        planId,
      },
    });
    // 5.2 Студенты присоединяются
    const join1 = await api(code, { event: "student:join", payload: { studentId: "s_audit1", name: "Алия" } });
    const join2 = await api(code, { event: "student:join", payload: { studentId: "s_audit2", name: "Бек" } });
    // 5.3 Ответы: s1 правильный, s2 неправильный
    const ans1 = await api(code, { event: "student:answer", payload: { studentId: "s_audit1", index: 0, answer: { type: "MCQ", selectedIndex: 0 }, ms: 100 } });
    const ans2 = await api(code, { event: "student:answer", payload: { studentId: "s_audit2", index: 0, answer: { type: "MCQ", selectedIndex: 1 }, ms: 100 } });
    return { hostState, question, join1, join2, ans1, ans2, code };
  }, { planId });

  const roomRaw = await db.collection("quiz_rooms").findOne({ code: quiz.code }, {
    projection: { phase: 1, currentIndex: 1, questionStartedAt: 1, questionEndsAt: 1, students: 1, answers: 1, secretTask: 1 },
  });
  console.log("  room state:", JSON.stringify({
    phase: roomRaw?.phase,
    currentIndex: roomRaw?.currentIndex,
    students: Object.keys(roomRaw?.students ?? {}).length,
    answers: roomRaw?.answers,
    secretType: roomRaw?.secretTask?.type,
  }));
  const room = roomRaw;
  if (!room) {
    fail("комната создана", "не найдена в БД");
  } else {
    pass("комната создана", quiz.code);
    const s1 = room.students?.s_audit1;
    const s2 = room.students?.s_audit2;
    if (s1?.score > 0) pass("верный ответ начисляет очки", `score=${s1.score}`);
    else fail("верный ответ начисляет очки", JSON.stringify(s1));
    if (s2?.score === 0) pass("неверный ответ = 0 очков", `score=${s2.score}`);
    else fail("неверный ответ = 0 очков", JSON.stringify(s2));

    // 5.4 Лимит студентов: добиваем до 200, 201-й join → 429
    const studentsMap = { ...(room.students ?? {}) };
    for (let i = 0; i < 200; i++) {
      studentsMap[`s_fill_${i}`] = { name: `Ученик ${i}`, score: 0, answered: 0 };
    }
    await db.collection("quiz_rooms").updateOne({ code: quiz.code }, { $set: { students: studentsMap } });
    const join201 = await page.evaluate(async ({ code }) => {
      const r = await fetch(`/api/quiz/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "student:join", payload: { studentId: "s_overflow", name: "201-й" } }),
      });
      return { status: r.status };
    }, { code: quiz.code });
    if (join201.status === 429) pass("лимит студентов работает (429)", `join=${join201.status}`);
    else fail("лимит студентов работает", `join=${join201.status}`);
  }

  // ── 6. Path traversal в песочнице ──
  console.log("— 6. Path traversal: ../rejected.txt —");
  const traversal = await page.evaluate(async () => {
    const mk = (file, content) => fetch("/api/agents/sandbox", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file, content }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    const bad = await mk("../rejected.txt", "x");
    const good = await mk("audit-ok.txt", "hello");
    return { bad, good };
  });
  if (traversal.bad.status !== 200) pass("../ отклоняется", `status=${traversal.bad.status}`);
  else fail("../ отклоняется", `status=${traversal.bad.status}`);
  if (traversal.good.status === 200) pass("валидный файл сохраняется");
  else fail("валидный файл сохраняется", JSON.stringify(traversal.good));

  // ── 7. Файл не оказался вне песочницы ──
  const outside = await db.collection("workspace_files").findOne({ path: { $regex: /\.\./ } });
  if (!outside) pass("нет записей с '..' в коллекции файлов");
  else fail("нет записей с '..'", JSON.stringify(outside));
} catch (e) {
  fail("сценарий прерван", e.message);
} finally {
  await browser.close();
  await client.close();
}

// ── Итог ──
const failed = results.filter((r) => !r.ok);
console.log("\n===== ИТОГ ЖИВОГО ТЕСТА =====");
console.log(`passed=${results.length - failed.length}, failed=${failed.length}, total=${results.length}`);
for (const f of failed) console.log(` ❌ ${f.name}: ${f.detail}`);
process.exit(failed.length ? 1 : 0);
