// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KtpBuilder } from "@/components/ksp/ktp-builder";

const fetchMock = vi.fn();
const saveDraftMock = vi.fn();
vi.mock("@/app/actions/plans", () => ({ saveDraftAction: (...args: unknown[]) => saveDraftMock(...args) }));
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  saveDraftMock.mockReset().mockResolvedValue({ id: "draft-1" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function openBuilder(pro = true) {
  render(<KtpBuilder planId="plan-1" topic="Дроби" isPro={pro} grade={5} subjectId={null} language="ru" />);
  fireEvent.click(screen.getByRole("button", { name: "Создать КТП" }));
}

it("builds a draft table from topics and downloads the same result without a second request", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ktp: { title: "Черновик КТП", rows: [
    { number: 1, topic: "Дроби", hours: 1, date: "2026-09-17", objectives: "5.1.1 — Цель" },
    { number: 2, topic: "Сложение дробей", hours: 1, date: "", objectives: "" },
  ] }, docxBase64: "UEs=" }) });
  const createObjectURL = vi.fn(() => "blob:ktp");
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  openBuilder();
  fireEvent.change(screen.getByLabelText(/Темы уроков/), { target: { value: "Дроби\nСложение дробей" } });
  fireEvent.change(screen.getByLabelText(/Дата первого урока/), { target: { value: "2026-09-17" } });
  fireEvent.click(screen.getByRole("button", { name: "Сформировать таблицу КТП" }));
  await screen.findByRole("table");
  expect(screen.getByText("Заполните по учебной программе")).toBeTruthy();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ planId: "plan-1", topics: ["Дроби", "Сложение дробей"], startDate: "2026-09-17" });
  fireEvent.click(screen.getByRole("button", { name: "Скачать КТП в Word" }));
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(click).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  click.mockRestore();
});

it("shows server errors and allows retry", async () => {
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "План недоступен" }) });
  openBuilder();
  fireEvent.click(screen.getByRole("button", { name: "Сформировать таблицу КТП" }));
  expect((await screen.findByRole("alert")).textContent).toBe("План недоступен");
  await waitFor(() => expect((screen.getByRole("button", { name: "Сформировать таблицу КТП" }) as HTMLButtonElement).disabled).toBe(false));
});

it("does not submit empty topics", () => {
  openBuilder();
  fireEvent.change(screen.getByLabelText(/Темы уроков/), { target: { value: "  " } });
  expect((screen.getByRole("button", { name: "Сформировать таблицу КТП" }) as HTMLButtonElement).disabled).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("free plan sees an upgrade note instead of the form", () => {
  openBuilder(false);
  expect(screen.getByText(/тарифа Pro/)).toBeTruthy();
  expect(screen.queryByLabelText(/Темы уроков/)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("creates one draft per KTP row without spending AI quota", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ktp: { title: "Черновик КТП", rows: [
    { number: 1, topic: "Дроби", hours: 1, date: "", objectives: "" },
    { number: 2, topic: "Сложение дробей", hours: 1, date: "", objectives: "" },
  ] } }) });
  openBuilder();
  fireEvent.click(screen.getByRole("button", { name: "Сформировать таблицу КТП" }));
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: /Создать черновики уроков \(2\)/ }));
  await screen.findByText(/Готово: черновиков 2 из 2/);
  expect(saveDraftMock).toHaveBeenCalledTimes(2);
  expect(saveDraftMock.mock.calls[0][0]).toMatchObject({ title: "Дроби", grade: 5, visibility: "private" });
  expect(saveDraftMock.mock.calls[1][0]).toMatchObject({ title: "Сложение дробей" });
  expect(fetchMock).toHaveBeenCalledTimes(1); // только КТП, без AI-запросов
});
