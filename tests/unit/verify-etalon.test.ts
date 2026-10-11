import { it, expect, beforeEach, afterEach } from "vitest";
import { generateHandout } from "@/lib/handouts/generate";
import { buildHandoutDocx } from "@/lib/handouts/docx";
import { worksheetAnswerLines } from "@/lib/handouts/answers";
import JSZip from "jszip";

const AI_ENV_KEYS = ["OPENAI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "CEREBRAS_API_KEY", "OPENROUTER_API_KEY"] as const;
const ORIG = Object.fromEntries(AI_ENV_KEYS.map((k) => [k, process.env[k]]));
beforeEach(() => { for (const k of AI_ENV_KEYS) delete process.env[k]; });
afterEach(() => {
  for (const k of AI_ENV_KEYS) {
    const v = ORIG[k];
    if (v) process.env[k] = v;
    else delete process.env[k];
  }
});

it("verify etalon-level stub worksheet", async () => {
  const h = await generateHandout({
    kind: "worksheet", topic: "Дроби и их виды", subject: "Математика",
    grade: 5, language: "ru", count: 7,
  });
  expect(h.kind).toBe("worksheet");
  if (h.kind !== "worksheet") return;
  expect(h.degraded).toBe(true);
  expect(h.tasks.length).toBeGreaterThan(0);
  expect(h.tasks.every((task) => task.prompt.trim().length > 0)).toBe(true);
  expect(h.tasks.reduce((sum, task) => sum + task.points, 0)).toBe(10);
  expect(worksheetAnswerLines(h.tasks).length).toBeGreaterThan(0);

  const zip = await JSZip.loadAsync(await buildHandoutDocx(h));
  const xml = await zip.file("word/document.xml")?.async("string") ?? "";
  expect(xml).toContain("Задание 1");
  expect(xml).toContain("Ответы для учителя");
  expect(xml).toContain("Дескрипторы и баллы");
});
