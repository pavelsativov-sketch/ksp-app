// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CrosswordButton, MemosButton, WorksheetButton } from "@/components/ksp/handouts-button";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetchMock);
  // Маршрут /api/handouts/generate отдаёт ошибку как JSON { error }.
  fetchMock.mockReset().mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "Тест: провайдер недоступен" }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const baseProps = { planId: "test-id", topic: "Тема", subject: "Информатика", grade: 7, language: "ru" as const };

function openWorksheet() {
  render(<WorksheetButton {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: "Рабочий лист" }));
}

function switches() {
  return screen.getAllByRole("switch");
}

it("worksheet: отправляет kind+count без cardLayout и без withImages по умолчанию", async () => {
  openWorksheet();
  // Пилюля по умолчанию — 6 заданий.
  expect(screen.getByRole("button", { name: "6" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Создать и посмотреть" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/handouts/generate");
  const body = JSON.parse(init.body);
  expect(body).toMatchObject({ kind: "worksheet", count: 6 });
  expect(body).not.toHaveProperty("cardLayout");
  expect(body).not.toHaveProperty("withImages");
  // Сообщение об ошибке извлекается из JSON, а не показывается сырым телом ответа.
  await screen.findByText("Тест: провайдер недоступен");
});

it("worksheet: переключатель иллюстраций включает withImages", async () => {
  openWorksheet();
  fireEvent.click(switches()[0]); // ИИ-иллюстрации
  fireEvent.click(screen.getByRole("button", { name: "Создать и посмотреть" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ kind: "worksheet", withImages: true });
});

it("worksheet: объединение шлёт комплект в /api/handouts/combined", async () => {
  openWorksheet();
  fireEvent.click(switches()[1]); // Объединить с памятками
  // Кнопка меняет подпись, появляются пилюли памяток.
  fireEvent.click(screen.getByRole("button", { name: "Создать комплект" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/handouts/combined");
  expect(JSON.parse(init.body)).toMatchObject({ worksheetCount: 6, memosCount: 12 });
});

it("memos: отдельная кнопка Памятки с пилюлями 8/12/16/20", async () => {
  render(<MemosButton {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: "Памятки" }));
  expect(screen.getByRole("button", { name: "12" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Создать и посмотреть" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ kind: "flashcards", count: 12 });
});

it("crossword: отдельная кнопка без переключателя иллюстраций", async () => {
  render(<CrosswordButton {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: "Кроссворд" }));
  expect(screen.queryByRole("switch")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "8" }));
  fireEvent.click(screen.getByRole("button", { name: "Создать и посмотреть" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ kind: "crossword", count: 8 });
});

it("opens the preview dialog with the generated task and image", async () => {
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({
      handout: {
        kind: "worksheet", title: "Рабочий лист: Дроби", intro: "Интро", metaLine: "Класс: 5",
        tasks: [{ type: "open", prompt: "Запишите половину целого дробью.", criterion: "К", descriptor: "Д", points: 10, imageBase64: "IMG", imageMime: "image/png", imageAlt: "рисунок к заданию" }],
      },
      docxBase64: "AAAA",
    }),
  });
  openWorksheet();
  fireEvent.click(screen.getByRole("button", { name: "Создать и посмотреть" }));
  await screen.findByText("Запишите половину целого дробью.");
  // jsdom не присваивает <img> роль img; проверяем картинку по alt и data-URI.
  const picture = screen.getByAltText("рисунок к заданию") as HTMLImageElement;
  expect(picture.src.startsWith("data:image/png;base64,IMG")).toBe(true);
  // Скачивание предлагается из того же результата: второй AI-запрос не выполняется.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Учителю (с ответами)")).toBeTruthy();
  expect(screen.getByText("Ученикам (без ответов)")).toBeTruthy();
  expect(screen.getByText("Закрыть")).toBeTruthy();
});
