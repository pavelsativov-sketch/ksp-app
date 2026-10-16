/**
 * Замер отзывчивости ввода: столько сетевых запросов и миллисекунд уходит
 * на одно действие учителя в рабочей области.
 *
 * Клиент (вкладка «Браузер») ходит в /api/agents/browser-stream. Здесь тот же
 * путь гоняется напрямую через внутренние модули с тем же счётчиком запросов,
 * что использует раннер. Нужен, чтобы оптимизацию проверять числом, а не
 * ощущением.
 *
 * Запуск: npm run test:agent
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const RUNNER_PORT = 4477;
const RPC_URL = `http://127.0.0.1:${RUNNER_PORT}/_agent/browser`;
const USER = `651f${"0".repeat(18)}cc`;
const HOST = "school-portal.test";
const SITE_PORT = 4478;

vi.mock("@/lib/agents/sandbox-browser-service", () => ({
  getSandboxBrowserRpcUrl: async () => RPC_URL,
}));

// Роут требует авторизацию и лимит — пропускаем их, всё остальное настоящее.
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

let site: { close: () => void } | null = null;
let runner: ReturnType<typeof spawn> | null = null;

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
  process.env.MONGODB_DB = "ksp_agent_live_latency";
  process.env.VERCEL = "1";

  site = await new Promise<{ close: () => void }>((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${HOST}:${SITE_PORT}`);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (url.pathname === "/login") {
        return res.end(`<!doctype html><html lang="ru"><body style="padding:40px">
<h1>Вход</h1>
<form method="post" action="/auth">
<p><label>Логин <input name="login" placeholder="Логин или ИИН"></label></p>
<p><label>Пароль <input name="password" type="password" placeholder="Пароль"></label></p>
<p><button type="submit">Войти</button></p>
</form></body></html>`);
      }
      return res.end("<h1>Дашборд учителя</h1><p>Вы вошли.</p>");
    });
    server.listen(SITE_PORT, "127.0.0.1", () =>
      resolve({ close: () => { server.close(); server.closeAllConnections?.(); } }));
  });

  const dir = path.join(process.cwd(), "node_modules", ".cache", "mekty-runner-lat");
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
        const health = await res.json() as { chromiumReady?: boolean };
        if (health.chromiumReady) return;
      }
    } catch { /* ждём */ }
    await sleep(500);
  }
  throw new Error("раннер не поднялся или Chromium не прогрелся");
}, 120_000);

afterAll(() => {
  runner?.kill();
  site?.close();
});

describe("Отзывчивость ввода", () => {
  it("одно нажатие клавиши стоит одного запроса в песочницу", async () => {
    const { getAgentBrowserSession } = await import("@/lib/agents/browser-session");
    const { POST } = await import("@/app/api/agents/browser-stream/route");

    // Меряем НАСТОЯЩИЙ роут, а не его копию: иначе тест защищал бы от
    // регрессии не тот код, который едет в прод.
    const realFetch = globalThis.fetch;
    let rpcCount = 0;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(`127.0.0.1:${RUNNER_PORT}`)) rpcCount += 1;
      return realFetch(input as RequestInfo, init);
    }) as typeof fetch;

    const session = await getAgentBrowserSession(USER);
    await session.page.goto(`http://${HOST}:${SITE_PORT}/login`, { timeout: 20_000 });

    const send = async (body: Record<string, unknown>) => {
      rpcCount = 0;
      const t0 = performance.now();
      const res = await POST(new Request("http://localhost/api/agents/browser-stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      if (!res) throw new Error("роут не вернул ответ");
      await res.arrayBuffer();
      return { ms: performance.now() - t0, rpcs: rpcCount, status: res.status };
    };

    await send({ action: "type", text: "a" }); // прогрев: создание сессии

    const samples = [] as Array<{ ms: number; rpcs: number; status: number }>;
    for (let i = 0; i < 6; i++) samples.push(await send({ action: "type", text: "a" }));

    const click = await send({ action: "click", x: 300, y: 300 });
    const shot = await send({ action: "screenshot" });

    globalThis.fetch = realFetch;

    const avgMs = Math.round(samples.reduce((s, x) => s + x.ms, 0) / samples.length);
    const rpcsPerKeystroke = Math.max(...samples.map((s) => s.rpcs));
    const maxMs = Math.round(Math.max(...samples.map((s) => s.ms)));

    const report = [
      "действие: type (одно нажатие клавиши)",
      `сетевых запросов в песочницу: ${rpcsPerKeystroke}`,
      `задержка: средняя ${avgMs} мс, максимум ${maxMs} мс`,
      `замеров: ${samples.length}, HTTP ${samples.map((s) => s.status).join(",")}`,
      "",
      `действие: click по полю — запросов ${click.rpcs}, ${Math.round(click.ms)} мс`,
      `действие: screenshot (опрос кадра) — запросов ${shot.rpcs}, ${Math.round(shot.ms)} мс`,
    ].join("\n");
    writeFileSync(
      path.join(process.cwd(), "node_modules", ".cache", "typing-latency.txt"),
      report + "\n",
      "utf8",
    );
    console.log(report);

    // До оптимизации на нажатие уходило 5 запросов к удалённой песочнице.
    expect(rpcsPerKeystroke).toBe(1);
  }, 120_000);
});