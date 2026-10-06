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
  console.log("TITLE:", h.title);
  console.log("TASKS:", h.tasks.map((t, i) => `${i + 1}. [${t.type}/${t.stage}/${t.points}] ${t.prompt.slice(0, 70)}`).join(" | "));
  console.log("SUM:", h.tasks.reduce((s, t) => s + t.points, 0));
  console.log("ANSWERS:", worksheetAnswerLines(h.tasks));
  // Эталонная структура: sort первым, checklist, case/match, interactive, creative
  const types = h.tasks.map((t) => t.type);
  expect(types[0]).toBe("sort");
  expect(types).toContain("checklist");
  expect(types).toContain("match");
  expect(types).toContain("interactive");
  expect(types).toContain("creative");
  expect(h.tasks[h.tasks.length - 1]?.type).toBe("reflection");

  const zip = await JSZip.loadAsync(await buildHandoutDocx(h));
  const xml = await zip.file("word/document.xml")?.async("string") ?? "";
  for (const c of [
    "Распредели по группам", "Отметь верные утверждения", "Разбери кейс",
    "Слова для распределения", "QR-код", "вставит учитель",
    "Критерий оценивания:", "Дескриптор:",
    "Ответы для учителя", "Дескрипторы и баллы", "Итого",
  ]) {
    console.log(c, "=>", xml.includes(c) ? "OK" : "MISS");
    expect(xml).toContain(c);
  }
  // Баннеров этапов быть не должно — чистый лист для печати.
  for (const c of ["НАЧАЛО УРОКА", "ОСНОВНАЯ ЧАСТЬ", "КОНЕЦ УРОКА"]) {
    expect(xml).not.toContain(c);
  }
});
