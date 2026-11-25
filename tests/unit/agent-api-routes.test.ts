import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  apiAuth: vi.fn(),
  rate: vi.fn(),
  startAgentTask: vi.fn(),
  listAgentTasks: vi.fn(),
  runtime: vi.fn(),
  reserve: vi.fn(),
  finalize: vi.fn(),
  plan: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mock.apiAuth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate, clientIp: () => "203.0.113.7" }));
vi.mock("@/lib/billing/quota", () => ({ reserveQuotaOrResponse: mock.reserve, getPlanForUser: mock.plan }));
vi.mock("@/lib/agents/orchestrator", () => ({
  startAgentTask: mock.startAgentTask,
  listAgentTasks: mock.listAgentTasks,
  maybeDispatchQueuedFromRequest: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/workspace/runtime", () => ({
  getWorkspaceRuntime: mock.runtime,
}));

import { POST as taskPOST, GET as taskGET } from "@/app/api/agents/task/route";
import { POST as terminalPOST, GET as terminalGET } from "@/app/api/agents/terminal/route";
import { PATCH as sandboxPATCH } from "@/app/api/agents/sandbox/route";

const userId = "a".repeat(24);

beforeEach(() => {
  vi.clearAllMocks();
  mock.apiAuth.mockResolvedValue({ user: { id: userId, email: "t@example.invalid" } });
  mock.rate.mockResolvedValue({ ok: true, remaining: 9, resetAt: Date.now() + 3600_000 });
  mock.reserve.mockResolvedValue({ ok: true, reservation: { remaining: 5, finalize: mock.finalize } });
  mock.plan.mockResolvedValue({ plan: "free" });
});

const taskPost = (prompt: string) => taskPOST(new Request("http://x/api/agents/task", {
  method: "POST",
  body: JSON.stringify({ prompt }),
}));
const terminalPost = (command: string) => terminalPOST(new Request("http://x/api/agents/terminal", {
  method: "POST",
  body: JSON.stringify({ command }),
}));
/** Отказ только для ключа лимита с данным префиксом. */
const denyKey = (prefix: string) => mock.rate.mockImplementation(async (key: string) => ({
  ok: !key.startsWith(prefix), remaining: 0, resetAt: Date.now() + 1000,
}));

describe("H1: задачи агента расходуют квоту assist", () => {
  it("занимает слот assist и подтверждает его после старта", async () => {
    mock.startAgentTask.mockResolvedValue({ id: "6adf9c234d9f7a0e47ed46c7", status: "running" });
    const res = await taskPost("Напиши план урока");
    expect(res.status).toBe(201);
    expect(mock.reserve).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), "assist");
    expect(mock.finalize).toHaveBeenCalledWith(true);
    expect(mock.finalize).not.toHaveBeenCalledWith(false);
  });

  it("возвращает слот, если задачу не удалось запустить", async () => {
    mock.startAgentTask.mockRejectedValue(new Error("db down"));
    const res = await taskPost("Напиши план урока");
    expect(res.status).toBe(500);
    expect(mock.finalize).toHaveBeenCalledWith(false);
  });

  it("при исчерпанной квоте не запускает задачу", async () => {
    mock.reserve.mockResolvedValue({ ok: false, response: new Response("{}", { status: 429 }) });
    const res = await taskPost("Напиши план урока");
    expect(res.status).toBe(429);
    expect(mock.startAgentTask).not.toHaveBeenCalled();
  });

  it("дневной лимит новых задач: 429 до резерва квоты", async () => {
    denyKey("agent:new:day:");
    const res = await taskPost("Напиши план урока");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/Дневной лимит/);
    expect(mock.reserve).not.toHaveBeenCalled();
    expect(mock.rate).toHaveBeenCalledWith(`agent:new:day:${userId}`, 50, 86_400_000);
  });
});

describe("H2: дневной лимит команд терминала", () => {
  it("бесплатный тариф: 200 команд в сутки, затем понятный отказ", async () => {
    denyKey("agent:terminal:day:");
    const res = await terminalPost("ls");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/бесплатном тарифе \(200\)/);
    expect(mock.rate).toHaveBeenCalledWith(`agent:terminal:day:${userId}`, 200, 86_400_000);
    expect(mock.runtime).not.toHaveBeenCalled();
  });

  it("Pro: 2000 команд в сутки", async () => {
    mock.plan.mockResolvedValue({ plan: "pro" });
    mock.runtime.mockResolvedValue({ runCommand: vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" })) });
    const res = await terminalPost("ls");
    expect(res.status).toBe(200);
    expect(mock.rate).toHaveBeenCalledWith(`agent:terminal:day:${userId}`, 2000, 86_400_000);
  });

  it("лимит новых сред с IP: 429 с понятным текстом", async () => {
    mock.runtime.mockImplementation(async (_id: string, opts: { beforeCreate: () => Promise<void> }) => {
      await opts.beforeCreate();
      return { runCommand: vi.fn() };
    });
    denyKey("agent:sandbox:create:ip:");
    const res = await terminalPost("ls");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/новых Linux-сред/);
    expect(mock.rate).toHaveBeenCalledWith("agent:sandbox:create:ip:203.0.113.7", 10, 3_600_000);
  });
});

describe("POST /api/agents/task", () => {
  it("401 без авторизации", async () => {
    mock.apiAuth.mockResolvedValue({ response: new Response("x", { status: 401 }) });
    const res = await taskPOST(new Request("http://x/api/agents/task", {
      method: "POST",
      body: JSON.stringify({ prompt: "Поручение" }),
    }));
    expect(res.status).toBe(401);
  });

  it("400 на короткий/пустой prompt", async () => {
    const res = await taskPOST(new Request("http://x/api/agents/task", {
      method: "POST",
      body: JSON.stringify({ prompt: "аб" }),
    }));
    expect(res.status).toBe(400);
  });

  it("201 и taskId при успешном старте", async () => {
    mock.startAgentTask.mockResolvedValue({ id: "6adf9c234d9f7a0e47ed46c7", status: "running" });
    const res = await taskPOST(new Request("http://x/api/agents/task", {
      method: "POST",
      body: JSON.stringify({ prompt: "Напиши план урока" }),
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.taskId).toBe("6adf9c234d9f7a0e47ed46c7");
    expect(mock.startAgentTask).toHaveBeenCalledWith(userId, null, "Напиши план урока");
  });

  it("202 и queued, когда задача встала в очередь", async () => {
    mock.startAgentTask.mockResolvedValue({ id: "6adf9c234d9f7a0e47ed46c8", status: "queued" });
    const res = await taskPOST(new Request("http://x/api/agents/task", {
      method: "POST",
      body: JSON.stringify({ prompt: "Второе поручение" }),
    }));
    expect(res.status).toBe(202);
  });

  it("409 при занятом слоте", async () => {
    mock.startAgentTask.mockRejectedValue(new Error("AGENT_TASK_ALREADY_RUNNING"));
    const res = await taskPOST(new Request("http://x/api/agents/task", {
      method: "POST",
      body: JSON.stringify({ prompt: "Поручение" }),
    }));
    expect(res.status).toBe(409);
  });
});

describe("GET /api/agents/task", () => {
  it("отдаёт список задач", async () => {
    mock.listAgentTasks.mockResolvedValue([{ id: "1", title: "T", status: "running", result: null, error: null, createdAt: "2026-01-01" }]);
    const res = await taskGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
  });
});

describe("POST /api/agents/terminal", () => {
  it("400 на пустую команду", async () => {
    const res = await terminalPOST(new Request("http://x/api/agents/terminal", {
      method: "POST",
      body: JSON.stringify({ command: "  " }),
    }));
    expect(res.status).toBe(400);
  });

  it("выполняет команду через runtime и возвращает результат", async () => {
    const runCommand = vi.fn(async () => ({ exitCode: 0, stdout: "hello", stderr: "" }));
    mock.runtime.mockResolvedValue({ runCommand });
    const res = await terminalPOST(new Request("http://x/api/agents/terminal", {
      method: "POST",
      body: JSON.stringify({ command: "echo hello" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Команда оборачивается записью PID для кнопки «Стоп».
    expect(runCommand).toHaveBeenCalledOnce();
    const calls = runCommand.mock.calls as unknown as Array<[command: string, timeoutMs?: number]>;
    expect(String(calls[0]?.[0] ?? "")).toContain("mekty-term.pid");
  });

  it("503 без песочницы", async () => {
    mock.runtime.mockRejectedValue(new Error("Linux-среда не установлена"));
    delete process.env.VERCEL;
    delete process.env.WORKSPACE_RUNTIME;
    const res = await terminalPOST(new Request("http://x/api/agents/terminal", {
      method: "POST",
      body: JSON.stringify({ command: "ls" }),
    }));
    expect(res.status).toBe(503);
  });
});

describe("GET /api/agents/terminal", () => {
  it("отдаёт статус песочницы", async () => {
    mock.runtime.mockResolvedValue({
      getSandboxStatus: vi.fn(async () => ({ available: false, status: "local-workspace" })),
    });
    const res = await terminalGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
  });
});

describe("PATCH /api/agents/sandbox", () => {
  it("переименовывает файл внутри рабочей среды без отправки содержимого клиентом", async () => {
    const renameFile = vi.fn(async () => undefined);
    mock.runtime.mockResolvedValue({ renameFile });
    const res = await sandboxPATCH(new Request("http://x/api/agents/sandbox", {
      method: "PATCH",
      body: JSON.stringify({ from: "materials/source.md", to: "materials/final.md" }),
    }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, name: "materials/final.md" });
    expect(renameFile).toHaveBeenCalledWith("materials/source.md", "materials/final.md");
  });

  it("отклоняет запрос без пары имён", async () => {
    const res = await sandboxPATCH(new Request("http://x/api/agents/sandbox", {
      method: "PATCH",
      body: JSON.stringify({ from: "source.md" }),
    }));
    expect(res.status).toBe(400);
  });
});
