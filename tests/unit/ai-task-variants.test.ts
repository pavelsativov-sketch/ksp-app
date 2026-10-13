import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/providers", () => ({
  isAnyProviderConfigured: vi.fn(() => true),
  getResponseFormat: vi.fn(() => ({ type: "json_object" })),
  executeWithFallback: vi.fn(),
}));
vi.mock("@/lib/ai/generate", () => ({ isOpenAIConfigured: vi.fn(() => true) }));

import { executeWithFallback } from "@/lib/ai/providers";
import { generateTasks } from "@/lib/ai/tasks";

const executeMock = vi.mocked(executeWithFallback);

function mockGeneration(rawTasks: unknown[]) {
  let userPrompt = "";
  const create = vi.fn(async (request: { messages: Array<{ role: string; content: string }> }) => {
    userPrompt = request.messages.find((message) => message.role === "user")?.content ?? "";
    return { choices: [{ message: { content: JSON.stringify({ tasks: rawTasks }) } }] };
  });
  const client = { chat: { completions: { create } } };
  executeMock.mockImplementation(async (_task, run) => run(
    client as never,
    "test-model",
    { apiKey: "test", baseURL: "https://example.invalid", model: "test-model", supportsJsonSchema: true, label: "test" },
  ));
  return { create, readPrompt: () => userPrompt };
}

beforeEach(() => vi.clearAllMocks());

describe("AI interactive-task variants", () => {
  it("requests same-type alternatives in the requested style without sending ids or review metadata", async () => {
    const response = mockGeneration([
      { type: "MCQ", question: "Вариант A", hint: "Подумай", points: 2, payload: { options: ["A", "B"], correctIndex: 0 } },
      { type: "MCQ", question: "Вариант B", hint: "Сравни", points: 3, payload: { options: ["C", "D"], correctIndex: 1 } },
    ]);
    const tasks = await generateTasks({
      topic: "Дроби",
      grade: 5,
      subject: "Математика",
      stage: "middle",
      language: "ru",
      count: 3,
      variationStyle: "simpler",
      baseTask: {
        id: "teacher-task-id",
        type: "MCQ",
        question: "Исходный вопрос",
        points: 4,
        options: ["1/2", "1/3"],
        correctIndex: 0,
        objectiveCode: "5.1.2.1",
        criterionTexts: ["Сравнивает дроби"],
        aiGenerated: true,
        aiReviewed: true,
      },
    });

    expect(tasks).toHaveLength(2);
    expect(tasks.every((task) => task.type === "MCQ")).toBe(true);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(2);
    expect(response.readPrompt()).toContain("сделай задание проще");
    expect(response.readPrompt()).toContain("сохрани тип «MCQ»");
    expect(response.readPrompt()).toContain("Исходный вопрос");
    expect(response.readPrompt()).not.toContain("teacher-task-id");
    expect(response.readPrompt()).not.toContain("aiReviewed");
    expect(response.create).toHaveBeenCalledOnce();
  });

  it("materializes matching-pair indices instead of returning an empty scaffold", async () => {
    mockGeneration([
      {
        type: "MATCHING", question: "Соотнеси понятия", points: 2,
        payload: {
          left: ["числитель", "знаменатель"],
          right: ["верхняя часть дроби", "нижняя часть дроби"],
          pairs: [{ leftIndex: 0, rightIndex: 0 }, { leftIndex: 1, rightIndex: 1 }],
        },
      },
      {
        type: "MATCHING", question: "Соотнеси определения", points: 2,
        payload: {
          left: ["половина", "треть"],
          right: ["одна из двух равных частей", "одна из трёх равных частей"],
          pairs: [{ leftIndex: 0, rightIndex: 0 }, { leftIndex: 1, rightIndex: 1 }],
        },
      },
    ]);
    const tasks = await generateTasks({ topic: "Дроби", grade: 5, subject: "Математика", stage: "middle", language: "ru", count: 2 });
    expect(tasks[0]).toMatchObject({
      type: "MATCHING",
      left: ["числитель", "знаменатель"],
      right: ["верхняя часть дроби", "нижняя часть дроби"],
      pairs: [{ leftIndex: 0, rightIndex: 0 }, { leftIndex: 1, rightIndex: 1 }],
    });
  });
});
