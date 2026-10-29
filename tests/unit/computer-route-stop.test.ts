/**
 * Агент «Работа с компьютером»: остановка.
 *
 * Сервер отвечал «остановите его», но остановить было нечем: цикл умел
 * реагировать на `isStopped`, а маршрут этот колбэк не передавал и не имел DELETE.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../helpers/fake-mongo";

const mock = vi.hoisted(() => ({
  apiAuth: vi.fn(),
  rate: vi.fn(),
  runLoop: vi.fn(),
  setControl: vi.fn(),
  db: null as unknown as ReturnType<typeof import("../helpers/fake-mongo").fakeDb>,
}));

vi.mock("server-only", () => ({}));
// Настоящие run-state и confirm работают поверх имитации Mongo: так проверяется
// именно общее хранилище, а не память одного процесса.
vi.mock("@/lib/mongo", () => ({
  COL: { agentComputerRuns: "agent_computer_runs", agentComputerConfirms: "agent_computer_confirms" },
  getDb: () => mock.db.getDb(),
}));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mock.apiAuth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate }));
vi.mock("@/lib/agents/ssrf", () => ({
  checkPublicUrl: vi.fn(async (url: string) => ({ ok: true, url: new URL(url) })),
  installRequestGuard: vi.fn(),
}));
vi.mock("@/lib/agents/session", () => ({
  getControlOwner: vi.fn(async () => "ai"),
  setControlOwner: mock.setControl,
}));
vi.mock("@/lib/agents/computer/loop", () => ({ runComputerUse: mock.runLoop }));
vi.mock("@/lib/logger", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/agents/browser-session", () => ({
  browserFailure: () => ({ status: 502, message: "x" }),
  getAgentBrowserSession: vi.fn(async () => ({ page: { url: () => "https://example.com", goto: vi.fn() } })),
  persistAgentBrowserSession: vi.fn(),
}));
vi.mock("@/lib/agents/browser-dom", () => ({
  inspectActiveField: vi.fn(),
  detectPageAuthBarrier: vi.fn(),
}));
vi.mock("@/lib/agents/domain-skills/bilimclass", () => ({ isBilimClassContext: () => false }));

import { POST, GET, DELETE } from "@/app/api/agents/computer/route";

const userId = "b".repeat(24);

const post = () => new Request("http://x/api/agents/computer", {
  method: "POST",
  body: JSON.stringify({ goal: "Открой страницу и скажи заголовок" }),
});

const isRunning = async () => (await (await GET(new Request("http://x/api/agents/computer"))).json()).running;

beforeEach(() => {
  vi.clearAllMocks();
  mock.db = fakeDb();
  mock.apiAuth.mockResolvedValue({ user: { id: userId } });
  mock.rate.mockResolvedValue({ ok: true });
  mock.setControl.mockResolvedValue(undefined);
});

describe("остановка агента «Работа с компьютером»", () => {
  it("DELETE без работающего агента отвечает спокойно", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, running: false });
  });

  it("DELETE останавливает цикл: isStopped становится true, подтверждения отклоняются", async () => {
    let stoppedSeen = false;
    mock.runLoop.mockImplementation(async (opts: { isStopped?: () => boolean | Promise<boolean> }) => {
      // Агент «работает», пока учитель не нажмёт «Остановить».
      for (let i = 0; i < 400; i += 1) {
        if (await opts.isStopped?.()) { stoppedSeen = true; return "Остановлено пользователем"; }
        await new Promise((r) => setTimeout(r, 5));
      }
      return "не остановили";
    });

    const running = POST(post());
    await vi.waitFor(async () => { expect(await isRunning()).toBe(true); });

    const stop = await DELETE();
    expect(await stop.json()).toMatchObject({ ok: true, running: true, stopping: true });

    const body = await (await running).json();
    expect(stoppedSeen).toBe(true);
    expect(body.summary).toBe("Остановлено пользователем");
    // После остановки слот свободен: можно запускать нового агента.
    expect(await isRunning()).toBe(false);
  });

  it("повторный запуск при работающем агенте даёт 409", async () => {
    mock.runLoop.mockImplementation(async (opts: { isStopped?: () => boolean | Promise<boolean> }) => {
      while (!(await opts.isStopped?.())) await new Promise((r) => setTimeout(r, 5));
      return "стоп";
    });
    const first = POST(post());
    await vi.waitFor(async () => { expect(await isRunning()).toBe(true); });
    const second = await POST(post());
    expect(second.status).toBe(409);
    await DELETE();
    await first;
  });
});
