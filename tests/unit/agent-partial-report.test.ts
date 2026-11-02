import { describe, expect, it } from "vitest";
import { buildPartialReport } from "@/lib/agents/partial-report";
import { partialSummary } from "@/lib/agents/deliverables";

const call = (name: string) => ({ role: "assistant", tool_calls: [{ function: { name } }] });
const tool = (data: object) => ({ role: "tool", content: JSON.stringify(data) });

describe("buildPartialReport", () => {
  it("называет причину, число шагов, последнюю страницу и что было на экране", () => {
    const report = buildPartialReport(
      [
        call("browserNavigate"),
        tool({ success: true, url: "https://www.bilimclass.kz/2026/control/journal/groups", title: "Журнал", content: "1 А 1 Б 2 А" }),
        call("browserClick"),
        tool({ success: false, error: "элемент не найден" }),
      ],
      "достигнут лимит шагов",
    );
    expect(report).toContain("не полностью: достигнут лимит шагов");
    expect(report).toContain("Сделано шагов: 2, из них действий в браузере: 2");
    expect(report).toContain("Журнал, https://www.bilimclass.kz/2026/control/journal/groups");
    expect(report).toContain("1 А 1 Б 2 А");
    expect(report).toContain("Последняя ошибка: элемент не найден");
    expect(report).toContain("Что дальше");
  });

  it("не падает на пустом транскрипте и мусорных результатах", () => {
    const report = buildPartialReport([{ role: "tool", content: "не json" }, { role: "tool" }], "сбой");
    expect(report).toContain("Сделано шагов: 0");
  });

  it("длинный экран обрезается", () => {
    const report = buildPartialReport([tool({ success: true, url: "https://x.kz", content: "а".repeat(5000) })], "время");
    expect(report.length).toBeLessThan(1200);
  });
});

describe("partialSummary", () => {
  it("берёт последний PARTIAL и пропускает остальное", () => {
    expect(partialSummary([{ type: "PARTIAL", message: "старый" }, { type: "ERROR", message: "x" }, { type: "PARTIAL", message: "новый" }])).toBe("новый");
    expect(partialSummary([{ type: "ERROR", message: "x" }])).toBe("");
  });
});
