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
  finalize: vi.fn(async (_success: boolean) => {}),
  setControl: vi.fn(),
  releaseControl: vi.fn(async () => {}),
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
vi.mock("@/lib/billing/quota", () => ({
  reserveQuotaOrResponse: vi.fn(async () => ({ ok: true, reservation: { remaining: 5, finalize: mock.finalize } })),
}));
vi.mock("@/lib/agents/ssrf", () => ({
  checkPublicUrl: vi.fn(async (url: string) => ({ ok: true, url: new URL(url) })),
  installRequestGuard: vi.fn(),
}));
vi.mock("@/lib/agents/session", () => ({
  getControlOwner: vi.fn(async () => "ai"),
  setControlOwner: mock.setControl,
  releaseControlToUser: mock.releaseControl,
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
  mock.db = fakeDb({ agent_computer_runs: ["user_id"] });
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
    // Первый запуск подтвердил слот assist, отклонённый второй — вернул свой.
    expect(mock.finalize.mock.calls).toEqual([[true], [false]]);
    await DELETE();
    await first;
  });

  it("после конца цикла (успех или сбой) управление возвращается учителю", async () => {
    mock.runLoop.mockResolvedValueOnce("готово");
    expect((await POST(post())).status).toBe(200);
    expect(mock.releaseControl).toHaveBeenCalledWith(userId);
    expect(mock.finalize.mock.calls[0]).toEqual([true]);

    mock.releaseControl.mockClear();
    mock.runLoop.mockRejectedValueOnce(new Error("boom"));
    expect((await POST(post())).status).toBe(502);
    expect(mock.releaseControl).toHaveBeenCalledWith(userId);
  });
});
