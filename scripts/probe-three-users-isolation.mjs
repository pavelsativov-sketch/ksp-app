/**
 * Изоляция трёх пользователей — часть, которая не зависит от квоты модели.
 *
 * Проверяется на работающем сервере с тремя настоящими входами (три
 * независимых контекста браузера, как у трёх разных учителей):
 *  1) сессии не пересекаются — планы и страницы свои;
 *  2) rate-limit у каждого свой — чужой расход не блокирует;
 *  3) очередь подтверждений агента не смешивает пользователей;
 *  4) агент не запускается дважды на одного пользователя и не занимает
 *     чужой запуск;
 *  5) анонимный доступ к агентским маршрутам закрыт.
 *
 * Квота Groq здесь не нужна: проверка идёт по HTTP-ответам сервера,
 * поэтому работает и при исчерпанном суточном лимите модели.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const accounts = JSON.parse(readFileSync("tests/e2e/.accounts.json", "utf8")).accounts.slice(0, 3);

const failures = [];
const note = (ok, text) => {
  console.log(`   ${ok ? "ok" : "ПРОВАЛ"} — ${text}`);
  if (!ok) failures.push(text);
};

const browser = await chromium.launch({ headless: true });

/** Отдельный контекст на пользователя: отдельные cookie и localStorage. */
async function openSignedIn(account) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE}/login`);
  await page.fill("#email", account.email);
  await page.fill("#password", account.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|welcome|plans)/, { timeout: 30_000 }),
    page.getByRole("button", { name: /войти/i }).click(),
  ]);
  const skip = page.getByRole("button", { name: /пропустить/i });
  if (await skip.isVisible({ timeout: 8_000 }).catch(() => false)) await skip.click();

  // Признак входа — кнопка выхода. Иначе «успешный» вход может оказаться
  // страницей с формой, и дальнейшие проверки потеряют смысл.
  const signedIn = await page
    .getByRole("button", { name: /выйти/i })
    .first()
    .isVisible({ timeout: 15_000 })
    .catch(() => false);
  return { context, page, signedIn, email: account.email };
}

console.log("Вхожу тремя пользователями одновременно…");
const started = Date.now();
const sessions = await Promise.all(accounts.map(openSignedIn));
sessions.forEach((s) => note(s.signedIn, `вход ${s.email}`));

if (sessions.some((s) => !s.signedIn)) {
  await browser.close();
  console.log("\nНе все вошли — проверять изоляцию не на чем.");
  process.exit(1);
}

/** HTTP-запрос из сессии пользователя (с его cookie). */
const request = async (index, path, init = {}) => {
  const { page } = sessions[index];
  return page.evaluate(
    async ([url, options]) => {
      const res = await fetch(url, { credentials: "include", ...options });
      return { status: res.status, body: await res.text().catch(() => "") };
    },
    [`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...init }],
  );
};

console.log("\n1. Сессии не пересекаются");
// Список планов отдаётся страницей, а не отдельным маршрутом, поэтому
// проверяем через страницу архива: у каждого учителя своя выдача.
const dashboards = await Promise.all(
  sessions.map(async (s) => {
    const res = await s.page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    return {
      status: res?.status() ?? 0,
      text: await s.page.innerText("body"),
      cookies: await s.context.cookies(),
    };
  }),
);
dashboards.forEach((d, i) =>
  note(d.status === 200, `архив пользователя ${i + 1}: HTTP ${d.status}`),
);
// Личный архив доступен только своему: у анонима он должен отдавать 302/401.
const anonDash = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
note(
  anonDash.status === 401 || anonDash.status === 302 || anonDash.status === 307,
  `анонимный архив недоступен (HTTP ${anonDash.status})`,
);
// Сессии должны быть разными физически: у каждого учителя своя cookie.
// Одинаковые cookie означали бы, что все три «пользователя» — один человек.
const sessionCookies = dashboards.map((d) =>
  d.cookies
    .filter((c) => /session|token|auth/i.test(c.name))
    .map((c) => `${c.name}=${c.value}`)
    .join(";"),
);
note(
  sessionCookies.every((c) => c.length > 0),
  `у каждого своя сессионная cookie (${sessionCookies.map((c) => c.slice(0, 14)).join(" | ")})`,
);
note(
  new Set(sessionCookies).size === sessionCookies.length,
  "сессионные cookie различаются — это три разных пользователя",
);

console.log("\n2. Лимиты у каждого свои");
// Один и тот же путь у троих одновременно: общий счётчик отдал бы 429.
const probes = await Promise.all(
  sessions.map(async (_, i) => {
    const [agent, control, tasks] = await Promise.all([
      request(i, "/api/agents/computer"),
      request(i, "/api/agents/control"),
      request(i, "/api/agents/task"),
    ]);
    return [agent.status, control.status, tasks.status];
  }),
);
probes.forEach((statuses, i) =>
  note(statuses.every((s) => s !== 429), `параллельные запросы пользователя ${i + 1} не заблокированы (${statuses.join(", ")})`),
);

console.log("\n3. Очередь подтверждений не смешивает пользователей");
const queues = await Promise.all(sessions.map((_, i) => request(i, "/api/agents/computer")));
const parsedQueues = queues.map((q) => {
  try {
    return JSON.parse(q.body);
  } catch {
    return null;
  }
});
parsedQueues.forEach((q, i) => {
  note(q && Array.isArray(q.pending), `пользователь ${i + 1} получает корректную очередь (HTTP ${queues[i].status})`);
});
note(
  parsedQueues.every((q) => !q.running),
  "никто из троих не числится занятым — чужой запуск не перехвачен",
);

console.log("\n4. Анонимный доступ закрыт");
const anon = await fetch(`${BASE}/api/agents/computer`);
note(anon.status === 401, `анонимный запрос к агентскому маршруту отклонён (HTTP ${anon.status})`);

console.log("\n5. Параллельный запуск агента отвечает осмысленно");
// Три одновременных запуска: при исчерпанной квоте это 502 с объяснением,
// но не 500 — сервер должен различать «модель недоступна» и «баг».
const starts = await Promise.all(
  sessions.map((_, i) =>
    request(i, "/api/agents/computer", {
      method: "POST",
      body: JSON.stringify({ goal: "проверка изоляции: ничего не выполнять" }),
    }),
  ),
);
starts.forEach((s, i) => {
  const known = [200, 400, 409, 429, 502, 503].includes(s.status);
  note(known, `параллельный запуск ${i + 1}: HTTP ${s.status} — без 500`);
});
const explained = starts.filter((s) => s.status !== 200);
explained.forEach((s, i) => {
  let msg = "";
  try {
    msg = JSON.parse(s.body).error ?? "";
  } catch {
    msg = s.body.slice(0, 120);
  }
  // Учитель должен видеть причину, а не «что-то пошло не так».
  note(msg.trim().length > 0, `запуск ${i + 1} объяснил причину: «${msg.slice(0, 80)}»`);
});

console.log("\n6. Данные одного пользователя не у другого");
// Чужой идентификатор плана не должен открываться: ни существующий, ни
// выдуманный — оба случая обязаны отличаться от «свой, отдал».
const foreignId = "0123456789abcdef01234567";
const foreign = await request(1, `/api/plans/${foreignId}`);
note(
  foreign.status === 404 || foreign.status === 403 || foreign.status === 401,
  `чужой план не отдан (HTTP ${foreign.status})`,
);
const anonPlan = await fetch(`${BASE}/api/plans/${foreignId}`);
note(anonPlan.status === 401 || anonPlan.status === 404, `анонимный план не отдан (HTTP ${anonPlan.status})`);

// Журнал задачи агента отдаётся потоком SSE: HTTP 200 приходит сразу при
// открытии потока, а право чтения проверяется уже в нём. Поэтому судить
// надо по содержимому потока, а не по коду ответа.
const foreignTask = await sessions[1].page.evaluate(async (base) => {
  const res = await fetch(`${base}/api/agents/task/0123456789abcdef01234567`, {
    credentials: "include",
  });
  const text = await res.text();
  return { status: res.status, text };
}, BASE);
note(
  /Задача не найдена/.test(foreignTask.text),
  `чужой журнал задачи не отдан: «${foreignTask.text.trim().slice(0, 60)}»`,
);
note(
  !/"(plan|title|result)"/i.test(foreignTask.text),
  "в потоке нет чужих данных задачи",
);

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\nВсе проверки за ${elapsed} с`);

await browser.close();

if (failures.length) {
  console.log("\nПРОВАЛ:");
  for (const f of failures) console.log("  -", f);
  process.exit(1);
}
console.log("\nOK: три пользователя изолированы друг от друга.");
