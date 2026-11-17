import { describe, expect, it } from "vitest";
import { extractJson, fixCommonDefects } from "@/lib/ai/extract-json";

describe("починка частых дефектов JSON от моделей", () => {
  it("читает ответ с сырым переводом строки внутри строки и висячими запятыми", () => {
    const raw = '{"title": "Строение клетки",\n "tasks": [{"prompt": "Подпиши части клетки:\nядро, вакуоль", "points": 2,},],}';
    expect(extractJson<{ tasks: Array<{ prompt: string }> }>(raw).tasks[0]!.prompt).toBe("Подпиши части клетки:\nядро, вакуоль");
  });

  it("не трогает запятые и скобки внутри текста задания", () => {
    const raw = '{"prompt": "Найди лишнее: ядро, ], вакуоль, }", "points": 1}';
    expect(fixCommonDefects(raw)).toBe(raw);
  });

  it("сохраняет экранированные кавычки и табуляцию превращает в \\t", () => {
    expect(fixCommonDefects('{"a": "он сказал \\"да\\"\tи ушёл"}')).toBe('{"a": "он сказал \\"да\\"\\tи ушёл"}');
  });
});
