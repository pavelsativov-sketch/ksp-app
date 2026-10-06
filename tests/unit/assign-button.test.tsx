// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AssignHomeworkButton } from "@/components/assignments/assign-homework-button";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes("/api/assignments/library")) {
      return { ok: true, json: async () => ({ fromAssignments: [], fromPlans: [] }) };
    }
    return { ok: true, json: async () => ({ id: "x", code: "123456" }) };
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const planId = "a".repeat(24);

function openDialog() {
  render(
    <AssignHomeworkButton
      planId={planId}
      planTitle="Дроби"
      subject="Математика"
      grade={5}
      planTasks={[{ ref: `${planId}:0`, question: "2+2?", type: "MCQ", points: 2, from: "Дроби" }]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Задать домой" }));
}

it("opens dialog, lists plan tasks and creates assignment", async () => {
  openDialog();
  expect(await screen.findByText("Домашняя выдача ученикам")).toBeTruthy();
  expect(screen.getByText("2+2?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Создать ссылку \(1\)/ }));
  await screen.findByText(/Готово! Код: 123456/);
  const [url, init] = fetchMock.mock.calls.find(([u]) => u === "/api/assignments") ?? [];
  expect(url).toBe("/api/assignments");
  expect(JSON.parse(init.body)).toMatchObject({
    title: "Дроби — домой",
    taskIds: [`${planId}:0`],
    daysValid: 14,
  });
});

it("shows empty state when plan has no tasks", async () => {
  render(
    <AssignHomeworkButton planId={planId} planTitle="Дроби" subject="Математика" grade={5} planTasks={[]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Задать домой" }));
  expect(await screen.findByText(/В плане пока нет интерактивных заданий/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Создать ссылку \(0\)/ })).toBeTruthy();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
});
