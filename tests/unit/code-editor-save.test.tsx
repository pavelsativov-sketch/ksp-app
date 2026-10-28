/**
 * Редактор кода: Ctrl+S реально сохраняет файл.
 *
 * Команда регистрировалась при монтировании Monaco и замыкалась на `save` из
 * того рендера, где экземпляр редактора ещё не был известен: сочетание клавиш
 * молча ничего не делало, работала только кнопка «Сохранить».
 */

// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let ctrlS: (() => void) | null = null;
let editorText = "";

vi.mock("@monaco-editor/react", () => ({
  loader: { config: () => {} },
  default: function MockEditor({ value, onMount }: { value: string; onMount: (editor: unknown, monaco: unknown) => void }) {
    React.useEffect(() => {
      editorText = value;
      onMount(
        { getValue: () => editorText, addCommand: (_key: number, run: () => void) => { ctrlS = run; } },
        { KeyMod: { CtrlCmd: 1 }, KeyCode: { KeyS: 2 } },
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="monaco" />;
  },
}));

import { CodeEditorApp } from "@/components/workspace/apps/code-editor";

const calls: Array<{ url: string; method: string; body?: string }> = [];

beforeEach(() => {
  ctrlS = null;
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body as string | undefined });
    if (method === "PUT") return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    if (url.includes("file=")) return { ok: true, status: 200, json: async () => ({ content: "print(1)" }) } as Response;
    return { ok: true, status: 200, json: async () => ({ files: [{ name: "a.py" }, { name: "b.py" }] }) } as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("Ctrl+S сохраняет текущий текст редактора через PUT", async () => {
  render(<CodeEditorApp requestedFile="a.py" />);
  await waitFor(() => expect(screen.getByTestId("monaco")).toBeTruthy());
  await waitFor(() => expect(ctrlS).toBeTruthy());

  editorText = "print(2)";
  await act(async () => { ctrlS!(); });

  await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
  const put = calls.find((c) => c.method === "PUT")!;
  expect(JSON.parse(put.body!)).toEqual({ file: "a.py", content: "print(2)" });
  await waitFor(() => expect(screen.getByText("Сохранено")).toBeTruthy());
});

it("список файлов в шапке позволяет открыть другой файл", async () => {
  render(<CodeEditorApp requestedFile="a.py" />);
  await waitFor(() => expect(screen.getByLabelText("Файл в редакторе")).toBeTruthy());
  const options = Array.from((screen.getByLabelText("Файл в редакторе") as HTMLSelectElement).options).map((o) => o.value);
  expect(options).toEqual(["a.py", "b.py"]);
});
