/**
 * Interactive classroom tasks attached to lesson stages.
 *
 * Tasks live inside `KspContent.stages[*].tasks` (JSON inside `lesson_plans.content`).
 * Future phases (student assignment / BilimClass sync) will add a separate
 * `interactive_task_attempts` table; the task shape here is designed to port.
 */

export type TaskType =
  | "MCQ" // single-choice multiple-choice
  | "TRUE_FALSE"
  | "SHORT_ANSWER"
  | "FILL_BLANK"
  | "MATCHING"
  | "ORDERING";

export interface BaseTask {
  id: string;
  type: TaskType;
  question: string;
  hint?: string;
  points: number;
  objectiveCode?: string;
}

export interface McqTask extends BaseTask {
  type: "MCQ";
  options: string[];
  /** Index of the correct option in `options`. */
  correctIndex: number;
}

export interface TrueFalseTask extends BaseTask {
  type: "TRUE_FALSE";
  correct: boolean;
}

export interface ShortAnswerTask extends BaseTask {
  type: "SHORT_ANSWER";
  /** Accepted answers (case-insensitive, trimmed, any match wins). */
  acceptedAnswers: string[];
}

export interface FillBlankTask extends BaseTask {
  type: "FILL_BLANK";
  /** Full sentence with `___` placeholders marking the blanks. */
  template: string;
  /** Ordered expected fillers (one per blank, case-insensitive). */
  answers: string[];
}

export interface MatchingTask extends BaseTask {
  type: "MATCHING";
  left: string[];
  right: string[];
  /** Mapping from left-index to right-index (correct pairing). */
  pairs: Array<{ leftIndex: number; rightIndex: number }>;
}

export interface OrderingTask extends BaseTask {
  type: "ORDERING";
  items: string[];
  /** Correct order expressed as indices into `items`. */
  correctOrder: number[];
}

export type InteractiveTask =
  | McqTask
  | TrueFalseTask
  | ShortAnswerTask
  | FillBlankTask
  | MatchingTask
  | OrderingTask;

export type TaskAnswer =
  | { type: "MCQ"; selectedIndex: number | null }
  | { type: "TRUE_FALSE"; selected: boolean | null }
  | { type: "SHORT_ANSWER"; text: string }
  | { type: "FILL_BLANK"; fillers: string[] }
  | { type: "MATCHING"; pairs: Array<{ leftIndex: number; rightIndex: number }> }
  | { type: "ORDERING"; order: number[] };

export interface TaskResult {
  isCorrect: boolean;
  score: number;
  maxScore: number;
  feedback: string;
}

function norm(s: string): string {
  return s.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

export function evaluateTask(task: InteractiveTask, answer: TaskAnswer): TaskResult {
  const maxScore = Math.max(1, task.points);
  if (task.type !== answer.type) {
    return {
      isCorrect: false,
      score: 0,
      maxScore,
      feedback: "Неверный формат ответа",
    };
  }

  switch (task.type) {
    case "MCQ": {
      const a = answer as Extract<TaskAnswer, { type: "MCQ" }>;
      const ok = a.selectedIndex === task.correctIndex;
      return {
        isCorrect: ok,
        score: ok ? maxScore : 0,
        maxScore,
        feedback: ok
          ? "Верно!"
          : `Неверно. Правильный ответ: «${task.options[task.correctIndex]}».`,
      };
    }
    case "TRUE_FALSE": {
      const a = answer as Extract<TaskAnswer, { type: "TRUE_FALSE" }>;
      const ok = a.selected === task.correct;
      return {
        isCorrect: ok,
        score: ok ? maxScore : 0,
        maxScore,
        feedback: ok ? "Верно!" : `Неверно. Правильный ответ: «${task.correct ? "Верно" : "Неверно"}».`,
      };
    }
    case "SHORT_ANSWER": {
      const a = answer as Extract<TaskAnswer, { type: "SHORT_ANSWER" }>;
      const user = norm(a.text);
      const ok = task.acceptedAnswers.some((x) => norm(x) === user);
      return {
        isCorrect: ok,
        score: ok ? maxScore : 0,
        maxScore,
        feedback: ok
          ? "Верно!"
          : `Неверно. Ожидаемый ответ: «${task.acceptedAnswers[0] ?? ""}».`,
      };
    }
    case "FILL_BLANK": {
      const a = answer as Extract<TaskAnswer, { type: "FILL_BLANK" }>;
      if (a.fillers.length !== task.answers.length) {
        return {
          isCorrect: false,
          score: 0,
          maxScore,
          feedback: "Заполните все пропуски",
        };
      }
      const correct = task.answers.filter((exp, i) => norm(exp) === norm(a.fillers[i] ?? "")).length;
      const ok = correct === task.answers.length;
      const score = Math.round((correct / task.answers.length) * maxScore);
      return {
        isCorrect: ok,
        score,
        maxScore,
        feedback: ok
          ? "Все пропуски заполнены верно!"
          : `Правильно: ${correct} из ${task.answers.length}. Ожидалось: ${task.answers.map((x) => `«${x}»`).join(", ")}.`,
      };
    }
    case "MATCHING": {
      const a = answer as Extract<TaskAnswer, { type: "MATCHING" }>;
      const expected = new Map(task.pairs.map((p) => [p.leftIndex, p.rightIndex]));
      const matched = a.pairs.filter((p) => expected.get(p.leftIndex) === p.rightIndex).length;
      const ok = matched === task.pairs.length && a.pairs.length === task.pairs.length;
      const score = Math.round((matched / Math.max(1, task.pairs.length)) * maxScore);
      return {
        isCorrect: ok,
        score,
        maxScore,
        feedback: ok
          ? "Все пары соотнесены верно!"
          : `Правильно соотнесено: ${matched} из ${task.pairs.length}.`,
      };
    }
    case "ORDERING": {
      const a = answer as Extract<TaskAnswer, { type: "ORDERING" }>;
      const ok =
        a.order.length === task.correctOrder.length &&
        a.order.every((v, i) => v === task.correctOrder[i]);
      const correctPlaces = task.correctOrder.reduce(
        (acc, v, i) => acc + (a.order[i] === v ? 1 : 0),
        0,
      );
      const score = Math.round((correctPlaces / Math.max(1, task.correctOrder.length)) * maxScore);
      return {
        isCorrect: ok,
        score,
        maxScore,
        feedback: ok
          ? "Правильная последовательность!"
          : `На своих местах: ${correctPlaces} из ${task.correctOrder.length}.`,
      };
    }
  }
}

export function emptyTask(type: TaskType): InteractiveTask {
  const id = `t_${Math.random().toString(36).slice(2, 10)}`;
  const base = { id, points: 1 as number };
  switch (type) {
    case "MCQ":
      return { ...base, type, question: "", options: ["", "", "", ""], correctIndex: 0 };
    case "TRUE_FALSE":
      return { ...base, type, question: "", correct: true };
    case "SHORT_ANSWER":
      return { ...base, type, question: "", acceptedAnswers: [""] };
    case "FILL_BLANK":
      return { ...base, type, question: "", template: "Пример: сумма чисел 2 и 3 равна ___.", answers: [""] };
    case "MATCHING":
      return { ...base, type, question: "", left: ["", ""], right: ["", ""], pairs: [{ leftIndex: 0, rightIndex: 0 }, { leftIndex: 1, rightIndex: 1 }] };
    case "ORDERING":
      return { ...base, type, question: "", items: ["", "", ""], correctOrder: [0, 1, 2] };
  }
}

export function taskTypeLabel(t: TaskType): string {
  switch (t) {
    case "MCQ": return "Выбор одного ответа";
    case "TRUE_FALSE": return "Верно / неверно";
    case "SHORT_ANSWER": return "Короткий ответ";
    case "FILL_BLANK": return "Заполни пропуск";
    case "MATCHING": return "Соотнесение";
    case "ORDERING": return "Расстановка по порядку";
  }
}
