// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AiContextCard } from "@/components/ksp/ai-context-card";
import type { AiRunContext } from "@/components/ksp/hooks/use-plan-ai";

const base: AiRunContext = {
  id: "run-current",
  grade: 5,
  subject: "Математика",
  topic: "Дроби",
  learningObjectives: ["5.1.2.1 — Сравнивать дроби"],
  language: "ru",
  section: "Рациональные числа",
  previousLessonContextIncluded: false,
  textbookSelected: true,
  rag: {
    selected: true,
    textbookTitle: "Алгебра 5",
    chunkCount: 1,
    method: "vector",
    status: "ok",
    warnings: [],
    sources: [{ id: "507f1f77bcf86cd799439001", pageNumber: 17, chunkIndex: 3 }],
  },
  generatedAt: "2026-10-13T05:00:00.000Z",
  planRevision: "2026-10-12T12:00:00.000Z",
  promptVersion: "ksp-generation-v1",
  replayInput: {
    grade: 5,
    subjectName: "Математика",
    topic: "Дроби",
    learningObjectives: ["5.1.2.1 — Сравнивать дроби"],
    language: "ru",
    section: "Рациональные числа",
    previousHomeworkIncluded: true,
    textbookId: "507f1f77bcf86cd799439099",
    planRevision: "2026-10-12T12:00:00.000Z",
  },
};

it("shows source metadata and safe replay warning without exposing prompt text", () => {
  const onReplay = vi.fn();
  const older = { ...base, id: "run-old", topic: "Целые числа", generatedAt: "2026-10-12T05:00:00.000Z" };
  render(<AiContextCard context={base} locale="ru" history={[older, base]} canReplayExactly={() => false} onReplay={onReplay} />);
  fireEvent.click(screen.getByText("Контекст и источники AI-запроса"));
  expect(screen.getByText("Алгебра 5")).toBeTruthy();
  expect(screen.getByText(/стр\. 17/)).toBeTruthy();
  expect(screen.getByText(/Текст домашнего задания не сохраняется/)).toBeTruthy();
  expect(screen.getByText(/предыдущие запросы/i)).toBeTruthy();
  const replayButton = screen.getAllByRole("button").find((button) => button.textContent?.includes("Повторить безопасно"));
  expect(replayButton).toBeTruthy();
  fireEvent.click(replayButton!);
  expect(onReplay).toHaveBeenCalledWith("run-current");
});
