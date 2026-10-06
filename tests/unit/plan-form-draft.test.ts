// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { emptyKsp } from "@/lib/types/ksp";
import { PlanForm } from "@/components/ksp/plan-form";
import { getPlanExamples } from "@/lib/plan-examples";

const mocks = vi.hoisted(() => ({
  draft: vi.fn(), save: vi.fn(), push: vi.fn(), generate: vi.fn(),
}));
vi.mock("@/app/actions/plans", () => ({ saveDraftAction: mocks.draft, savePlanAction: mocks.save }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, back: vi.fn() }) }));
vi.mock("@/components/ksp/hooks/use-plan-ai", () => ({ usePlanAi: () => ({ generateWithAi: mocks.generate, aiLoading: false }) }));
vi.mock("@/components/ksp/objectives-picker", () => ({ ObjectivesPicker: () => null }));
vi.mock("@/components/ksp/textbook-picker", () => ({ TextbookPicker: () => null }));
vi.mock("@/components/ksp/stage-editor", () => ({ StageEditor: () => null }));
vi.mock("@/components/ksp/ai-enhance-button", () => ({ AiEnhanceButton: () => null }));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shows a saved draft, reuses its returned ID for subsequent saves, and preserves the restored profile", async () => {
  vi.stubGlobal("React", React);
  const id = "507f1f77bcf86cd799439011";
  mocks.draft.mockResolvedValue({ id });
  mocks.save.mockResolvedValue({ id });
  const content = { ...emptyKsp(), topic: "Restored topic", schoolProfile: "ogn" };
  window.localStorage.setItem("ksp-school-profile", "emn");
  window.localStorage.setItem("ksp-draft:new", JSON.stringify({ title: "Restored lesson", content }));
  render(React.createElement(PlanForm, { subjects: [] }));

  await waitFor(() => expect((screen.getByLabelText(/Название КСП/) as HTMLInputElement).value).toBe("Restored lesson"));
  expect(screen.getByRole("combobox", { name: "Профиль школы" }).textContent).toContain("ОГН");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
  await screen.findByText("Черновик сохранён на сервере");
  expect(mocks.draft.mock.calls[0][0]).toMatchObject({ id: undefined, content: { schoolProfile: "ogn" } });

  fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
  await waitFor(() => expect(mocks.draft).toHaveBeenCalledTimes(2));
  await screen.findByText("Черновик сохранён на сервере");
  expect(mocks.draft.mock.calls[1][0].id).toBe(id);

  fireEvent.click(screen.getByRole("button", { name: /^Сохранить$/ }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/plans/${id}`));
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ id, content: { schoolProfile: "ogn" } });
});

it("prefills an isolated example without AI, server writes or overwriting a manual draft", async () => {
  vi.stubGlobal("React", React);
  const subject = { id: "507f1f77bcf86cd799439011", name_ru: "Математика", name_kz: null, grade_min: 1, grade_max: 6 };
  const [example] = getPlanExamples([subject]);
  const manual = JSON.stringify({ title: "My manual work", content: { ...emptyKsp(), topic: "Manual topic" } });
  window.localStorage.setItem("ksp-draft:new", manual);
  render(React.createElement(PlanForm, { subjects: [subject], initialPlan: example.plan, exampleKey: example.key }));
  await waitFor(() => expect(window.localStorage.getItem(`ksp-draft:example:${example.key}`)).not.toBeNull());
  expect((screen.getByLabelText(/Название КСП/) as HTMLInputElement).value).toBe(example.plan.title);
  expect(window.localStorage.getItem("ksp-draft:new")).toBe(manual);
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.draft).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("submits the initial timestamp then advances it after each successful save", async () => {
  vi.stubGlobal("React", React);
  const id = "507f1f77bcf86cd799439011";
  mocks.draft.mockResolvedValueOnce({ id, updated_at: "2026-09-17T12:01:00Z" }).mockResolvedValueOnce({ id, updated_at: "2026-09-17T12:02:00Z" });
  mocks.save.mockResolvedValue({ id, updated_at: "2026-09-17T12:03:00Z" });
  render(React.createElement(PlanForm, { subjects: [], initialPlan: { id, updated_at: "2026-09-17T12:00:00Z", title: "Test", content: { ...emptyKsp(), topic: "Topic", schoolProfile: "emn" } } }));
  fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
  await screen.findByText("Черновик сохранён на сервере");
  expect(mocks.draft.mock.calls[0][0].expected_updated_at).toBe("2026-09-17T12:00:00Z");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
  await waitFor(() => expect(mocks.draft).toHaveBeenCalledTimes(2));
  await screen.findByText("Черновик сохранён на сервере");
  expect(mocks.draft.mock.calls[1][0].expected_updated_at).toBe("2026-09-17T12:01:00Z");
  fireEvent.click(screen.getByRole("button", { name: /^Сохранить$/ }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  expect(mocks.save.mock.calls[0][0].expected_updated_at).toBe("2026-09-17T12:02:00Z");
});

it("AI-fill preserves user text, reports filled fields and offers undo", async () => {
  vi.stubGlobal("React", React);
  const emptyStage = { time: "", teacherActions: "", studentActions: "", resources: "", keyQuestions: [], descriptors: [], assessmentMethod: "", tasks: [] };
  mocks.generate.mockResolvedValue({
    topic: "",
    lessonObjectives: ["AI цель"],
    assessmentCriteria: [],
    languageObjectives: { terms: [], phrases: [] },
    values: "AI ценности",
    crossCurricularLinks: "",
    priorKnowledge: "",
    stages: {
      beginning: { ...emptyStage },
      middle: { ...emptyStage },
      end: { ...emptyStage, homework: "", summary: "", reflectionQuestions: [] },
    },
    evaluation: { formativeAssessment: "", differentiation: "", healthAndSafety: "", reflection: "" },
  });
  const content = { ...emptyKsp(), topic: "Моя тема" };
  render(React.createElement(PlanForm, { subjects: [], initialPlan: { content } }));
  // Radix Tabs в jsdom переключается фокусом (automatic activation).
  fireEvent.focus(screen.getByRole("tab", { name: "Цели" }));
  const topicInput = await screen.findByPlaceholderText(/Сложение многозначных чисел/) as HTMLInputElement;
  expect(topicInput.value).toBe("Моя тема");
  // Цели с кодами уходят в AI-запрос вместе с текстом.
  fireEvent.click(screen.getByRole("button", { name: "AI-заполнение" }));
  // Сначала дифф на подтверждение, затем применение.
  await screen.findByText(/AI подготовил изменения/);
  expect(mocks.generate.mock.calls[0][0]).toMatchObject({ topic: "Моя тема" });
  fireEvent.click(screen.getByRole("button", { name: /Применить/ }));
  // Пустой topic от AI не стёр пользовательский; undo доступен со счётчиком.
  await screen.findByRole("button", { name: "Отменить AI-заполнение" });
  expect(topicInput.value).toBe("Моя тема");
  expect(screen.getByText(/AI заполнил полей: 2/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Отменить AI-заполнение" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Отменить AI-заполнение" })).toBeNull());
});
