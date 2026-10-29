import { describe, expect, it } from "vitest";
import { extractDeliverables, kspToMarkdown, ktpToMarkdown, planLinks, slugForFile } from "@/lib/agents/deliverables";

const toolResult = (tool: string, result: unknown) => ({ type: "TOOL_RESULT", data: { tool, result: JSON.stringify(result) } });

describe("результаты работы агента", () => {
  it("ссылки на материалы плана", () => {
    expect(planLinks("abc")).toEqual({ url: "/plans/abc", docxUrl: "/api/export/docx/abc", pptxUrl: "/api/export/pptx/abc" });
  });

  it("имя файла сохраняет кириллицу и убирает опасные символы", () => {
    expect(slugForFile("Дроби: сравнение / сложение!")).toBe("дроби-сравнение-сложение");
    expect(slugForFile("../../etc/passwd")).toBe("etc-passwd");
    expect(slugForFile("!!!", "plan")).toBe("plan");
    expect(slugForFile("а".repeat(200)).length).toBeLessThanOrEqual(48);
  });

  it("достаёт созданные КСП и КТП из журнала", () => {
    const found = extractDeliverables([
      { type: "THINK", data: null },
      toolResult("createKsp", { success: true, title: "Математика: Дроби", url: "/plans/1", docxUrl: "/api/export/docx/1", pptxUrl: "/api/export/pptx/1", file: "ksp-дроби.md" }),
      toolResult("createKtp", { success: true, title: "КТП: Дроби", url: "/plans/1" }),
    ]);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ kind: "ksp", title: "Математика: Дроби", docxUrl: "/api/export/docx/1", workspaceFile: "ksp-дроби.md" });
    expect(found[1]).toMatchObject({ kind: "ktp", url: "/plans/1" });
  });

  it("пропускает неудачи, чужие инструменты и повторы", () => {
    expect(extractDeliverables([
      toolResult("createKsp", { success: false, error: "нет квоты" }),
      toolResult("runCommand", { success: true, url: "/plans/9" }),
      toolResult("createKsp", { success: true, url: "/plans/2" }),
      toolResult("createKsp", { success: true, url: "/plans/2" }),
    ])).toHaveLength(1);
  });

  it("не принимает внешние ссылки: только пути приложения", () => {
    const found = extractDeliverables([
      toolResult("createKsp", { success: true, url: "https://evil.example/plans/1" }),
      toolResult("createKsp", { success: true, url: "/plans/3", docxUrl: "https://evil.example/x.docx" }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.docxUrl).toBeUndefined();
  });

  it("устойчив к битому JSON результата", () => {
    expect(extractDeliverables([{ type: "TOOL_RESULT", data: { tool: "createKsp", result: "{не json" } }])).toEqual([]);
  });

  it("Markdown-копия КСП и таблица КТП читаются целиком", () => {
    const md = kspToMarkdown({
      title: "Математика: Дроби", grade: 5, language: "ru",
      content: { topic: "Дроби", lessonObjectives: ["Цель 1"], stages: { beginning: { time: "5 мин", teacherActions: "A" }, middle: undefined, end: undefined } },
    });
    expect(md).toContain("# Математика: Дроби");
    expect(md).toContain("- Цель 1");
    expect(md).toContain("**Учитель:** A");

    const ktp = ktpToMarkdown({ title: "Т", subject: "Математика", grade: 5, rows: [{ number: 1, topic: "Дроби | сложение", hours: 2, date: "2026-09-01", objectives: "" }] });
    expect(ktp).toContain("| 1 | Дроби \\| сложение | 2 | 2026-09-01 | — |");
  });
});

import { currentActivity, extractTaskFiles, finalSummary } from "@/lib/agents/deliverables";

describe("единый экран задачи: файлы, текущий шаг, итог", () => {
  it("собирает файлы из writeFile и копий КСП/КТП без повторов", () => {
    const files = extractTaskFiles([
      { type: "TOOL_CALL", data: { tool: "writeFile", args: { filename: "otchet.md" } } },
      { type: "TOOL_CALL", data: { tool: "writeFile", args: { filename: "otchet.md" } } },
      { type: "TOOL_CALL", data: { tool: "runCommand", args: { filename: "ignored.txt" } } },
      toolResult("createKsp", { success: true, url: "/plans/1", file: "ksp-дроби.md" }),
      toolResult("createKtp", { success: false, file: "ktp-ошибка.md" }),
    ]);
    expect(files).toEqual(["otchet.md", "ksp-дроби.md"]);
  });

  it("текущий шаг — последнее действие инструмента или мысль, в одну строку", () => {
    expect(currentActivity([])).toBe("");
    expect(currentActivity([
      { type: "TOOL_CALL", message: "Создаю файл a.md" },
      { type: "THINK", message: "Шаг 2: обдумываю" },
    ])).toBe("Создаю файл a.md");
    expect(currentActivity([{ type: "REASONING", message: "Нужно\n  открыть   сайт" }])).toBe("Нужно открыть сайт");
    expect(currentActivity([{ type: "TOOL_CALL", message: "x".repeat(500) }]).length).toBeLessThanOrEqual(140);
  });

  it("итог — последнее END, но не ручная остановка", () => {
    expect(finalSummary([{ type: "END", message: "Создан КСП по дробям." }])).toBe("Создан КСП по дробям.");
    expect(finalSummary([{ type: "END", message: "Остановлено пользователем" }])).toBe("");
    expect(finalSummary([{ type: "THINK", message: "x" }])).toBe("");
    expect(finalSummary([{ type: "END", message: "Первый" }, { type: "END", message: "Второй" }])).toBe("Второй");
  });
});
