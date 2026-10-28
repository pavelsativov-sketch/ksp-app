/**
 * Файловый менеджер песочницы: загрузка своих файлов и переименование.
 *
 * Обе операции используют один эндпойнт /api/agents/sandbox:
 *   GET  — список/содержимое,
 *   PUT  — создание/замена файла,
 *   DELETE — удаление.
 * Для проверки сервер заменяется маленькой in-memory «машиной».
 */

// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, it, vi, expect } from "vitest";

import { FileManagerApp } from "@/components/workspace/apps/file-manager";

interface Entry { name: string; content: string }

let fs: Entry[];

/** Заглушка /api/agents/sandbox: списки, чтение, PUT, DELETE. */
function stubSandboxFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const respond = (body: unknown, ok = true) => ({
      ok, status: ok ? 200 : 400,
      json: async () => body,
    } as Response);

    if (method === "PUT") {
      const body = JSON.parse(String(init?.body)) as { file?: string; content?: string };
      if (!body.file || !body.file.includes(".")) return respond({ error: "Некорректный файл или содержимое" }, false);
      const existing = fs.findIndex((entry) => entry.name === body.file);
      if (existing >= 0) fs[existing]!.content = body.content ?? "";
      else fs.push({ name: body.file, content: body.content ?? "" });
      return respond({ ok: true, name: body.file });
    }
    if (method === "DELETE") {
      const name = new URL(url, "http://localhost").searchParams.get("file") ?? "";
      fs = fs.filter((entry) => entry.name !== name);
      return respond({ ok: true });
    }
    const file = new URL(url, "http://localhost").searchParams.get("file");
    if (file) {
      const entry = fs.find((e) => e.name === file);
      if (!entry) return respond({ error: "Файл не найден" }, false);
      return respond({ name: file, content: entry.content, truncated: false });
    }
    const files = fs.map((entry) => ({
      name: entry.name, size: Buffer.byteLength(entry.content, "utf8"),
      sizeLabel: `${Buffer.byteLength(entry.content, "utf8")} Б`,
      modified: "2026-01-01T00:00:00.000Z",
    }));
    return respond({ files });
  }));
}

beforeEach(() => {
  fs = [{ name: "plan.md", content: "# План" }];
  stubSandboxFetch();
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("prompt", vi.fn(() => null));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("загружает текстовый файл через PUT и показывает его в списке", async () => {
  render(<FileManagerApp />);
  await waitFor(() => expect(screen.getByText("plan.md")).toBeTruthy());

  const file = new File(["Добрый день, завуч!"], "otchot.txt", { type: "text/plain" });
  const input = screen.getByLabelText("Выбранные файлы") as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });

  await waitFor(() => expect(screen.getByText("otchot.txt")).toBeTruthy());
  await waitFor(() => expect(screen.getByText(/otchot\.txt: загружен/)).toBeTruthy());
  expect(fs.some((entry) => entry.name === "otchot.txt" && entry.content.includes("завуч"))).toBe(true);
  const putCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
    (call) => String(call[0]) === "/api/agents/sandbox" && (call[1] as RequestInit | undefined)?.method === "PUT",
  );
  expect(putCall).toBeTruthy();
});

it("несуществующий файл по несовпадению имени не заменяет файл без подтверждения", async () => {
  vi.mocked(confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
  render(<FileManagerApp />);
  await waitFor(() => expect(screen.getByText("plan.md")).toBeTruthy());

  const file = new File(["переписанный план"], "plan.md", { type: "text/plain" });
  const input = screen.getByLabelText("Выбранные файлы") as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });

  await waitFor(() => expect(screen.getByText(/пропущен/)).toBeTruthy());
  // Подтверждение на замену спрашивается — молча затереть файл нельзя.
  expect(confirm).toHaveBeenCalled();
  expect(fs.find((entry) => entry.name === "plan.md")!.content).toBe("# План");
});

it("переименовывает открытый файл: PUT нового имени и DELETE старого", async () => {
  vi.mocked(prompt as unknown as ReturnType<typeof vi.fn>).mockReturnValue("plan-v2.md");
  render(<FileManagerApp />);
  await waitFor(() => expect(screen.getByText("plan.md")).toBeTruthy());

  await act(async () => {
    fireEvent.click(screen.getByText("plan.md"));
  });
  await waitFor(() => expect(screen.getByText(/Переименовать/)).toBeTruthy());

  await act(async () => {
    fireEvent.click(screen.getByLabelText("Переименовать файл"));
  });

  await waitFor(() => expect(screen.getByText("plan-v2.md")).toBeTruthy());
  await waitFor(() => expect(screen.getByText("Файл переименован: plan-v2.md")).toBeTruthy());
  expect(fs.some((entry) => entry.name === "plan-v2.md" && entry.content === "# План")).toBe(true);
  expect(fs.some((entry) => entry.name === "plan.md")).toBe(false);
});

it("переименование можно отменить в диалоге — файл остаётся", async () => {
  vi.mocked(prompt as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
  render(<FileManagerApp />);
  await waitFor(() => expect(screen.getByText("plan.md")).toBeTruthy());

  await act(async () => {
    fireEvent.click(screen.getByText("plan.md"));
  });
  await waitFor(() => expect(screen.getByText(/Переименовать/)).toBeTruthy());
  await act(async () => {
    fireEvent.click(screen.getByLabelText("Переименовать файл"));
  });

  await waitFor(() => expect(fs.some((entry) => entry.name === "plan.md")).toBe(true));
  expect(fs).toHaveLength(1);
});

it("бинарные форматы загрузке недоступны с понятным объяснением", async () => {
  render(<FileManagerApp />);
  await waitFor(() => expect(screen.getByText("plan.md")).toBeTruthy());

  const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
  const input = screen.getByLabelText("Выбранные файлы") as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });

  await waitFor(() => expect(screen.getByText(/только текстовые форматы/)).toBeTruthy());
  expect(fs.some((entry) => entry.name === "photo.png")).toBe(false);
});

it("удаление требует подтверждения: «Нет» оставляет файл", async () => {
  render(<FileManagerApp />);
  await waitFor(() => expect(screen.getByText("plan.md")).toBeTruthy());
  await act(async () => { fireEvent.click(screen.getByText("plan.md")); });
  await waitFor(() => expect(screen.getByText("Удалить")).toBeTruthy());

  fireEvent.click(screen.getByText("Удалить"));
  expect(screen.getByText("Удалить навсегда?")).toBeTruthy();
  // Сам файл ещё на месте: один клик ничего не стирает.
  expect(fs).toHaveLength(1);

  fireEvent.click(screen.getByText("Нет"));
  expect(screen.queryByText("Удалить навсегда?")).toBeNull();
  expect(fs).toHaveLength(1);
});

it("удаление после «Да» стирает файл и сообщает об этом", async () => {
  render(<FileManagerApp />);
  await waitFor(() => expect(screen.getByText("plan.md")).toBeTruthy());
  await act(async () => { fireEvent.click(screen.getByText("plan.md")); });
  await waitFor(() => expect(screen.getByText("Удалить")).toBeTruthy());

  fireEvent.click(screen.getByText("Удалить"));
  await act(async () => { fireEvent.click(screen.getByText("Да")); });

  await waitFor(() => expect(screen.getByText("Файл удалён: plan.md")).toBeTruthy());
  expect(fs).toHaveLength(0);
});

it("при длинном списке появляется поиск по имени", async () => {
  fs = Array.from({ length: 8 }, (_, i) => ({ name: `urok-${i}.md`, content: "x" }));
  fs.push({ name: "otchet.txt", content: "y" });
  render(<FileManagerApp />);
  await waitFor(() => expect(screen.getByText("otchet.txt")).toBeTruthy());

  fireEvent.change(screen.getByLabelText("Найти файл"), { target: { value: "otch" } });
  expect(screen.getByText("otchet.txt")).toBeTruthy();
  expect(screen.queryByText("urok-1.md")).toBeNull();
});
