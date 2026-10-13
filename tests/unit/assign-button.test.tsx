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
    if (String(url).includes("/api/assignments/preview")) {
      return {
        ok: true,
        json: async () => ({
          tasks: [{ id: `${planId}:0`, question: "2+2?", type: "MCQ", points: 2, options: ["3", "4"], answer: "4" }],
          fingerprint: "a".repeat(64),
        }),
      };
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
  expect((await screen.findAllByText("Домашняя выдача ученикам")).length).toBeGreaterThan(0);
  expect(screen.getByText("2+2?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Предпросмотр для ученика \(1\)/ }));
  const issueButton = await screen.findByRole("button", { name: /Создать выдачу/ });
  fireEvent.click(issueButton);
  expect((await screen.findAllByText(/123456/)).length).toBeGreaterThan(0);
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
  const btn = screen.getByRole("button", { name: /Предпросмотр для ученика \(0\)/ }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
});
