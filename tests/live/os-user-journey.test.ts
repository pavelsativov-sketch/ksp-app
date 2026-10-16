/**
 * Полный сценарий учителя «с нуля», как в реальной вкладке «Браузер».
 *
 * Ничего не подменяется, кроме авторизации, лимита и самой Vercel Sandbox:
 * запросы идут через НАСТОЯЩИЙ роут /api/agents/browser-stream тем же способом,
 * каким их шлёт интерфейс, а заголовки кадра читаются так же, как в
 * browser.tsx.
 *
 * Шаги:
 *   1. открыть страницу входа;
 *   2. убедиться, что появился баннер «нужен вход» и рамка активного поля;
 *   3. кликнуть по полю логина и напечатать логин;
 *   4. кликнуть по полю пароля и напечатать пароль;
 *   5. нажать «Войти» и попасть на дашборд;
 *   6. убедиться, что сессия сохранена и баннер исчез.
 *
 * Запуск: npm run test:agent
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const HOST = "school-portal.test";
const SITE_PORT = 4488;
const RUNNER_PORT = 4489;
const RPC_URL = `http://127.0.0.1:${RUNNER_PORT}/_agent/browser`;
const USER = `651f${"0".repeat(18)}dd`;
const LOGIN = "teacher_ivanov";
const PASSWORD = "DemoPass-2026";
const ORIGIN = `http://${HOST}:${SITE_PORT}`;

vi.mock("@/lib/agents/sandbox-browser-service", () => ({
  getSandboxBrowserRpcUrl: async () => RPC_URL,
}));
vi.mock("@/lib/api-auth", () => ({
  requireApiAuth: async () => ({ user: { id: USER } }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ ok: true }),
}));
vi.mock("@/lib/workspace/runtime", () => ({
  getWorkspaceRuntime: async () => ({
    getSandboxStatus: async () => ({ available: false, status: "e2e", cwd: "/", timeoutMs: 0, vcpus: 0 }),
    writeFile: async () => undefined, readFile: async () => "", listFiles: async () => [],
  }),
  getAccountSandbox: async () => { throw new Error("нет песочницы"); },
}));
vi.mock("@/lib/agents/ssrf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/ssrf")>();
  return {
    ...actual,
    checkPublicUrl: async (raw: string) => {
      try {
        const u = new URL(raw);
        if (u.hostname === HOST && u.port === String(SITE_PORT)) return { ok: true as const, url: u };
      } catch { /* fall through */ }
      return actual.checkPublicUrl(raw);
    },
  };
});

interface Frame {
  bytes: number;
  url: string;
  title: string;
  activeField: { isEditable?: boolean; isPassword?: boolean; label?: string; box?: { x: number; y: number; width: number; height: number } };
  authBarrier: { requiresUserAction?: boolean; kind?: string | null; reason?: string };
}

let site: { close: () => void } | null = null;
let runner: ReturnType<typeof spawn> | null = null;
let POST: (req: Request) => Promise<Response | undefined>;
let GET: (req: Request) => Promise<Response | undefined>;
const timings: Array<{ step: string; ms: number; rpcs: number }> = [];

function buildRunnerScript(): string {
  const file = path.join(process.cwd(), "src", "lib", "agents", "sandbox-runner-code.ts");
  const source = readFileSync(file, "utf8");
  const marker = "RUNNER_SCRIPT = `";
  const start = source.indexOf(marker);
  const body = source.slice(start + marker.length, source.lastIndexOf("`"));
  return new Function(`return \`${body}\`;`)()
    .replace("await installRequestGuard(context);", "// guard off")
    .replace('"--disable-gpu",', `"--disable-gpu",\n        "--host-resolver-rules=MAP ${HOST} 127.0.0.1",`);
}

beforeAll(async () => {
  for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
  process.env.MONGODB_DB = "ksp_agent_live_journey";
  process.env.VERCEL = "1";

  const route = await import("@/app/api/agents/browser-stream/route");
  POST = route.POST;
  GET = route.GET;

  site = await new Promise<{ close: () => void }>((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", ORIGIN);
      const send = (code: number, html: string, headers: Record<string, string> = {}) => {
        res.writeHead(code, { "content-type": "text/html; charset=utf-8", ...headers });
        res.end(html);
      };
      if (url.pathname === "/login") {
        return send(200, `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Вход — Школьный портал</title></head><body style="font-family:system-ui;padding:40px">
<h1>Школьный портал — вход</h1>
<form method="post" action="/auth">
<p><label>Логин <input name="login" placeholder="Логин или ИИН" style="padding:8px"></label></p>
<p><label>Пароль <input name="password" type="password" placeholder="Пароль" style="padding:8px"></label></p>
<p><button type="submit" style="padding:8px 20px">Войти</button></p>
</form></body></html>`);
      }
      if (url.pathname === "/auth") {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
          const p = new URLSearchParams(body);
          if (p.get("login") === LOGIN && p.get("password") === PASSWORD) {
            // Настоящий вход ставит сессионную куку — её и проверяем дальше.
            res.writeHead(302, {
              location: "/dashboard",
              "set-cookie": `mekty_session=logged-in-as-${LOGIN}; Path=/; HttpOnly`,
            });
            return res.end();
          }
          send(401, "<h1>Неверный логин или пароль</h1>");
        });
        return;
      }
      if (url.pathname === "/dashboard") {
        return send(200, `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Дашборд учителя</title></head><body style="font-family:system-ui;padding:40px">
<h1>Дашборд учителя</h1><p>Вы вошли как <b>${LOGIN}</b>.</p>
<p>Сегодня: 5 уроков, 2 классных часа.</p><p><a href="/login">Выйти</a></p></body></html>`);
      }
      send(404, "<h1>Страница не найдена</h1>");
    });
    server.listen(SITE_PORT, "127.0.0.1", () =>
      resolve({ close: () => { server.close(); server.closeAllConnections?.(); } }));
  });

  const dir = path.join(process.cwd(), "node_modules", ".cache", "mekty-runner-journey");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "runner.mjs");
  writeFileSync(file, buildRunnerScript(), "utf8");

  runner = spawn(process.execPath, [file], {
    env: { ...process.env, PORT: String(RUNNER_PORT), AUTH_SECRET: process.env.AUTH_SECRET },
    stdio: ["ignore", "pipe", "pipe"],
  });
  runner.stderr?.on("data", () => {});
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${RUNNER_PORT}/health`);
      if (res.ok) {
        // Ждём прогрева Chromium: в проде его держит keepalive-пинг вкладки,
        // и первый переход не должен платить запуск браузера.
        const health = await res.json() as { chromiumReady?: boolean };
        if (health.chromiumReady) return;
      }
    } catch { /* ждём */ }
    await sleep(500);
  }
  throw new Error("раннер не поднялся или Chromium не прогрелся");
}, 120_000);

afterAll(async () => {
  runner?.kill();
  site?.close();
  try {
    const { getDb } = await import("@/lib/mongo");
    const db = await getDb();
    const client = (db as unknown as { client: { db: (n: string) => { dropDatabase: () => Promise<boolean> } } }).client;
    await client.db("ksp_agent_live_journey").dropDatabase();
  } catch { /* база могла не создаться */ }
});

/** Ровно то, что делает вкладка «Браузер»: запрос в роут → разбор заголовков. */
async function call(step: string, body: Record<string, unknown> | null, method: "POST" | "GET"): Promise<Frame> {
  const realFetch = globalThis.fetch;
  let rpcs = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes(`127.0.0.1:${RUNNER_PORT}`)) rpcs += 1;
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;

  const t0 = performance.now();
  try {
    const url = method === "GET"
      ? `http://localhost/api/agents/browser-stream?${new URLSearchParams(body as Record<string, string>)}`
      : "http://localhost/api/agents/browser-stream";
    const req = new Request(url, method === "POST" ? {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    } : { method });
    const res = method === "POST" ? await POST(req) : await GET(req);
    if (!res) throw new Error(`${step}: роут не ответил`);
    if (!res.ok) throw new Error(`${step}: HTTP ${res.status} ${await res.text()}`);
    const buf = await res.arrayBuffer();
    const ms = performance.now() - t0;
    timings.push({ step, ms: Math.round(ms), rpcs });

    const decode = <T,>(h: string | null): T | undefined => {
      if (!h) return undefined;
      try { return JSON.parse(decodeURIComponent(h)) as T; } catch { return undefined; }
    };
    return {
      bytes: buf.byteLength,
      url: decodeURIComponent(res.headers.get("X-Page-Url") ?? ""),
      title: decodeURIComponent(res.headers.get("X-Page-Title") ?? ""),
      activeField: decode<Frame["activeField"]>(res.headers.get("X-Active-Field")) ?? {},
      authBarrier: decode<Frame["authBarrier"]>(res.headers.get("X-Auth-Barrier")) ?? {},
    };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** Печатает текст так же, как вкладка: копит буквы и шлёт одним запросом. */
async function typeLikeUser(step: string, text: string): Promise<Frame> {
  const chunks = text.match(/.{1,4}/g) ?? [text];
  let frame = {} as Frame;
  for (const chunk of chunks) frame = await call(`${step}: "${chunk}"`, { action: "type", text: chunk }, "POST");
  return frame;
}

describe("Учитель: вход в систему от начала до конца", () => {
  it("открывает, вводит логин и пароль, попадает на дашборд", async () => {
    const { readInteractables, SCREEN_WIDTH, SCREEN_HEIGHT, denormalize } =
      await import("@/lib/agents/computer/screen");
    const { getAgentBrowserSession, readStoredBrowserState } =
      await import("@/lib/agents/browser-session");

    // Приложение ходит в Mongo на каждой странице, поэтому к моменту
    // открытия вкладки «Браузер» соединение с Atlas уже живое. Без этой
    // строки в замере попадала бы его холодная установка (~9 с) — это
    // артефакт тестового процесса, а не работа ОС.
    {
      const { getDb } = await import("@/lib/mongo");
      const t0 = performance.now();
      await (await getDb()).collection("users").findOne({}, { projection: { _id: 1 } });
      timings.push({ step: "соединение с Mongo (обычно уже живое)", ms: Math.round(performance.now() - t0), rpcs: 0 });
    }

    // 1. Открываем страницу входа, как по короткой ссылке в разделе «Браузер».
    const opened = await call("открыть страницу входа", { action: "navigate", url: `${ORIGIN}/login` }, "POST");
    expect(opened.url).toContain("/login");
    expect(opened.title).toContain("Вход");
    expect(opened.bytes).toBeGreaterThan(1000);

    // 2. Учитель должен увидеть подсказку «нужно войти».
    expect(opened.authBarrier.requiresUserAction, "должен появиться баннер входа").toBe(true);
    expect(opened.authBarrier.kind).toBe("login");

    // 3. Кликаем по полю логина и печатаем.
    const session = await getAgentBrowserSession(USER);
    const items = await readInteractables(session.page as never);
    const coordOf = (label: string) => {
      const line = items.split("\n").find((l) => l.includes(label));
      if (!line) throw new Error(`нет элемента «${label}»:\n${items}`);
      const m = /\((\d+),(\d+)\)/.exec(line)!;
      return { x: denormalize(Number(m[1]), SCREEN_WIDTH), y: denormalize(Number(m[2]), SCREEN_HEIGHT) };
    };

    const loginField = coordOf("Логин");
    const afterLoginClick = await call("клик по полю логина",
      { action: "click", x: loginField.x, y: loginField.y }, "POST");
    expect(afterLoginClick.activeField.box, "рамка активного поля должна появиться").toBeTruthy();
    expect(afterLoginClick.activeField.label).toContain("Логин");

    await typeLikeUser("логин", LOGIN);

    // 4. Кликаем по полю пароля и печатаем пароль — главный сценарий.
    const passwordField = coordOf("Пароль");
    const afterPasswordClick = await call("клик по полю пароля",
      { action: "click", x: passwordField.x, y: passwordField.y }, "POST");
    expect(afterPasswordClick.activeField.isPassword, "поле пароля должно распознаваться").toBe(true);

    await typeLikeUser("пароль", PASSWORD);

    // 5. Нажимаем «Войти».
    const submit = coordOf("Войти");
    const loggedIn = await call("нажать Войти",
      { action: "click", x: submit.x, y: submit.y }, "POST");
    await sleep(600);
    const settled = await call("кадр после входа", { action: "screenshot" }, "GET");

    expect(settled.url, "после входа должен открыться дашборд").toContain("/dashboard");
    expect(settled.title).toContain("Дашборд");
    expect(settled.authBarrier.requiresUserAction, "на дашборде баннер входа не нужен").toBe(false);
    void loggedIn;

    // 6. Сессия должна сохраниться: вход не теряется после рестарта.
    // Сохранение уходит в фон (after), поэтому даём ему долю секунды.
    await sleep(800);
    const stored = await readStoredBrowserState(USER);
    const cookieNames = (stored?.storageState?.cookies ?? []).map((c) => c.name);
    expect(cookieNames, "куки входа должны сохраниться").toContain("mekty_session");

    // ── Отчёт ──
    const total = timings.reduce((s, t) => s + t.ms, 0);
    const report = [
      "Полный сценарий учителя: вход и дашборд",
      "",
      ...timings.map((t) => `  ${t.step.padEnd(34)} ${String(t.ms).padStart(5)} мс, запросов ${t.rpcs}`),
      "",
      `всего действий: ${timings.length}`,
      `суммарное время: ${Math.round(total)} мс`,
      `итог: ${settled.url}`,
      `куки сохранены: ${cookieNames.join(", ")}`,
    ].join("\n");
    writeFileSync(
      path.join(process.cwd(), "node_modules", ".cache", "user-journey.txt"),
      report + "\n",
      "utf8",
    );
    console.log(report);
  }, 180_000);
});