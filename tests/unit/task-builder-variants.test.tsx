// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TaskBuilder } from "@/components/ksp/task-builder";
import type { InteractiveTask } from "@/lib/ksp/tasks";

vi.mock("@/components/i18n/use-ui-locale", () => ({ useUiLocale: () => ({ locale: "ru", t: {} }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const context = {
  stage: "middle" as const,
  topic: "Дроби",
  grade: 5,
  subject: "Математика",
  language: "ru" as const,
};

function mcq(id: string, question: string, overrides: Partial<Extract<InteractiveTask, { type: "MCQ" }>> = {}) {
  return {
    id,
    type: "MCQ" as const,
    question,
    points: 2,
    options: ["1/2", "1/3"],
    correctIndex: 0,
    ...overrides,
  };
}

function response(tasks: InteractiveTask[]) {
  return { ok: true, json: async () => ({ tasks }) };
}

describe("TaskBuilder AI variants", () => {
  it("keeps new AI suggestions out of the plan until one is explicitly accepted", async () => {
    const onChange = vi.fn();
    const candidates = [mcq("a1", "Сравни дроби A"), mcq("a2", "Сравни дроби B"), mcq("a3", "Сравни дроби C")];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(candidates)));
    render(<TaskBuilder tasks={[]} onChange={onChange} context={context} />);

    fireEvent.click(screen.getByRole("button", { name: "AI-варианты" }));
    await screen.findByRole("region", { name: "Предлагаемые AI варианты" });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Добавить как новое задание" })[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      id: "a1",
      aiGenerated: true,
      aiReviewed: false,
    });
    expect(screen.queryByRole("region", { name: "Предлагаемые AI варианты" })).toBeNull();
  });

  it("replaces only the selected task and preserves its points, goal, and criteria", async () => {
    const original = mcq("task-1", "Исходный вопрос", {
      points: 4,
      objectiveCode: "5.1.2.1",
      criterionTexts: ["Сравнивает дроби"],
      aiGenerated: true,
      aiReviewed: true,
    });
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      mcq("variant-1", "Более простой вопрос", { points: 1, objectiveCode: "other" }),
      mcq("variant-2", "Другой короткий вопрос", { points: 1 }),
    ])));
    render(<TaskBuilder tasks={[original]} onChange={onChange} context={context} />);

    fireEvent.click(screen.getAllByRole("button", { name: "AI-варианты" })[1]);
    await screen.findByRole("region", { name: "Альтернативы текущего задания" });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Заменить после проверки" })[0]);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      id: "task-1",
      question: "Более простой вопрос",
      points: 4,
      objectiveCode: "5.1.2.1",
      criterionTexts: ["Сравнивает дроби"],
      aiGenerated: true,
      aiReviewed: false,
    });
  });

  it("copies an owned task independently and warns about grade, language, and objective mismatches", async () => {
    const original = mcq("source-task", "Копируемое задание", { objectiveCode: "4.1.1.1" });
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ blocks: [{
        id: "source-plan:task:middle:source-task",
        kind: "task",
        source: { planId: "507f1f77bcf86cd799439011", title: "План-источник", grade: 4, language: "kz", topic: "Дроби", stageKey: "middle", objectiveCodes: ["4.1.1.1"] },
        preview: original.question,
        payload: original,
      }] }),
    }));
    render(<TaskBuilder tasks={[]} onChange={onChange} context={context} availableObjectives={[{ code: "5.1.2.1", text: "Цель" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "Взять из моих КСП" }));
    await screen.findByRole("region", { name: /Выбрать блок из своих планов/ });
    expect(await screen.findByText("Источник подготовлен для другого класса.")).toBeTruthy();
    expect(screen.getByText("Язык исходного плана отличается.")).toBeTruthy();
    expect(screen.getByText("Цель задания может не совпадать с целями текущего КСП.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Использовать независимую копию" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const copied = onChange.mock.calls[0][0][0] as InteractiveTask;
    expect(copied.id).not.toBe("source-task");
    expect(copied.question).toBe(original.question);
    expect(copied.copiedFrom).toMatchObject({ sourcePlanId: "507f1f77bcf86cd799439011", sourcePlanTitle: "План-источник", blockKind: "task", sourceStage: "middle" });
  });

  it("shows source presence separately from review and resets the review after an edit", async () => {
    const original = mcq("task-reviewed", "Проверенный вопрос", {
      aiGenerated: true,
      aiReviewed: false,
    });
    function Harness() {
      const [tasks, setTasks] = React.useState<InteractiveTask[]>([original]);
      return <TaskBuilder tasks={tasks} onChange={setTasks} context={context} />;
    }
    render(<Harness />);

    expect(screen.getByText("Источники не указаны; ручная проверка — отдельная отметка.")).toBeTruthy();
    const reviewCheckbox = screen.getByRole("checkbox", { name: "Я проверил(а) содержание" });
    fireEvent.click(reviewCheckbox);
    await screen.findByText("Отмечено как проверенное");

    fireEvent.change(screen.getByLabelText("Вопрос / инструкция"), { target: { value: "Изменённый вопрос" } });
    await screen.findByText("Нужно проверить учителю");
    expect((screen.getByRole("checkbox", { name: "Я проверил(а) содержание" }) as HTMLInputElement).checked).toBe(false);
  });
});
