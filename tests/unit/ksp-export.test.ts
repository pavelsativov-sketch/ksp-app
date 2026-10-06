import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildKspDocx, buildTeacherScriptDocx } from "@/lib/export/docx";
import JSZip from "jszip";
import { buildKspPptx } from "@/lib/export/pptx";
import { generateKsp, mergeAiIntoKsp } from "@/lib/ai/generate";
import { emptyKsp, type LessonPlanRow } from "@/lib/types/ksp";

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const AI_ENV_KEYS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "OPENROUTER_API_KEY",
] as const;
const ORIG_AI_ENV = Object.fromEntries(
  AI_ENV_KEYS.map((key) => [key, process.env[key]]),
);
beforeEach(() => {
  for (const key of AI_ENV_KEYS) delete process.env[key];
});
afterEach(() => {
  for (const key of AI_ENV_KEYS) {
    const value = ORIG_AI_ENV[key];
    if (value) process.env[key] = value;
    else delete process.env[key];
  }
});

function makePlan(): LessonPlanRow {
  const ksp = emptyKsp();
  ksp.topic = "Сложение многозначных чисел";
  ksp.schoolProfile = "emn";
  ksp.header = {
    longTermPlanSection: "Раздел 5.1",
    school: "ОШ №1",
    date: "2025-09-01",
    teacherName: "Иванова И.И.",
    grade: "5А",
    studentsPresent: 22,
    studentsAbsent: 1,
  };
  ksp.learningObjectives = [{ code: "5.1.2.1", text: "Складывать натуральные числа" }];
  ksp.lessonObjectives = ["Цель 1", "Цель 2"];
  ksp.assessmentCriteria = ["Критерий 1"];
  ksp.languageObjectives = { terms: ["слагаемое", "сумма"], phrases: ["Я считаю, что…"] };
  ksp.values = "Уважение";
  ksp.crossCurricularLinks = "Связь с языком";
  ksp.priorKnowledge = "Базовая арифметика";
  ksp.stages.beginning = {
    time: "0-5",
    teacherActions: "Приветствие",
    studentActions: "Слушают",
    resources: "Доска",
    keyQuestions: ["Что вы помните?"],
    descriptors: ["Отвечает"],
    assessmentMethod: "Похвала",
    tasks: [
      {
        id: "t1",
        type: "MCQ",
        question: "2+2?",
        points: 1,
        options: ["3", "4", "5", "6"],
        correctIndex: 1,
      },
    ],
  };
  ksp.stages.middle = { ...ksp.stages.beginning, time: "5-35", tasks: [] };
  ksp.stages.end = {
    ...ksp.stages.beginning,
    time: "35-45",
    tasks: [],
    homework: "Прочитать параграф",
    summary: "Итог",
    reflectionQuestions: ["Что узнали?"],
  };
  ksp.evaluation = {
    formativeAssessment: "Светофор",
    differentiation: "Дифф",
    healthAndSafety: "ТБ",
    reflection: "Рефлексия",
  };
  return {
    id: "00000000-0000-0000-0000-000000000001",
    owner_id: "u",
    title: "Тест",
    subject_id: null,
    grade: 5,
    quarter: 1,
    section: null,
    content: ksp,
    visibility: "private",
    language: "ru",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("buildKspDocx", () => {
  it("builds a valid docx zip", async () => {
    const buf = await buildKspDocx(makePlan());
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
  });

  it("includes the school profile in the KSP document", async () => {
    const zip = await JSZip.loadAsync(await buildKspDocx(makePlan()));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Профиль школы");
    expect(documentXml).toContain("ЕМН");
  });

  it("adds the free-plan watermark footer only when requested", async () => {
    const marked = await JSZip.loadAsync(await buildKspDocx(makePlan(), { watermark: true }));
    const footer = marked.file(/^word\/footer\d*\.xml$/)[0];
    expect(footer).toBeDefined();
    const footerXml = await footer.async("string");
    expect(footerXml).toContain("бесплатный тариф");

    const clean = await JSZip.loadAsync(await buildKspDocx(makePlan(), { watermark: false }));
    expect(clean.file(/^word\/footer\d*\.xml$/)).toHaveLength(0);
  });
});

describe("buildTeacherScriptDocx", () => {
  it("creates a separate Word document from teacher actions", async () => {
    const plan = makePlan();
    plan.content.stages.beginning.teacherActions = "Слова педагога: «Здравствуйте, ребята.»\nПредполагаемые ответы учащихся: «Здравствуйте.»";
    const zip = await JSZip.loadAsync(await buildTeacherScriptDocx(plan));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Слова педагога");
    expect(documentXml).toContain("Здравствуйте, ребята");
  });
});

describe("buildKspPptx", () => {
  it("builds a valid pptx zip with content", async () => {
    const buf = await buildKspPptx(makePlan());
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
  });

  it("stage slides are student-facing: no teacher script, with key questions", async () => {
    const plan = makePlan();
    plan.content.stages.middle.teacherActions = "Слова педагога: «Откройте учебник.»";
    plan.content.stages.middle.keyQuestions = ["Что такое дробь?"];
    const zip = await JSZip.loadAsync(await buildKspPptx(plan));
    const slides = await Promise.all(
      zip.file(/^ppt\/slides\/slide\d+\.xml$/).map((f) => f.async("string")),
    );
    const all = slides.join("\n");
    expect(all).not.toContain("Слова педагога");
    expect(all).toContain("Что такое дробь?");
    expect(all).toContain("Вопросы классу");
  });
});

describe("generateKsp (stub)", () => {
  it("returns a populated KSP body", async () => {
    const out = await generateKsp({
      grade: 5,
      subject: "Математика",
      topic: "Дроби",
      learningObjectives: ["5.1.2.1 — Тест"],
      language: "ru",
    });
    expect(out.topic).toBe("Дроби");
    expect(out.lessonObjectives.length).toBeGreaterThan(0);
    expect(out.stages.beginning.teacherActions.length).toBeGreaterThan(0);
    expect(out.stages.end.homework).toBeDefined();
    expect(out.evaluation.differentiation.length).toBeGreaterThan(0);
  });

  it("mergeAiIntoKsp overlays AI body without touching header/learningObjectives", async () => {
    const before = emptyKsp();
    before.header.school = "Школа №1";
    before.learningObjectives = [{ code: "5.1.1.1", text: "X" }];
    const ai = await generateKsp({
      grade: 5,
      subject: "Математика",
      topic: "Y",
      learningObjectives: [],
      language: "ru",
    });
    const merged = mergeAiIntoKsp(before, ai);
    expect(merged.header.school).toBe("Школа №1");
    expect(merged.learningObjectives).toEqual(before.learningObjectives);
    expect(merged.topic).toBe("Y");
    expect(merged.evaluation.formativeAssessment).toBe(ai.evaluation.formativeAssessment);
  });

  it("mergeAiIntoKsp keeps user text when AI returns empty strings", () => {
    const before = emptyKsp();
    before.values = "Мои ценности";
    before.stages.middle.teacherActions = "Мой сценарий";
    const ai = {
      topic: "",
      lessonObjectives: [],
      assessmentCriteria: [],
      languageObjectives: { terms: [], phrases: [] },
      values: "",
      crossCurricularLinks: "",
      priorKnowledge: "",
      stages: {
        beginning: { time: "", teacherActions: "", studentActions: "", resources: "", keyQuestions: [], descriptors: [], assessmentMethod: "", tasks: [] },
        middle: { time: "", teacherActions: "", studentActions: "", resources: "", keyQuestions: [], descriptors: [], assessmentMethod: "", tasks: [] },
        end: { time: "", teacherActions: "", studentActions: "", resources: "", keyQuestions: [], descriptors: [], assessmentMethod: "", tasks: [], homework: "", summary: "", reflectionQuestions: [] },
      },
      evaluation: { formativeAssessment: "", differentiation: "", healthAndSafety: "", reflection: "" },
    };
    const merged = mergeAiIntoKsp(before, ai);
    expect(merged.values).toBe("Мои ценности");
    expect(merged.stages.middle.teacherActions).toBe("Мой сценарий");
  });
});
