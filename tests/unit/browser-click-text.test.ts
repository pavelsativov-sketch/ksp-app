// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { findByTextScript } from "@/lib/agents/tools/browser";

const rects: Record<string, [number, number, number, number]> = {
  header: [0, 0, 1280, 60],
  lang: [1100, 20, 80, 20],
  hidden: [0, 0, 0, 0],
};

function run(text: string) {
  return new Function(`return (${findByTextScript(text)})()`)() as { x: number; y: number } | null;
}

afterEach(() => vi.restoreAllMocks());

describe("findByTextScript", () => {
  it("picks the smallest visible element with that label and returns its centre", () => {
    document.body.innerHTML = '<div data-r="header"><span data-r="hidden">Русский</span><div data-r="lang">Қазақша</div></div>';
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const [left, top, width, height] = rects[(this as HTMLElement).dataset.r ?? "header"]!;
      return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON() {} } as DOMRect;
    });
    Element.prototype.scrollIntoView = vi.fn();
    expect(run("қазақша")).toEqual({ x: 1140, y: 30, text: "қазақша" });
    expect(new Function(`return (${findByTextScript(["Skip", "Қазақша"])})()`)()).toMatchObject({ text: "қазақша" });
    expect(run("Русский")).toBeNull();
    // Латинская s в подписи: без второго слэша в шаблонной строке пробельный класс превращался в букву s.
    document.body.innerHTML = '<div data-r="header"><div data-r="lang">English  class</div></div>';
    expect(run("english class")).toMatchObject({ x: 1140, y: 30 });
  });
});
