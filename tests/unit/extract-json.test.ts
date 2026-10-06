import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/ai/extract-json";

/**
 * Раньше на голом JSON.parse каскад падал с «Unexpected end of JSON input»,
 * когда ответ обрывался по finish_reason=length, и с ошибкой на ```json
 * обёртке. Именно это приводило к 500 на генерации рабочего листа.
 */
describe("extractJson", () => {
  it("разбирает чистый JSON", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("снимает markdown-обёртку ```json", () => {
    const raw = '```json\n{"tasks":[{"id":"t1"}]}\n```';
    expect(extractJson<{ tasks: unknown[] }>(raw)).toEqual({ tasks: [{ id: "t1" }] });
  });

  it("снимает обёртку без указания языка", () => {
    expect(extractJson('```\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("обрезает болтовню до первой скобки", () => {
    expect(extractJson('Вот ваш JSON: {"x":[1,2]}')).toEqual({ x: [1, 2] });
  });

  it("достраивает незакрытый объект при обрыве ответа", () => {
    const truncated = '{"tasks":[{"type":"MCQ","question":"2+2?","options":["3","4"],"correctIndex":1}';
    expect(extractJson<{ tasks: Array<{ correctIndex: number }> }>(truncated)).toEqual({
      tasks: [{ type: "MCQ", question: "2+2?", options: ["3", "4"], correctIndex: 1 }],
    });
  });

  it("достраивает несколько вложенных контейнеров", () => {
    expect(extractJson<{ a: { b: { c: number } } }>('{"a":{"b":{"c":7}')).toEqual({ a: { b: { c: 7 } } });
  });

  it("закрывает оборванную строку", () => {
    expect(extractJson<{ title: string }>('{"title":"Рабочий лист по дро')).toEqual({
      title: "Рабочий лист по дро",
    });
  });

  it("не падает на пустом ответе и объясняет причину", () => {
    expect(() => extractJson("")).toThrow(/пустой/i);
    expect(() => extractJson("   ")).toThrow(/пустой/i);
  });

  it("в сообщении об ошибке показывает начало ответа", () => {
    expect(() => extractJson("совершенно не JSON")).toThrow(/не удалось разобрать|начало/i);
  });

  it("понимает массив на верхнем уровне", () => {
    expect(extractJson<number[]>("[1, 2, 3]")).toEqual([1, 2, 3]);
  });
});