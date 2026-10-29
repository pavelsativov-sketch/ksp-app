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
  expect(screen.getByText(/ksp-дроби\.md/)).toBeTruthy();
});

it("без созданных материалов карточки результата нет", () => {
  render(<AgentSession taskId="none" variant="chat" />);
  act(() => FakeEventSource.instances[0]!.emit({ type: "TOOL_RESULT", message: "x", data: { tool: "listFiles", result: "{}" } }));
  expect(screen.queryByRole("region", { name: "Результат работы агента" })).toBeNull();
});
