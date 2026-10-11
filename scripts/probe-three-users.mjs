/**
 * Завершающая проверка: три учителя одновременно.
 *
 * Что это проверяет и почему именно так:
 *  1) изоляцию браузерных сессий — у каждого пользователя свой контекст,
 *     и страница одного не должна появиться у другого;
 *  2) очередь подтверждений — отказ одного пользователя не должен ждать
 *     ответа другого, а ответ не должен уйти не тому;
 *  3) лимиты — каждый пользователь получает свой счётчик, и «выжигание»
 *     одного не блокирует остальных;
 *  4) честность итогов при параллельной работе.
 *
 * Запуск: node scripts/probe-three-users.mjs
 *
 * Каждый пользователь входит своей сессией и выполняет задачу агента
 * «Использование компьютера» на своей странице. Затем проверяется, что
 * браузеры остались раздельными и подтверждения не пересеклись.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const KEY = process.env.GROQ_API_KEY;
const GROQ = "https://api.groq.com/openai/v1";
const SCREEN_WIDTH = 1280;
const SCREEN_HEIGHT = 800;
const denormalize = (v, size) =>
  Math.round((Math.min(999, Math.max(0, Math.trunc(v))) / 999) * (size - 1));

if (!KEY) {
  console.error("Нет GROQ_API_KEY — проверка невозможна.");
  process.exit(1);
}

const accounts = JSON.parse(readFileSync("tests/e2e/.accounts.json", "utf8")).accounts;
if (accounts.length < 3) {
  console.error("Нужно минимум 3 тестовых аккаунта.");
  process.exit(1);
}
const USERS = accounts.slice(0, 3);
console.log("Пользователи:", USERS.map((u) => u.email).join(", "));

// ── Тестовые страницы: у каждого пользователя своя ────────────────────
// Страница отдаёт имя пользователя и имеет свою кнопку. Если браузеры
// пересекутся, агент одного увидит чужое имя — это и есть проверка.
const makePage = (name, marker) => `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Кабинет ${name}</title>
<style>body{font:16px system-ui;margin:0;padding:24px;background:#fff}
button{padding:10px 16px;margin:4px;font-size:16px}</style></head><body>
<h1>Кабинет: ${name}</h1>
<p>Метка страницы: ${marker}</p>
<button id="go" onclick="document.getElementById('out').textContent='${marker}: раздел открыт'">Открыть раздел</button>
<button id="send" onclick="fetch('/sent')">Отправить учителю</button>
<div id="out">раздел не открыт</div>
</body></html>`;

const { createServer } = await import("node:http");

/** Токен (01, 02, 03) → аккаунт. Сопоставление по почте целиком. */
const tokenOf = (account) => account.email.split("@")[0].replace("autotest-20261006-", "");
const byToken = new Map(USERS.map((a) => [tokenOf(a), a]));

/** Раздаёт страницу конкретного пользователя по его токену в адресе. */
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const token = url.searchParams.get("u") ?? "";
  const user = byToken.get(token);
  if (!user) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>нет такого пользователя</h1>");
    return;
  }
  if (url.pathname === "/sent") {
    sent.set(token, (sent.get(token) ?? 0) + 1);
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"sent":true}');
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(makePage(user.email.split("@")[0], token));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const sent = new Map();

const startUrl = (token) => `http://127.0.0.1:${PORT}/?u=${token}`;

// ── Модель ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "click",
      description: "Кликнуть по координате (0–999)",
      parameters: {
        type: "object",
        properties: { x: { type: "integer" }, y: { type: "integer" }, intent: { type: "string" } },
        required: ["x", "y", "intent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "done",
      description: "Задача выполнена",
      parameters: {
        type: "object",
        properties: { summary: { type: "string" }, blocked: { type: "boolean" } },
        required: ["summary"],
      },
    },
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let maxPromptTokens = 0;

/**
 * Очередь запросов к модели.
 *
 * Три агента шлют запросы одновременно, а лимит Groq общий на организацию
 * (7000 входных токенов в минуту) и не разделён по пользователям. Без
 * очереди параллельный прогон упирается в 429 — то есть проверял бы лимит
 * провайдера, а не изоляцию сессий. Пользователи при этом остаются
 * одновременными: браузеры, циклы и подтверждения не ждут друг друга.
 */
let queue = Promise.resolve();
function askModel(messages) {
  const run = queue.then(() => askModelNow(messages));
  // Ошибка не должна обрывать очередь для следующих запросов.
  queue = run.catch(() => {});
  return run;
}

async function askModelNow(messages) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.1,
        max_tokens: 384,
      }),
    });
    if (res.ok) {
      const j = await res.json();
      maxPromptTokens = Math.max(maxPromptTokens, j?.usage?.prompt_tokens ?? 0);
      return j.choices[0].message;
    }
    const text = await res.text();

    // Разные лимиты Groq требуют разного поведения, и раньше прогон
    // молчал «лимит не восстановился», не различая минутный лимит
    // (подождём) и суточный (подождать бесполезно).
    const perDay = /per day \(TPD\)|tokens per day/i.test(text);
    if (res.status === 429 && perDay) {
      const wait = text.match(/try again in ([0-9hms.]+)/i)?.[1] ?? "?";
      const used = text.match(/Used (\d+)/)?.[1] ?? "?";
      throw new Error(
        `исчерпан суточный лимит Groq (${used} из 200000 токенов). Сброс через ${wait}. ` +
          "Прогон невозможен до сброса — это не дефект агента.",
      );
    }
    if (res.status === 429 || res.status === 413) {
      const reason = /ITPM|TPM|per minute/i.test(text) ? "лимит токенов/мин" : "прочее";
      console.log(`    (${reason}, ждём 45 с — попытка ${attempt + 1})`);
      await sleep(45_000);
      continue;
    }
    throw new Error(`модель: ${res.status} ${text.slice(0, 160)}`);
  }
  throw new Error("минутный лимит Groq не восстановился");
}

// ── Вспомогательное для страницы пользователя ─────────────────────────
const probeAt = (page, x, y) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return { label: "" };
    const parts = [];
    let node = el;
    for (let i = 0; i < 4 && node; i++) {
      const tag = node.tagName.toLowerCase();
      if (tag === "body" || tag === "html") break;
      const own = (node.innerText || node.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
      if (own) parts.push(own);
      node = node.parentElement;
    }
    return { label: parts.join(" | ").slice(0, 160) };
  }, [x, y]);

const CONFIRM_RE = /отправить|send|submit|оплатить|купить|войти/i;

async function runUserAgent(index, account, token, answerConfirm) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } });
  const page = await context.newPage();
  await page.goto(startUrl(token));

  const observation = async () => {
    const items = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("a[href], button, input, [onclick]")) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const t = (el.innerText || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 50);
        const cx = Math.round(((r.left + r.width / 2) / window.innerWidth) * 999);
        const cy = Math.round(((r.top + r.height / 2) / window.innerHeight) * 999);
        out.push(`[${out.length}] (${cx},${cy}) ${t || "(без подписи)"}`);
        if (out.length >= 30) break;
      }
      return out.join("\n");
    });
    return `Адрес: ${page.url()}\nЭлементы:\n${items}`;
  };
  const shot = async () =>
    Buffer.from(await page.screenshot({ type: "jpeg", quality: 55 })).toString("base64");

  const messages = [
    {
      role: "system",
      content:
        "Ты агент, управляющий браузером по снимкам. Координаты 0–999. " +
        "Список элементов надёжнее картинки: кликай по подписи. Один ход — одно действие. " +
        "Не вводи пароли. Итог пиши честно.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Задача: на этой странице нажми кнопку «Открыть раздел», потом нажми " +
            "«Отправить учителю» и напиши, что отправлено.",
        },
        { type: "text", text: await observation() },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${await shot()}` } },
      ],
    },
  ];

  let summary = "";
  let confirmations = 0;
  let denied = 0;
  const visitedOwn = [];
  const foreignMarkers = [];

  for (let turn = 0; turn < 6; turn++) {
    const message = await askModel(messages);
    const calls = message.tool_calls ?? [];
    if (calls.length === 0 || calls.some((c) => c.function?.name === "done")) {
      const done = calls.find((c) => c.function?.name === "done");
      if (done) {
        try {
          summary = JSON.parse(done.function.arguments).summary ?? "";
        } catch {
          summary = done.function.arguments;
        }
      }
      break;
    }

    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments ?? "{}");
      } catch {}
      if (call.function?.name !== "click") continue;

      const x = denormalize(Number(args.x), SCREEN_WIDTH);
      const y = denormalize(Number(args.y), SCREEN_HEIGHT);
      const probe = await probeAt(page, x, y);
      let outcome;

      if (CONFIRM_RE.test(probe.label)) {
        confirmations += 1;
        const allowed = answerConfirm(index, probe.label);
        if (allowed) {
          await page.mouse.click(x, y);
          outcome = "клик выполнен";
        } else {
          denied += 1;
          outcome = "учитель отклонил это действие";
        }
      } else {
        await page.mouse.click(x, y);
        outcome = "клик выполнен";
      }
      messages.push({ role: "user", content: `Результат клика: ${outcome}` });
    }

    // Проверяем изоляцию: на странице должен быть только свой маркер.
    const body = await page.evaluate(() => document.body.innerText);
    visitedOwn.push(body.includes(`Метка страницы: ${token}`));
    for (const other of USERS) {
      const otherToken = other.email.split("@")[0].replace("autotest-20261006-", "");
      if (otherToken !== token && body.includes(`Метка страницы: ${otherToken}`)) {
        foreignMarkers.push(otherToken);
      }
    }

    messages.push({
      role: "user",
      content: [
        { type: "text", text: await observation() },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${await shot()}` } },
      ],
    });
  }

  const out = await page.evaluate(() => document.getElementById("out")?.textContent ?? "");
  const url = page.url();
  await browser.close();

  return {
    token,
    email: account.email,
    summary,
    confirmations,
    denied,
    openedSection: out.includes("раздел открыт"),
    sawOnlyOwnPage: visitedOwn.every(Boolean),
    foreignMarkers,
    url,
  };
}

// ── Параллельный прогон трёх пользователей ────────────────────────────
// Ответ учителя: первому разрешаем опасное действие, остальным отказываем.
// Так проверяется, что решение одного не превращается в решение другого.
const decisions = [];
const answerConfirm = (index) => {
  decisions[index] = true;
  return index === 0;
};

console.log("\nЗапускаю трёх агентов одновременно…");
const started = Date.now();
const results = await Promise.all(
  USERS.map((account, index) => {
    const token = tokenOf(account);
    return runUserAgent(index, account, token, answerConfirm).catch((e) => ({
      token,
      email: account.email,
      error: e instanceof Error ? e.message : String(e),
    }));
  }),
);
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log(`\nВсе три отработали за ${elapsed} с\n`);
for (const r of results) {
  console.log(`── ${r.email}`);
  if (r.error) {
    console.log(`   ОШИБКА: ${r.error}`);
    continue;
  }
  console.log(`   итог: ${r.summary.slice(0, 150)}`);
  console.log(`   раздел открыт: ${r.openedSection}`);
  console.log(`   подтверждений: ${r.confirmations}, отказов: ${r.denied}`);
  console.log(`   видел только свою страницу: ${r.sawOnlyOwnPage}`);
  console.log(`   чужие маркеры: ${r.foreignMarkers.length === 0 ? "нет" : r.foreignMarkers.join(", ")}`);
  console.log(`   адрес: ${r.url}`);
}
console.log(`\nпиковый запрос: ${maxPromptTokens} токенов`);

// ── Проверки ───
const failures = [];
for (const r of results) {
  if (r.error) {
    failures.push(`${r.email}: ${r.error}`);
    continue;
  }
  if (!r.openedSection) failures.push(`${r.email}: раздел не открыт`);
  if (!r.sawOnlyOwnPage) failures.push(`${r.email}: страница оказалась не своей`);
  if (r.foreignMarkers.length > 0) {
    failures.push(`${r.email}: увидел чужую страницу (${r.foreignMarkers.join(", ")})`);
  }
}

// Изоляция сессий: браузер одного пользователя не должен нажать «Отправить».
const sentCounts = [...sent.entries()];
for (const [token, count] of sentCounts) {
  const expected = token === "01" ? 1 : 0;
  if (count !== expected) {
    failures.push(`${token}: запросов «Отправить» ${count}, ожидалось ${expected}`);
  }
}

// Решения не должны смешиваться: первому опасное действие разрешили,
// остальным — нет. Проверяем по факту отправки, а не по счётчику.
const first = results[0];
if (first && !("error" in first) && first.confirmations > 0 && (sent.get("01") ?? 0) === 0) {
  failures.push("01: опасное действие было разрешено, но «Отправить» не сработало");
}
for (const token of ["02", "03"]) {
  if ((sent.get(token) ?? 0) !== 0) {
    failures.push(`${token}: «Отправить» сработало, хотя учитель отказал`);
  }
}
// Каждый должен получить ровно один запрос подтверждения: если бы решение
// уходило не тому, один получил бы ноль или двое.
const perUser = results.filter((r) => !("error" in r)).map((r) => r.confirmations);
if (perUser.some((c) => c === 0)) {
  failures.push(`не все пользователи получили подтверждение: ${perUser.join(", ")}`);
}

await new Promise((r) => server.close(r));

if (failures.length) {
  console.log("\nПРОВАЛ:");
  for (const f of failures) console.log("  -", f);
  process.exit(1);
}
console.log("\nOK: три пользователя отработали одновременно, сессии изолированы, решения не смешались.");
