// @vitest-environment jsdom
import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlanForm } from "@/components/ksp/plan-form";
import { emptyKsp } from "@/lib/types/ksp";

const mocks = vi.hoisted(() => ({ draft: vi.fn(), save: vi.fn(), push: vi.fn() }));
vi.mock("@/app/actions/plans", () => ({ saveDraftAction: mocks.draft, savePlanAction: mocks.save, getPlanConflictSnapshotAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, back: vi.fn() }) }));
vi.mock("@/components/ksp/hooks/use-plan-ai", () => ({ usePlanAi: () => ({ generateWithAi: vi.fn(), aiLoading: false }) }));
vi.mock("@/components/ksp/objectives-picker", () => ({ ObjectivesPicker: () => null }));
vi.mock("@/components/ksp/textbook-picker", () => ({ TextbookPicker: () => null }));
vi.mock("@/components/ksp/stage-editor", () => ({ StageEditor: () => null }));
vi.mock("@/components/ksp/ai-enhance-button", () => ({ AiEnhanceButton: () => null }));
vi.mock("@/components/ksp/glossary-button", () => ({ GlossaryButton: () => null }));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("copies a criterion from an owned plan and retains visible provenance", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ blocks: [{
      id: "507f1f77bcf86cd799439011:criterion:0",
      kind: "criterion",
      source: { planId: "507f1f77bcf86cd799439011", title: "Мой прошлый КСП", grade: 5, language: "ru", topic: "Дроби", objectiveCodes: ["5.1.2.1"] },
      preview: "Обосновывает сравнение дробей",
      payload: "Обосновывает сравнение дробей",
    }] }),
  }));
  const content = { ...emptyKsp(), topic: "Новая тема" };
  render(<PlanForm subjects={[]} initialTab="goals" initialPlan={{ title: "Новый КСП", grade: 5, language: "ru", content }} />);

  fireEvent.click(screen.getByRole("button", { name: "Взять из моих КСП" }));
  await screen.findByRole("region", { name: /Выбрать блок из своих планов: критерий оценивания/ });
  fireEvent.click(await screen.findByRole("button", { name: "Использовать независимую копию" }));

  expect(await screen.findByText("Обосновывает сравнение дробей")).toBeTruthy();
  expect(screen.getByText(/источник: план «Мой прошлый КСП»/)).toBeTruthy();
  expect(screen.queryByText("Обосновывает сравнение дробей")?.closest("li")).toBeTruthy();
});
