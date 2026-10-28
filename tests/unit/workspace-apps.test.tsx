/**
 * Приложения внутри окон: терминал помнит сеанс, журнал показывает задачу,
 * страницы показывают загрузку.
 */

// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/agents/agent-session", () => ({
  AgentSession: ({ taskId }: { taskId: string }) => <div data-testid="agent-session">{taskId}</div>,
}));

import { TerminalApp } from "@/components/workspace/apps/terminal";
import { AgentLogApp } from "@/components/workspace/apps/agent-log";
import { IframeApp } from "@/components/workspace/apps/iframe";
import { setActiveAgentTask, clearActiveAgentTask } from "@/components/agents/agent-dock";
import { useTerminalStore } from "@/lib/store/terminal";

function stubTerminalApi(info: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      return { ok: true, status: 200, json: async () => ({ stdout: "привет\n", stderr: "", exitCode: 0 }) } as Response;
    }
    return { ok: true, status: 200, json: async () => info } as Response;
  }));
}

beforeEach(() => {
  useTerminalStore.setState({ entries: [], history: [], info: null });
  window.localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  clearActiveAgentTask();
  vi.unstubAllGlobals();
});

describe("терминал", () => {
  it("честно говорит, что команды выполняются в облаке, а не на компьютере пользователя", async () => {
    stubTerminalApi({ available: true, status: "ready", cwd: "/vercel/sandbox" });
    render(<TerminalApp />);
    await waitFor(() => expect(screen.getByText(/ваш компьютер они не затрагивают/)).toBeTruthy());
    expect(screen.queryByText(/PowerShell/)).toBeNull();
    expect(screen.queryByText(/ваш компьютер ·/)).toBeNull();
  });

  it("в облаке по-прежнему говорит про Linux Sandbox", async () => {
    stubTerminalApi({ available: true, status: "ready", cwd: "/vercel/sandbox" });
    render(<TerminalApp />);
    await waitFor(() => expect(screen.getByText(/Linux ready/)).toBeTruthy());
    expect(screen.getByText(/изолированной Linux Sandbox/)).toBeTruthy();
  });

  it("вывод и история переживают закрытие и повторное открытие вкладки", async () => {
    stubTerminalApi({ available: true, status: "ready", cwd: "/w" });
    const first = render(<TerminalApp />);
    await waitFor(() => expect((screen.getByLabelText(/Команда/) as HTMLInputElement).disabled).toBe(false));

    fireEvent.change(screen.getByLabelText(/Команда/), { target: { value: "echo привет" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText(/Команда/).closest("form")!); });
    await waitFor(() => expect(screen.getByText("привет")).toBeTruthy());

    first.unmount();
    render(<TerminalApp />);
    expect(screen.getByText("привет")).toBeTruthy();
    expect(useTerminalStore.getState().history).toEqual(["echo привет"]);
  });

  it("команда clear очищает экран без запроса к серверу", async () => {
    stubTerminalApi({ available: true, status: "ready", cwd: "/w" });
    useTerminalStore.setState({ entries: [{ command: "ls", stdout: "a", stderr: "" }], history: [] });
    render(<TerminalApp />);
    await waitFor(() => expect((screen.getByLabelText(/Команда/) as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText(/Команда/), { target: { value: "clear" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText(/Команда/).closest("form")!); });
    expect(useTerminalStore.getState().entries).toHaveLength(0);
    const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(posts).toHaveLength(0);
  });
});

describe("журнал агента", () => {
  it("без задачи объясняет, что делать", () => {
    render(<AgentLogApp />);
    expect(screen.getByText(/Журнал появится, когда вы запустите задачу/)).toBeTruthy();
    expect(screen.queryByTestId("agent-session")).toBeNull();
  });

  it("с задачей показывает её журнал, а не пустой мини-чат", () => {
    act(() => setActiveAgentTask("task-42", "Тест"));
    render(<AgentLogApp />);
    expect(screen.getByTestId("agent-session").textContent).toBe("task-42");
  });
});

describe("встроенная страница", () => {
  it("показывает загрузку, пока iframe не загрузился, и ссылку в новую вкладку", () => {
    render(<IframeApp url="/plans/new" title="Конструктор КСП" />);
    expect(screen.getByText("Открываю страницу…")).toBeTruthy();
    const frame = screen.getByTitle("Конструктор КСП");
    act(() => { fireEvent.load(frame); });
    expect(screen.queryByText("Открываю страницу…")).toBeNull();
    expect(screen.getByRole("link", { name: "Открыть в новой вкладке" }).getAttribute("href")).toBe("/plans/new");
  });
});
