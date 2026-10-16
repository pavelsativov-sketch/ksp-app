/**
 * Настоящий сценарий учителя с настоящей моделью.
 *
 *   «Авторизуйся вот логин и пароль и открой дэшборд»
 *
 * Что проверяется по-настоящему, без моков на критичном пути:
 *   - реальный провайдер (OpenRouter) выбирает действия и передаёт координаты;
 *   - агент открывает страницу входа и сам обнаруживает, что нужен пароль;
 *   - агент останавливается и передаёт управление учителю (PAUSED);
 *   - учитель вводит логин и пароль в том же браузере;
 *   - агент возобновляется и доводит задачу до дашборда.
 *
 * Сайт-цель поднимается локально и служит заглушкой BilimClass, чтобы не
 * трогать реальные школьные учётные данные.
 *
 * Запуск: npm run test:agent
 */
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ── Учётные данные вымышленные: цель — локальный сервер-заглушка ──────────
const LOGIN = "teacher_ivanov";
const PASSWORD = "DemoPass-2026";
const SITE_PORT = 4455;
const RUNNER_PORT = 4456;
const RPC_URL = `http://127.0.0.1:${RUNNER_PORT}/_agent/browser`;
const USER = `651f${"0".repeat(18)}bb`;

// ── Локальный сайт-заглушка: вход и дашборд ───────────────────────────────
// Сайт слушает на loopback, но обращаемся к нему по обычному имени хоста:
// модель в SYSTEM_PROMPT запрещает открывать «локальные» адреса, и на
// 127.0.0.1 она честно отказывалась работать. Это ограничение правильное для
// продакшна, поэтому подменяем разрешение имён в самом Chromium, а не
// переучиваем модель.
const HOST = "school-portal.test";
const PORT_ORIGIN = `:${SITE_PORT}`;

function startTargetSite() {
  const loginPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Вход — Школьный портал</title></head>
<body style="font-family:system-ui;padding:40px">
  <h1>Школьный портал — вход</h1>
  <form method="post" action="/auth">
    <p><label>Логин <input name="login" placeholder="Логин или ИИН" style="padding:8px"></label></p>
    <p><label>Пароль <input name="password" type="password" placeholder="Пароль" style="padding:8px"></label></p>
    <p><button type="submit" style="padding:8px 20px">Войти</button></p>
  </form>
</body></html>`;

  const dashboardPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Дашборд учителя</title></head>
<body style="font-family:system-ui;padding:40px">
  <h1>Дашборд учителя</h1>
  <p>Вы вошли как <b>${LOGIN}</b>.</p>
  <p>Сегодня: 5 уроков, 2 классных часа.</p>
  <p><a href="/login">Выйти</a></p>
</body></html>`;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${HOST}${PORT_ORIGIN}`);
    const read = () => new Promise<string>((resolve) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => resolve(body));
    });

    if (url.pathname === "/login") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(loginPage);
    }
    if (url.pathname === "/auth") {
      void read().then((body) => {
        const params = new URLSearchParams(body);
        if (params.get("login") === LOGIN && params.get("password") === PASSWORD) {
          res.writeHead(302, { location: "/dashboard" });
          return res.end();
        }
        res.writeHead(401, { "content-type": "text/html; charset=utf-8" });
        res.end("<h1>Неверный логин или пароль</h1>");
      });
      return;
    }
    if (url.pathname === "/dashboard") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(dashboardPage);
    }
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>Страница не найдена</h1>");
  });

  return new Promise<{ close: () => void }>((resolve) => {
    server.listen(SITE_PORT, "127.0.0.1", () => {
      resolve({ close: () => { server.close(); server.closeAllConnections?.(); } });
    });
  });
}

// ── Настоящий раннер, но без гварда для локальной цели ───────────────────
// Продакшн-код не трогаем: гвард нужен против SSRF, а здесь цель — loopback.
// Правка применяется только к извлечённой копии скрипта в тесте.
function buildRunnerScript(): string {
  const file = path.join(process.cwd(), "src", "lib", "agents", "sandbox-runner-code.ts");
  const source = readFileSync(file, "utf8");
  const marker = "RUNNER_SCRIPT = `";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error("не найдено объявление RUNNER_SCRIPT");
  const body = source.slice(start + marker.length, source.lastIndexOf("`"));
  const script = new Function(`return \`${body}\`;`)();
  return script
    // Гвард против SSRF для loopback-цели не нужен и мешает.
    .replace(
      "await installRequestGuard(context);",
      "// guard off: цель теста — локальный сервер-заглушка",
    )
    // Chromium сам отдаёт school-portal.test на 127.0.0.1.
    .replace(
      '"--disable-gpu",',
      `"--disable-gpu",\n        "--host-resolver-rules=MAP ${HOST} 127.0.0.1",`,
    );
}

// ── Окружение теста ───────────────────────────────────────────────────────
vi.mock("@/lib/agents/sandbox-browser-service", () => ({
  getSandboxBrowserRpcUrl: async () => RPC_URL,
}));

// Тест про браузер, а не про Linux-среду. С VERCEL=1 рабочая область пошла бы
// создавать настоящий Vercel Sandbox и упала бы на отсутствии OIDC-токена,
// поэтому файловая среда подменена на «недоступную» — раннер в этом случае
// и сам убирает из инструментов runCommand.
vi.mock("@/lib/workspace/runtime", () => ({
  getWorkspaceRuntime: async () => ({
    getSandboxStatus: async () => ({
      available: false,
      status: "e2e-no-shell",
      cwd: "/",
      timeoutMs: 0,
      vcpus: 0,
      reason: "Linux-среда в живом тесте не используется",
    }),
    writeFile: async () => undefined,
    readFile: async () => "",
    listFiles: async () => [],
  }),
  getAccountSandbox: async () => { throw new Error("песочница в живом тесте недоступна"); },
}));

// SSRF-фильтр закрывает loopback, поэтому для локальной цели он подменён.
// Сам фильтр покрыт отдельными юнит-тестами (src/lib/agents/ssrf.ts).
vi.mock("@/lib/agents/ssrf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/ssrf")>();
  return {
    ...actual,
    checkPublicUrl: async (raw: string) => {
      try {
        const u = new URL(raw);
        if (u.hostname === HOST && u.port === String(SITE_PORT)) {
          return { ok: true as const, url: u };
        }
      } catch { /* fall through */ }
      return actual.checkPublicUrl(raw);
    },
  };
});

let site: { close: () => void } | null = null;
let runner: ReturnType<typeof spawn> | null = null;

beforeAll(async () => {
  // Реальные ключи и отдельная база: продовые данные тест не трогает.
  for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
  process.env.MONGODB_DB = "ksp_agent_live_agent";
  process.env.VERCEL = "1";

  site = await startTargetSite();

  const dir = path.join(process.cwd(), "node_modules", ".cache", "mekty-runner-live");
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
      if ((await fetch(`http://127.0.0.1:${RUNNER_PORT}/health`)).ok) return;
    } catch { /* ещё поднимается */ }
    await sleep(500);
  }
  throw new Error("раннер не поднялся");
}, 120_000);

afterAll(async () => {
  runner?.kill();
  site?.close();
  // Тест писал в отдельную базу на общем кластере Atlas — убираем её,
  // чтобы в аккаунте не осталось мусора. Трейс остаётся в node_modules/.cache.
  try {
    const { getDb } = await import("@/lib/mongo");
    const db = await getDb();
    const client = (db as unknown as { client: { db: (n: string) => { dropDatabase: () => Promise<boolean> } } }).client;
    await client.db("ksp_agent_live_agent").dropDatabase();
  } catch { /* база могла не создаться — это не ошибка теста */ }
});

describe("Агент: вход по логину и паролю, затем дашборд", () => {
  it("доходит до дашборда, попросив учителя ввести пароль", async () => {
    const { getDb } = await import("@/lib/mongo");
    const { COL } = await import("@/lib/mongo");
    const { runAgentTask } = await import("@/lib/agents/runner");
    const { setControlOwner } = await import("@/lib/agents/session");
    const { getAgentBrowserSession } = await import("@/lib/agents/browser-session");
    const { readInteractables, SCREEN_WIDTH, SCREEN_HEIGHT, denormalize } =
      await import("@/lib/agents/computer/screen");

    const db = await getDb();
    const taskId = new (await import("mongodb")).ObjectId();
    await db.collection(COL.agentTasks).insertOne({
      _id: taskId,
      user_id: new (await import("mongodb")).ObjectId(USER),
      school_id: null,
      title: "e2e: вход и дашборд",
      prompt: "",
      status: "running",
      created_at: new Date(),
      updated_at: new Date(),
    });

    const events: Array<{ type: string; message: string }> = [];
    let paused = false;

    // Vitest прячет stdout у прошедших тестов, поэтому ход агента пишем в
    // файл: по нему видно, что именно делала модель на каждом шаге.
    const tracePath = path.join(process.cwd(), "node_modules", ".cache", "agent-login-trace.log");
    const trace: string[] = [];
    mkdirSync(path.dirname(tracePath), { recursive: true });

    const running = runAgentTask(taskId.toString(),
      `Открой http://${HOST}${PORT_ORIGIN}/login, авторизуйся: логин ${LOGIN}, пароль ${PASSWORD}. Затем открой дашборд.`,
      USER,
      async (event: { type: string; message: string }) => {
        events.push({ type: event.type, message: event.message });
        trace.push(`[${event.type}] ${event.message}`);
        writeFileSync(tracePath, trace.join("\n"), "utf8");
        if (event.type === "PAUSED") paused = true;
      },
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      trace.push(`[THREW] ${message}`);
      writeFileSync(tracePath, trace.join("\n"), "utf8");
    });

    // 1. Агент должен сам упереться в форму входа и передать управление.
    // Выходим раньше, если задача уже завершилась: ждать её 150 секунд
    // после падения бессмысленно.
    const deadline = Date.now() + 150_000;
    while (!paused && Date.now() < deadline) {
      const row = await db.collection(COL.agentTasks).findOne(
        { _id: taskId },
        { projection: { status: 1 } },
      );
      if (row?.status && row.status !== "running") break;
      await sleep(500);
    }
    expect(paused, "агент должен передать управление учителю на странице входа").toBe(true);

    // 2. Учитель вводит данные в том же браузере — так же, как вкладка ОС.
    const session = await getAgentBrowserSession(USER);
    const items = await readInteractables(session.page as never);
    const find = (label: string) => {
      const line = items.split("\n").find((l) => l.includes(label));
      if (!line) throw new Error(`не найден элемент «${label}» в списке:\n${items}`);
      const m = /\((\d+),(\d+)\)/.exec(line)!;
      return {
        x: denormalize(Number(m[1]), SCREEN_WIDTH),
        y: denormalize(Number(m[2]), SCREEN_HEIGHT),
      };
    };

    await session.page.mouse.click(find("Логин").x, find("Логин").y);
    await session.page.keyboard.type(LOGIN);
    await session.page.mouse.click(find("Пароль").x, find("Пароль").y);
    await session.page.keyboard.type(PASSWORD);
    await session.page.mouse.click(find("Войти").x, find("Войти").y);
    await sleep(1500);

    expect(session.page.url()).toContain("/dashboard");

    // 3. Учитель отдаёт управление — агент должен завершить задачу.
    await setControlOwner(USER, "ai");
    await running;

    const task = await db.collection(COL.agentTasks).findOne({ _id: taskId });
    expect(task, "документ задачи должен существовать").not.toBeNull();
    const summary: string = String((task as { result?: string }).result ?? "");

    trace.push(`=== ИТОГ ===`, `статус: ${task?.status}`, `адрес: ${session.page.url()}`, `summary: ${summary}`);
    writeFileSync(tracePath, trace.join("\n"), "utf8");

    expect(task?.status).toBe("completed");
    expect(session.page.url()).toContain("/dashboard");
    expect(summary.toLowerCase()).toMatch(/дашборд|dashboard/);
  }, 300_000);
});