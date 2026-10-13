// @vitest-environment jsdom
import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StageEditor } from "@/components/ksp/stage-editor";
import { emptyKsp } from "@/lib/types/ksp";
import type { LessonStage } from "@/lib/types/ksp";

vi.mock("@/components/i18n/use-ui-locale", () => ({
  useUiLocale: () => ({ locale: "ru", t: { planEditor: { stages: {
    kicker: "ХОД УРОКА", timeBeginning: "0–5 мин", timeMiddle: "5–35 мин", timeEnd: "35–40 мин",
    teacherWords: "Действия учителя", studentActions: "Действия учеников", resources: "Ресурсы",
    questions: "Вопросы", questionsHint: "для обсуждения", descriptors: "Дескрипторы", descriptorsHint: "наблюдаемые действия",
    assessmentMethod: "Метод оценивания", methodNone: "Не выбран", methodPraise: "Похвала", methodFo: "ФО",
    methodSor: "СОР", methodPeer: "Взаимооценивание", methodSelf: "Самооценивание", methodFoPeer: "ФО + взаимная оценка",
    methodPh: "Выберите метод", teacherWordsPh: "Учитель объясняет", studentActionsPh: "Ученики выполняют",
    resourcesPh: "Материалы", qBeginPh: "Вопрос", qEndPh: "Рефлексия", qMiddlePh: "Обсуждение",
    descriptorsPh: "Дескриптор", summary: "Итог", summaryPh: "Итог урока", reflectionQuestions: "Рефлексия",
    reflectionHint: "вопросы", reflectionPh: "Что нового?", homework: "Домашнее задание", homeworkPh: "Упражнение",
  } } } }),
}));
vi.mock("@/components/ksp/ai-enhance-button", () => ({ AiEnhanceButton: () => null }));
vi.mock("@/components/ksp/task-builder", () => ({ TaskBuilder: () => null }));
vi.mock("@/components/ksp/list-editor", () => ({ ListEditor: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("copies a selected source stage and regenerates nested task ids", async () => {
  const sourceStage: LessonStage = {
    time: "5–15 мин",
    teacherActions: "Исследовать закономерность",
    studentActions: "Работают в парах",
    resources: "Карточки",
    tasks: [{ id: "source-task", type: "MCQ", question: "Выбери дробь", points: 2, options: ["1/2", "1/3"], correctIndex: 0 }],
    keyQuestions: ["Почему?"],
    descriptors: ["Объясняет ответ"],
    assessmentMethod: "ФО",
  };
  const onChange = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ blocks: [{
      id: "507f1f77bcf86cd799439011:stage:middle",
      kind: "stage",
      source: { planId: "507f1f77bcf86cd799439011", title: "Источник", grade: 5, language: "ru", topic: "Дроби", stageKey: "middle", objectiveCodes: ["5.1.2.1"] },
      preview: "Исследовать закономерность · Работают в парах",
      payload: sourceStage,
    }] }),
  }));
  render(<StageEditor title="Начало урока" stageKey="beginning" stage={emptyKsp().stages.beginning} onChange={onChange} context={{ topic: "Дроби", grade: 5, subject: "Математика", language: "ru" }} availableObjectives={[]} />);

  fireEvent.click(screen.getByRole("button", { name: "Взять из моих КСП" }));
  await screen.findByRole("region", { name: /Выбрать блок из своих планов/ });
  fireEvent.click(await screen.findByRole("button", { name: "Использовать независимую копию" }));

  expect(onChange).toHaveBeenCalledOnce();
  const copied = onChange.mock.calls[0][0] as LessonStage;
  expect(copied).toMatchObject({ teacherActions: sourceStage.teacherActions, copiedFrom: { sourcePlanId: "507f1f77bcf86cd799439011", blockKind: "stage", sourceStage: "middle" } });
  expect(copied.tasks).toHaveLength(1);
  expect(copied.tasks?.[0].id).not.toBe("source-task");
  expect(copied.tasks?.[0].copiedFrom?.blockKind).toBe("stage");
});
