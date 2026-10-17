import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

// Mock MongoDB, AI provider, and browser tools to test the /school agent (runAgentTask) end-to-end
const mockUpdateOne = vi.fn().mockResolvedValue({});
const mockFindOne = vi.fn().mockResolvedValue({ status: "running" });

vi.mock("@/lib/mongo", () => ({
  COL: {
    agentTasks: "agent_tasks",
    agentControls: "agent_controls",
    agentPermissions: "agent_permissions",
  },
  getDb: async () => ({
    collection: () => ({
      updateOne: mockUpdateOne,
      findOne: mockFindOne,
    }),
  }),
}));

vi.mock("@/lib/agents/session", () => ({
  getControlOwner: vi.fn().mockResolvedValue("ai"),
  setControlOwner: vi.fn().mockResolvedValue(undefined),
  // Финал задачи возвращает управление учителю — проверяем, что раннер
  // действительно это делает (панель перестаёт гореть «AI работает»).
  releaseControlToUser: vi.fn().mockResolvedValue(undefined),
  waitForControl: vi.fn().mockResolvedValue("resumed"),
}));

vi.mock("@/lib/workspace/runtime", () => ({
  getWorkspaceRuntime: async () => ({
    getSandboxStatus: async () => ({ available: true }),
  }),
}));

const mockBrowserNavigate = vi.fn(async ({ url }: { url: string }) => ({
  success: true,
  url,
  title: "BilimClass — Дэшборд учителя",
  content: "Дэшборд учителя. Информатика и искусственный интеллект 7 Б РУС Статус: Не проведен",
  interactables: [
    "[0] ссылка (690,117) [7 Б РУС | Вторник 13.10 | Статус: Не проведен] Кнопка 1: Перейти в КТП",
    "[1] ссылка (720,117) [7 Б РУС | Вторник 13.10 | Статус: Не проведен] Кнопка 2: Перейти в журнал (оценки и проведение)",
    "[2] ссылка (750,117) [7 Б РУС | Вторник 13.10 | Статус: Не проведен] Кнопка 3: Перейти в журнал урока",
  ].join("\n"),
}));

const mockBrowserClick = vi.fn(async ({ x, y, intent }: { x: number; y: number; intent?: string }) => {
  if (x === 750 && y === 117) {
    return {
      success: true,
      clicked: "[7 Б РУС | Вторник 13.10 | Статус: Не проведен] Кнопка 3: Перейти в журнал урока",
      url: "https://www.bilimclass.kz/2026/schedule/13.10.2026/lesson/99c631a3/journal",
      title: "Журнал урока — 7 Б РУС",
      content: "Журнал урока 7 Б РУС. Тема: Кодирование текстовой информации.",
      interactables: "[0] кнопка (59,973) Провести урок",
    };
  }
  return {
    success: true,
    clicked: intent || "Провести урок",
    url: "https://www.bilimclass.kz/2026/schedule/13.10.2026/lesson/99c631a3/journal",
    title: "Журнал урока — 7 Б РУС",
    content: "Урок проведен",
    interactables: "[0] кнопка (59,973) Урок проведен",
  };
});

vi.mock("@/lib/agents/tools", () => ({
  tools: {
    browserNavigate: (args: { url: string }) => mockBrowserNavigate(args),
    browserClick: (args: { x: number; y: number; intent?: string }) => mockBrowserClick(args),
    browserType: vi.fn(),
    runCommand: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    listFiles: vi.fn(),
  },
}));

let capturedSystemPrompt = "";
let capturedToolNames: string[] = [];

vi.mock("@/lib/ai/providers", () => ({
  executeWithFallback: async (
    _kind: string,
    fn: (client: { chat: { completions: { create: (opts: Record<string, unknown>) => Promise<unknown> } } }, model: string) => Promise<string>,
  ) => {
    let callIdx = 0;
    const fakeClient = {
      chat: {
        completions: {
          create: async (opts: Record<string, unknown>) => {
            callIdx += 1;
            // Call 1 is the plan step
            if (callIdx === 1) {
              return {
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        steps: [
                          "Открыть дэшборд учителя BilimClass",
                          "Нажать 3-ю кнопку над предметом (Перейти в журнал урока)",
                          "Нажать кнопку «Провести урок»",
                        ],
                      }),
                    },
                  },
                ],
              };
            }
            const msgs = opts.messages as Array<{ role: string; content: string }>;
            capturedSystemPrompt = msgs.find((m) => m.role === "system")?.content ?? "";
            const tools = (opts.tools as Array<{ function: { name: string } }>) ?? [];
            capturedToolNames = tools.map((t) => t.function.name);

            if (callIdx === 2) {
              return {
                choices: [
                  {
                    message: {
                      content: "Открываю страницу дэшборда учителя BilimClass.",
                      tool_calls: [
                        {
                          id: "tc_1",
                          type: "function",
                          function: {
                            name: "browserNavigate",
                            arguments: JSON.stringify({ url: "https://www.bilimclass.kz/2026/frontoffice/dashboard" }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            if (callIdx === 3) {
              return {
                choices: [
                  {
                    message: {
                      content: "Вижу 3 кнопки над карточкой 7 Б РУС. Нажимаю Кнопку 3: Перейти в журнал урока (750, 117).",
                      tool_calls: [
                        {
                          id: "tc_2",
                          type: "function",
                          function: {
                            name: "browserClick",
                            arguments: JSON.stringify({
                              x: 750,
                              y: 117,
                              intent: "Кнопка 3: Перейти в журнал урока (7 Б РУС)",
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            if (callIdx === 4) {
              return {
                choices: [
                  {
                    message: {
                      content: "В журнале урока нажимаю кнопку «Провести урок» (59, 973).",
                      tool_calls: [
                        {
                          id: "tc_3",
                          type: "function",
                          function: {
                            name: "browserClick",
                            arguments: JSON.stringify({
                              x: 59,
                              y: 973,
                              intent: "Провести урок",
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return {
              choices: [
                {
                  message: {
                    content: "Задача выполнена.",
                    tool_calls: [
                      {
                        id: "tc_4",
                        type: "function",
                        function: {
                          name: "finishTask",
                          arguments: JSON.stringify({
                            summary:
                              "Открыт дэшборд учителя BilimClass (/2026/frontoffice/dashboard), выбрана Кнопка 3 «Перейти в журнал урока» для 7 Б РУС и поставлена отметка «Провести урок».",
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            };
          },
        },
      },
    };
    return fn(fakeClient, "test-model");
  },
}));

describe("Агент в /school (runAgentTask) — обучение работе с дэшбордом BilimClass и проведению урока", () => {
  it("подключает знания о дэшборде и 3 кнопках, открывает дэшборд, кликает 3-ю кнопку и проводит урок", async () => {
    const { runAgentTask } = await import("@/lib/agents/runner");
    const taskId = new ObjectId().toString();
    const userId = new ObjectId().toString();
    const events: Array<{ type: string; message: string }> = [];

    await runAgentTask(
      taskId,
      "Открой дэшборд BilimClass и поставь, что урок в 7 Б РУС проведён",
      userId,
      async (ev) => {
        events.push({ type: ev.type, message: ev.message });
      },
    );

    // 1. Проверяем, что в системный промпт агента /school загружены знания о дэшборде и 3 кнопках
    expect(capturedSystemPrompt).toContain("/2026/frontoffice/dashboard");
    expect(capturedSystemPrompt).toContain("Кнопка 1: Перейти в КТП");
    expect(capturedSystemPrompt).toContain("Кнопка 2: Перейти в журнал (оценки и проведение)");
    expect(capturedSystemPrompt).toContain("Кнопка 3: Перейти в журнал урока");
    expect(capturedSystemPrompt).toContain("Провести урок");

    // 2. Проверяем, что агенту /school доступны инструменты навигации и клика
    expect(capturedToolNames).toContain("browserNavigate");
    expect(capturedToolNames).toContain("browserClick");
    expect(capturedToolNames).toContain("browserType");

    // 3. Проверяем последовательность действий агента
    expect(mockBrowserNavigate).toHaveBeenCalledWith({
      url: "https://www.bilimclass.kz/2026/frontoffice/dashboard",
    });
    expect(mockBrowserClick).toHaveBeenNthCalledWith(1, {
      x: 750,
      y: 117,
      intent: "Кнопка 3: Перейти в журнал урока (7 Б РУС)",
    });
    expect(mockBrowserClick).toHaveBeenNthCalledWith(2, {
      x: 59,
      y: 973,
      intent: "Провести урок",
    });

    // 4. Проверяем итоговое событие завершения
    const endEvent = events.find((e) => e.type === "END");
    expect(endEvent?.message).toContain("Кнопка 3 «Перейти в журнал урока»");
    expect(endEvent?.message).toContain("Провести урок");

    // 5. Финал задачи возвращает управление рабочей областью учителю:
    // иначе в панели остаётся «AI РАБОТАЕТ» и «Забрать управление себе»
    // после того, как агент уже всё сделал.
    const { releaseControlToUser } = await import("@/lib/agents/session");
    expect(releaseControlToUser).toHaveBeenCalledWith(userId);
  });
});
