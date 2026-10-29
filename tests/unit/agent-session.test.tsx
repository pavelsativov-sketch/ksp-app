// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentSession } from "@/components/agents/agent-session";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  emit(payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("clears the previous task log when the panel switches task IDs", () => {
  const view = render(<AgentSession taskId="first" variant="chat" />);
  act(() => FakeEventSource.instances[0]!.emit({ type: "ERROR", message: "Старая ошибка" }));
  expect(screen.getByText(/Старая ошибка/)).toBeTruthy();

  view.rerender(<AgentSession taskId="second" variant="chat" />);

  expect(FakeEventSource.instances[0]!.close).toHaveBeenCalled();
  expect(screen.queryByText(/Старая ошибка/)).toBeNull();
});

it("shows a completed task at 100 percent", () => {
  render(<AgentSession taskId="completed" variant="chat" />);
  act(() => {
    FakeEventSource.instances[0]!.emit({ type: "META", plan: ["step one", "step two", "step three"] });
    FakeEventSource.instances[0]!.emit({ type: "STATUS_UPDATE", status: "completed" });
  });

  expect(screen.getByText("100%")).toBeTruthy();
  expect(screen.getByText("Задача выполнена")).toBeTruthy();
});

it("does not label a failed task as completed", () => {
  render(<AgentSession taskId="failed" variant="chat" />);
  act(() => {
    FakeEventSource.instances[0]!.emit({ type: "META", plan: ["step one", "step two"] });
    FakeEventSource.instances[0]!.emit({ type: "STATUS_UPDATE", status: "failed" });
  });

  expect(screen.getByText("Задача не выполнена")).toBeTruthy();
  expect(screen.queryByText("Задача выполнена")).toBeNull();
  expect(screen.getByText("0%")).toBeTruthy();
});

it("показывает карточку результата со ссылками на созданный КСП", () => {
  render(<AgentSession taskId="ksp" variant="chat" />);
  act(() => {
    FakeEventSource.instances[0]!.emit({
      type: "TOOL_RESULT",
      message: "готово",
      data: {
        tool: "createKsp",
        result: JSON.stringify({ success: true, title: "Математика: Дроби", url: "/plans/p1", docxUrl: "/api/export/docx/p1", pptxUrl: "/api/export/pptx/p1", file: "ksp-дроби.md" }),
      },
    });
  });

  expect(screen.getByRole("region", { name: "Результат работы агента" })).toBeTruthy();
  expect(screen.getByText("Готов КСП")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Открыть/ }).getAttribute("href")).toBe("/plans/p1");
  expect(screen.getByRole("link", { name: /Word/ }).getAttribute("href")).toBe("/api/export/docx/p1");
  expect(screen.getByRole("link", { name: /PowerPoint/ }).getAttribute("href")).toBe("/api/export/pptx/p1");
  // Имя файла видно и в карточке результата, и в списке «Файлы задачи».
  expect(screen.getAllByText(/ksp-дроби\.md/).length).toBeGreaterThanOrEqual(2);
});

it("без созданных материалов карточки результата нет", () => {
  render(<AgentSession taskId="none" variant="chat" />);
  act(() => FakeEventSource.instances[0]!.emit({ type: "TOOL_RESULT", message: "x", data: { tool: "listFiles", result: "{}" } }));
  expect(screen.queryByRole("region", { name: "Результат работы агента" })).toBeNull();
});

it("единый экран: показывает текущий шаг, файлы задачи и итог", () => {
  render(<AgentSession taskId="screen" variant="chat" />);
  act(() => {
    const es = FakeEventSource.instances[0]!;
    es.emit({ type: "TOOL_CALL", message: "Создаю файл otchet.md", data: { tool: "writeFile", args: { filename: "otchet.md" } } });
  });
  expect(screen.getByRole("status").textContent).toContain("Создаю файл otchet.md");
  expect(screen.getByRole("region", { name: "Файлы задачи" }).textContent).toContain("otchet.md");

  act(() => {
    const es = FakeEventSource.instances[0]!;
    es.emit({ type: "END", message: "Отчёт составлен и сохранён." });
  });
  // Задача завершена: «Сейчас» исчезает, появляется итог.
  expect(screen.queryByText(/Сейчас:/)).toBeNull();
  expect(screen.getByRole("region", { name: "Итог задачи" }).textContent).toContain("Отчёт составлен и сохранён.");
});

it("ошибки инструментов не засчитываются шагами: остановленная задача не показывает 100%", () => {
  render(<AgentSession taskId="errors" variant="chat" />);
  act(() => {
    const es = FakeEventSource.instances[0]!;
    es.emit({ type: "META", plan: ["один", "два", "три"] });
    for (let i = 0; i < 4; i += 1) {
      es.emit({ type: "TOOL_RESULT", message: "x", data: { tool: "browserNavigate", result: JSON.stringify({ success: false, error: "Session expired or not found" }) } });
    }
    es.emit({ type: "STATUS_UPDATE", status: "stopped" });
  });
  expect(screen.getAllByText("Задача остановлена").length).toBeGreaterThan(0);
  expect(screen.getByText("0%")).toBeTruthy();
  expect(screen.queryByText("100%")).toBeNull();
});

it("удачные результаты двигают прогресс, но до завершения он не достигает 100%", () => {
  render(<AgentSession taskId="progress" variant="chat" />);
  act(() => {
    const es = FakeEventSource.instances[0]!;
    es.emit({ type: "META", plan: ["один", "два"] });
    es.emit({ type: "TOOL_RESULT", message: "x", data: { tool: "listFiles", result: JSON.stringify({ success: true }) } });
    es.emit({ type: "TOOL_RESULT", message: "x", data: { tool: "listFiles", result: JSON.stringify({ success: true }) } });
  });
  expect(screen.getByText("95%")).toBeTruthy();
});
