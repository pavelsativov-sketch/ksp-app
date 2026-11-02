import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyKsp, type LessonPlanRow } from "@/lib/types/ksp";

const mock = vi.hoisted(() => ({ reply: "" }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/providers", () => ({
  isAnyProviderConfigured: () => true,
  executeWithFallback: async (_task: string, fn: (...a: unknown[]) => unknown) =>
    fn({ chat: { completions: { create: async () => ({ choices: [{ finish_reason: "stop", message: { content: mock.reply } }] }) } } }, "m", {}, undefined),
}));

import { generateChoiceTasks, generateTeacherSpeech } from "@/lib/materials/generate";
import { buildSpeechDocx } from "@/lib/materials/speech-docx";

const plan = { id: "a".repeat(24), owner_id: "u", title: "Дроби", grade: 5, language: "ru", content: { ...emptyKsp(), topic: "Дроби" } } as unknown as LessonPlanRow;
const step = (i: number) => ({ question: `Вопрос ${i}`, options: ["а", "б", "в"], correctIndex: i % 3, hint: "подсказка" });

beforeEach(() => { mock.reply = ""; });

describe("generateChoiceTasks", () => {
  it("делает заданное число вопросов с выбором", async () => {
    mock.reply = JSON.stringify({ steps: Array.from({ length: 8 }, (_, i) => step(i)) });
    const tasks = await generateChoiceTasks(plan, 7);
    expect(tasks).toHaveLength(7);
    expect(tasks[0]).toMatchObject({ type: "MCQ", options: ["а", "б", "в"], aiGenerated: true, aiReviewed: false });
  });

  it("отбрасывает вопросы с несуществующим верным вариантом и не берёт меньше пяти", async () => {
    mock.reply = JSON.stringify({ steps: [...Array.from({ length: 4 }, (_, i) => step(i)), { ...step(1), correctIndex: 9 }] });
    await expect(generateChoiceTasks(plan, 5)).rejects.toThrow("слишком мало");
  });

  it("число вопросов ограничено 5–10", async () => {
    mock.reply = JSON.stringify({ steps: Array.from({ length: 12 }, (_, i) => step(i)) });
    expect(await generateChoiceTasks(plan, 50)).toHaveLength(10);
    expect(await generateChoiceTasks(plan, 1)).toHaveLength(5);
  });
});

describe("generateTeacherSpeech", () => {
  it("принимает речь по этапам и собирает Word", async () => {
    mock.reply = JSON.stringify({ stages: [{ stage: "beginning", time: "0–5 мин", lines: [{ say: "Здравствуйте, ребята!", action: "встречает класс" }] }] });
    const speech = await generateTeacherSpeech(plan);
    expect(speech.stages[0]!.lines[0]!.say).toContain("Здравствуйте");
    const docx = await buildSpeechDocx("Дроби", "Дроби", speech);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  });

  it("не принимает пустую речь", async () => {
    mock.reply = JSON.stringify({ stages: [{ stage: "beginning", lines: [] }] });
    await expect(generateTeacherSpeech(plan)).rejects.toThrow("некорректный материал");
  });
});
