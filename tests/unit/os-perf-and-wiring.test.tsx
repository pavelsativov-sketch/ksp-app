// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/school",
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "507f1f77bcf86cd799439011",
    email: "teacher@school.kz",
    fullName: "Учитель",
  })),
}));

vi.mock("@/lib/school/sys-info", () => ({
  sysInfo: vi.fn(async () => "ready"),
}));

import { clientPointToRemote, remoteBoxToOverlay } from "@/lib/agents/viewport-coords";
import { browserFailure } from "@/lib/agents/browser-failure";
import { useWorkspaceStore } from "@/lib/store/workspace";
import { useOsShellStore } from "@/lib/store/os-shell";
import { Window } from "@/components/workspace/window";
import { SchoolWorkspace } from "@/components/school/school-workspace";
import { Workspace } from "@/components/workspace/workspace";
import WorkspacePage from "@/app/school/workspace/page";
import {
  clearActiveAgentTask,
  invalidateSharedTasksCache,
  setActiveAgentTask,
} from "@/components/agents/agent-dock";
import { useActiveTaskStatus } from "@/components/agents/use-task-status";

class StubResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  useWorkspaceStore.setState({ windows: [], activeWindowId: null, editorOpenSeq: 0 });
  useOsShellStore.setState({ tab: "os" });
  clearActiveAgentTask();
  invalidateSharedTasksCache();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearActiveAgentTask();
});

describe("viewport-coords (object-fit: contain)", () => {
  it("maps center and letterbox margins accurately in wide panes", () => {
    const rect = { left: 100, top: 20, width: 1000, height: 500 };
    // scale = min(1000/1280, 500/800) = 0.625 => rendered 800x500, offsetX = 100
    expect(clientPointToRemote({ clientX: 600, clientY: 270, rect })).toEqual({
      x: 640,
      y: 400,
      localX: 500,
      localY: 250,
    });
    // Click inside left black bar -> null
    expect(clientPointToRemote({ clientX: 120, clientY: 270, rect })).toBeNull();
  });

  it("maps remote active field boxes to overlay CSS coords in narrow panes", () => {
    const overlay = remoteBoxToOverlay({
      box: { x: 100, y: 200, width: 200, height: 60 },
      containerW: 640,
      containerH: 600,
    });
    // scale = 0.5 => rendered 640x400, offsetY = 100
    expect(overlay).toEqual({ left: 50, top: 200, width: 100, height: 30 });

    // Small remote inputs stay clamped to clickable minimum 80x26
    expect(
      remoteBoxToOverlay({
        box: { x: 100, y: 200, width: 100, height: 40 },
        containerW: 640,
        containerH: 600,
      }),
    ).toEqual({ left: 50, top: 200, width: 80, height: 26 });
  });
});

describe("Window interactions and Zustand focus guard", () => {
  it("does not clone windows on redundant focusWindow and isolates titlebar buttons", () => {
    act(() => {
      useWorkspaceStore.getState().openWindow("w1", "Файлы", "file-manager");
    });
    const before = useWorkspaceStore.getState().windows;
    act(() => {
      useWorkspaceStore.getState().focusWindow("w1");
    });
    expect(useWorkspaceStore.getState().windows).toBe(before);

    render(
      <Window id="w1" title="Файлы">
        <div>Тело окна</div>
      </Window>,
    );
    const minBtn = screen.getByRole("button", { name: "Свернуть окно «Файлы»" });
    fireEvent.pointerDown(minBtn);
    fireEvent.click(minBtn);
    expect(useWorkspaceStore.getState().windows[0]?.isMinimized).toBe(true);
  });
});

describe("SchoolWorkspace & /school/workspace routing", () => {
  it("makes zero /api/agents/control polls when idle and re-triggers editor even on same filename", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/agents/sandbox")) {
        return { ok: true, status: 200, json: async () => ({ files: [{ name: "lesson.md" }], content: "# Урок" }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ control: "user", pendingCount: 0, files: [], tasks: [] }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SchoolWorkspace />);
    await act(async () => {
      await Promise.resolve();
    });

    const controlCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/agents/control"));
    expect(controlCalls).toHaveLength(0);

    act(() => {
      useWorkspaceStore.getState().openInEditor("lesson.md");
    });
    expect(useWorkspaceStore.getState().editorOpenSeq).toBe(1);
    expect(useOsShellStore.getState().tab).toBe("editor");

    act(() => {
      useOsShellStore.getState().setTab("files");
    });
    expect(useOsShellStore.getState().tab).toBe("files");

    act(() => {
      useWorkspaceStore.getState().openInEditor("lesson.md");
    });
    expect(useWorkspaceStore.getState().editorOpenSeq).toBe(2);
    expect(useOsShellStore.getState().tab).toBe("editor");
  });

  it("renders floating desktop OS by default and SchoolWorkspace split view for ?tab=browser", async () => {
    const desktopEl = await WorkspacePage({ searchParams: Promise.resolve({}) });
    expect(desktopEl.type).toBe(Workspace);

    const computerUseEl = await WorkspacePage({ searchParams: Promise.resolve({ os: "computer-use" }) });
    expect(computerUseEl.type).toBe(Workspace);
    expect(computerUseEl.props.initialApp).toBe("computer-use");

    const splitEl = await WorkspacePage({
      searchParams: Promise.resolve({ tab: "browser", url: "https://example.com" }),
    });
    expect(splitEl.type).toBe(SchoolWorkspace);
    expect(splitEl.props.initialTab).toBe("browser");
    expect(splitEl.props.initialUrl).toBe("https://example.com");
  });
});

function TaskStatusProbe() {
  const { status } = useActiveTaskStatus();
  return <span data-testid="task-status">{status}</span>;
}

describe("useActiveTaskStatus terminal stop", () => {
  it("stops polling once the task reaches completed status", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tasks: [{ id: "task-done-1", status: "completed", createdAt: new Date().toISOString() }],
      }),
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    act(() => {
      setActiveAgentTask("task-done-1", "Готовая задача");
    });

    render(<TaskStatusProbe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("task-status").textContent).toBe("completed");
    const initialCalls = fetchMock.mock.calls.length;
    expect(initialCalls).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetchMock.mock.calls.length).toBe(initialCalls);
  });
});

describe("browserFailure error vs warmup classification", () => {
  it("returns 503 for permanent install failures and 202 for warmup", () => {
    const failed = browserFailure({ message: "Браузер рабочей области не установился.", status: 503 });
    expect(failed.status).toBe(503);

    const warming = browserFailure({ message: "Браузер прогревается", status: 202 });
    expect(warming.status).toBe(202);
    expect(warming.starting).toBe(true);
  });
});
