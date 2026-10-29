/**
 * Автопродолжение длинных задач: решение, подпись запроса и служебный маршрут.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestrator = vi.hoisted(() => ({ continueAgentTask: vi.fn() }));
vi.mock("@/lib/agents/orchestrator", () => orchestrator);

import {
  MAX_CONTINUATIONS,
  appBaseUrl,
  decideContinuation,
  signContinuation,
  triggerContinuation,
  verifyContinuation,
} from "@/lib/agents/continuation";
import { POST } from "@/app/api/agents/task/continue/route";

const SECRET = "s".repeat(40);
const TASK = "a".repeat(24);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = SECRET;
  process.env.APP_URL = "https://app.example.com";
});

describe("решение о продолжении", () => {
  it("по времени продолжает, пока не исчерпан лимит продолжений", () => {
    expect(decideContinuation({ reason: "time", continuations: 0, appUrl: "https://x" })).toBe("continue");
    expect(decideContinuation({ reason: "time", continuations: MAX_CONTINUATIONS - 1, appUrl: "https://x" })).toBe("continue");
    expect(decideContinuation({ reason: "time", continuations: MAX_CONTINUATIONS, appUrl: "https://x" })).toBe("finish");
  });

  it("лимит шагов и неизвестный адрес приложения — завершение", () => {
    expect(decideContinuation({ reason: "steps", continuations: 0, appUrl: "https://x" })).toBe("finish");
    expect(decideContinuation({ reason: undefined, continuations: 0, appUrl: "https://x" })).toBe("finish");
    expect(decideContinuation({ reason: "time", continuations: 0, appUrl: null })).toBe("finish");
  });
});

describe("адрес приложения", () => {
  it("берёт APP_URL, затем адрес Vercel; http допускает только localhost", () => {
    expect(appBaseUrl({ APP_URL: "https://ksp.example.com/path" })).toBe("https://ksp.example.com");
    expect(appBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "ksp.vercel.app" })).toBe("https://ksp.vercel.app");
    expect(appBaseUrl({ VERCEL_URL: "ksp-abc.vercel.app" })).toBe("https://ksp-abc.vercel.app");
    expect(appBaseUrl({ APP_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
    expect(appBaseUrl({ APP_URL: "http://evil.example.com" })).toBeNull();
    expect(appBaseUrl({})).toBeNull();
  });
});

describe("подпись продолжения", () => {
  it("принимает свою подпись и отвергает чужую, пустую и подпись другой задачи", () => {
    const sig = signContinuation(TASK);
    expect(verifyContinuation(TASK, sig)).toBe(true);
    expect(verifyContinuation("b".repeat(24), sig)).toBe(false);
    expect(verifyContinuation(TASK, null)).toBe(false);
    expect(verifyContinuation(TASK, "")).toBe(false);
    expect(verifyContinuation(TASK, sig.slice(0, -2) + "AA")).toBe(false);
    expect(verifyContinuation(TASK, sig, "x".repeat(40))).toBe(false);
  });

  it("не подписывает коротким секретом", () => {
    expect(() => signContinuation(TASK, "short")).toThrow();
    expect(verifyContinuation(TASK, "abc", "short")).toBe(false);
  });
});

describe("самовызов", () => {
  it("отправляет подписанный POST на служебный маршрут", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 202 }));
    expect(await triggerContinuation(TASK, fetchMock as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://app.example.com/api/agents/task/continue");
    expect((init as RequestInit).headers).toMatchObject({ "x-mekty-continue": signContinuation(TASK) });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ taskId: TASK });
  });

  it("сбой сети или отказ приложения — false, а не исключение", async () => {
    expect(await triggerContinuation(TASK, vi.fn().mockRejectedValue(new Error("сеть")) as unknown as typeof fetch)).toBe(false);
    expect(await triggerContinuation(TASK, vi.fn().mockResolvedValue(new Response("", { status: 403 })) as unknown as typeof fetch)).toBe(false);
  });

  it("без адреса приложения не делает запрос", async () => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const fetchMock = vi.fn();
    expect(await triggerContinuation(TASK, fetchMock as unknown as typeof fetch)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("маршрут /api/agents/task/continue", () => {
  const request = (body: unknown, signature?: string) =>
    new Request("http://x/api/agents/task/continue", {
      method: "POST",
      headers: { "content-type": "application/json", ...(signature ? { "x-mekty-continue": signature } : {}) },
      body: JSON.stringify(body),
    });

  it("без подписи — 403, задача не запускается", async () => {
    const res = await POST(request({ taskId: TASK }));
    expect(res.status).toBe(403);
    expect(orchestrator.continueAgentTask).not.toHaveBeenCalled();
  });

  it("с чужой подписью — 403", async () => {
    const res = await POST(request({ taskId: TASK }, signContinuation("b".repeat(24))));
    expect(res.status).toBe(403);
    expect(orchestrator.continueAgentTask).not.toHaveBeenCalled();
  });

  it("с верной подписью запускает продолжение и отвечает 202", async () => {
    orchestrator.continueAgentTask.mockResolvedValue("started");
    const res = await POST(request({ taskId: TASK }, signContinuation(TASK)));
    expect(res.status).toBe(202);
    expect(orchestrator.continueAgentTask).toHaveBeenCalledWith(TASK);
  });

  it("если задача уже не выполняется, отвечает 200 без запуска", async () => {
    orchestrator.continueAgentTask.mockResolvedValue("not_running");
    const res = await POST(request({ taskId: TASK }, signContinuation(TASK)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, result: "not_running" });
  });

  it("некорректные тело и идентификатор — 400", async () => {
    expect((await POST(new Request("http://x/c", { method: "POST", body: "не json" }))).status).toBe(400);
    expect((await POST(request({ taskId: "123" }, "x"))).status).toBe(400);
  });
});
