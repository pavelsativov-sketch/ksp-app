import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/providers", () => ({
  isAnyProviderConfigured: vi.fn(() => true),
  getResponseFormat: vi.fn(),
  executeWithFallback: vi.fn(),
}));

import { executeWithFallback } from "@/lib/ai/providers";
import { regenerateWorksheetTask } from "@/lib/handouts/generate";

const execMock = vi.mocked(executeWithFallback);

function singleTaskDoc(task: Record<string, unknown>) {
  return JSON.stringify({
    title: "Лист",
    intro: "Интро",
    metaLine: "ФИО: ____",
    tasks: [
      {
        type: "match",
        prompt: "Соедини",
        criterion: "К",
        descriptor: "Д",
        points: 5,
        options: null,
        pairs: null,
        correctIndex: null,
        expectedAnswer: null,
        wordBank: null,
        tableHeaders: null,
        tableRows: null,
        situation: null,
        errorsCount: null,
        choices: null,
        correctChoice: null,
        reflectionOptions: null,
        teacherNote: null,
        stage: "middle",
        link: null,
        imagePromptEn: null,
        groups: ["Группа А", "Группа Б"],
        items: ["Термин 1", "Термин 2", "Термин 3", "Термин 4", "Термин 5", "Термин 6", "Термин 7", "Термин 8"],
        correctFlags: null,
        ...task,
      },
    ],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

function mockProvider(content: string) {
  execMock.mockImplementation(async (_task, exec) => {
    const client = {
      chat: { completions: { create: async () => ({ choices: [{ message: { content } }] }) } },
    };
    return exec(client as never, "mock-model", { apiKey: "k", baseURL: "b", model: "m", supportsJsonSchema: true, label: "mock" });
  });
}

describe("regenerateWorksheetTask", () => {
  it("keeps type/stage/points and fills keys", async () => {
    mockProvider(singleTaskDoc({
      type: "sort",
      groups: ["Группа А", "Группа Б"],
      items: ["Термин 1", "Термин 2", "Термин 3", "Термин 4", "Термин 5", "Термин 6", "Термин 7", "Термин 8"],
      expectedAnswer: "А: 1,2; Б: остальное",
    }));
    const task = await regenerateWorksheetTask({
      topic: "Дроби",
      subject: "Математика",
      grade: 5,
      language: "ru",
      type: "sort",
      stage: "start",
      points: 2,
      avoidPrompts: ["Старое задание"],
    });
    expect(task.type).toBe("sort");
    expect(task.stage).toBe("start");
    expect(task.points).toBe(2);
    expect(task.groups).toHaveLength(2);
    expect(task.expectedAnswer).toContain("А:");
  });

  it("rejects provider garbage via validation", async () => {
    mockProvider("не JSON вообще");
    await expect(
      regenerateWorksheetTask({
        topic: "Дроби", subject: "Математика", grade: 5, language: "ru",
        type: "open", stage: "middle", points: 1,
      }),
    ).rejects.toThrow();
  });
});
