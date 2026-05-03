import {
  type InteractiveTask,
  type McqTask,
  type TrueFalseTask,
  type FillBlankTask,
  type OrderingTask,
  type NumericTask,
  type TaskType,
  emptyTask,
} from "@/lib/ksp/tasks";
import { completeJson, isAiConfigured } from "./client";

export interface GenerateTasksInput {
  topic: string;
  grade: number;
  subject: string;
  stage: "beginning" | "middle" | "end";
  language: "ru" | "kz";
  count?: number;
}

const OPENAI_TASKS_SCHEMA = {
  name: "interactive_tasks",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["tasks"],
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "question", "hint", "points", "payload"],
          properties: {
            type: {
              type: "string",
              enum: [
                "MCQ",
                "TRUE_FALSE",
                "SHORT_ANSWER",
                "FILL_BLANK",
                "ORDERING",
                "NUMERIC",
              ],
            },
            question: { type: "string" },
            hint: { type: "string" },
            points: { type: "integer" },
            payload: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
    },
  },
} as const;

type RawTask = {
  type: TaskType;
  question: string;
  hint?: string;
  points?: number;
  payload: Record<string, unknown>;
};

function materialize(raw: RawTask): InteractiveTask {
  const t = emptyTask(raw.type);
  t.question = raw.question || t.question;
  t.points = raw.points ?? t.points;
  if (raw.hint) t.hint = raw.hint;

  switch (t.type) {
    case "MCQ": {
      const options = Array.isArray(raw.payload.options)
        ? (raw.payload.options as string[]).filter((x) => typeof x === "string")
        : t.options;
      const correctIndex =
        typeof raw.payload.correctIndex === "number"
          ? Math.max(0, Math.min(options.length - 1, raw.payload.correctIndex))
          : 0;
      return { ...t, options: options.length >= 2 ? options : t.options, correctIndex };
    }
    case "TRUE_FALSE": {
      return { ...t, correct: raw.payload.correct !== false };
    }
    case "SHORT_ANSWER": {
      const answers = Array.isArray(raw.payload.acceptedAnswers)
        ? (raw.payload.acceptedAnswers as string[]).filter(
            (x) => typeof x === "string" && x.trim() !== "",
          )
        : t.acceptedAnswers;
      return { ...t, acceptedAnswers: answers.length > 0 ? answers : [""] };
    }
    case "FILL_BLANK": {
      const template =
        typeof raw.payload.template === "string"
          ? raw.payload.template
          : t.template;
      const answers = Array.isArray(raw.payload.answers)
        ? (raw.payload.answers as string[]).filter((x) => typeof x === "string")
        : t.answers;
      return { ...t, template, answers: answers.length > 0 ? answers : [""] };
    }
    case "ORDERING": {
      const items = Array.isArray(raw.payload.items)
        ? (raw.payload.items as string[]).filter((x) => typeof x === "string")
        : t.items;
      return {
        ...t,
        items: items.length >= 2 ? items : t.items,
        correctOrder: items.map((_, i) => i),
      };
    }
    case "MATCHING":
      return t;
    case "NUMERIC": {
      const answer =
        typeof raw.payload.answer === "number" ? raw.payload.answer : 0;
      const tolerance =
        typeof raw.payload.tolerance === "number"
          ? Math.max(0, raw.payload.tolerance)
          : 0;
      const unit =
        typeof raw.payload.unit === "string" && raw.payload.unit.trim()
          ? raw.payload.unit
          : undefined;
      return { ...t, answer, tolerance, unit };
    }
  }
}

export async function generateTasks(
  input: GenerateTasksInput,
): Promise<InteractiveTask[]> {
  const count = input.count ?? 3;
  if (!isAiConfigured()) {
    return stubTasks(input, count);
  }

  const stageName =
    input.stage === "beginning"
      ? "начала урока (разминка, актуализация)"
      : input.stage === "middle"
        ? "середины урока (работа с новым материалом, тренировка)"
        : "конца урока (закрепление, рефлексия)";

  const system =
    input.language === "kz"
      ? "Сен оқушыларға арналған интерактивті тапсырмаларды JSON форматында жасайсың."
      : "Ты помощник учителя в Казахстане. Составь интерактивные задания к этапу урока в виде JSON.";
  const user = `Тема урока: «${input.topic}»
Предмет: ${input.subject}
Класс: ${input.grade}
Этап: ${stageName}
Количество заданий: ${count}

Разрешённые типы: MCQ (4 варианта), TRUE_FALSE, SHORT_ANSWER, FILL_BLANK, ORDERING, NUMERIC.
Для каждого задания укажи тип, вопрос, подсказку (hint), баллы (1–5) и payload по схеме:
- MCQ: { options: string[], correctIndex: number }
- TRUE_FALSE: { correct: boolean }
- SHORT_ANSWER: { acceptedAnswers: string[] }
- FILL_BLANK: { template: "... ___ ...", answers: string[] }
- ORDERING: { items: string[] }  // элементы уже в правильном порядке
- NUMERIC: { answer: number, tolerance: number, unit?: string }
Предпочтительно разнообразь типы заданий. Для NUMERIC используй реальные вычисления по теме.
Верни ровно ${count} заданий.`;

  const parsed = await completeJson<{ tasks: RawTask[] }>({
    system,
    user,
    schema: OPENAI_TASKS_SCHEMA.schema,
    schemaName: OPENAI_TASKS_SCHEMA.name,
    temperature: 0.7,
  });
  return parsed.tasks.map(materialize);
}

function stubTasks(input: GenerateTasksInput, count: number): InteractiveTask[] {
  const mcq: McqTask = {
    ...(emptyTask("MCQ") as McqTask),
    question: `Что лучше всего описывает ключевую идею темы «${input.topic}»?`,
    options: [
      `${input.topic} — это один из центральных разделов предмета «${input.subject}».`,
      "Это второстепенная тема, не связанная с другими разделами.",
      "Эта тема рассматривается только во внеурочной деятельности.",
      "Тема не относится к учебной программе.",
    ],
    correctIndex: 0,
    hint: "Обратите внимание, как тема связана с другими разделами предмета.",
  };
  const tf: TrueFalseTask = {
    ...(emptyTask("TRUE_FALSE") as TrueFalseTask),
    question: `Тема «${input.topic}» изучается в ${input.grade} классе.`,
    correct: true,
    hint: "Проверьте учебную программу своего класса.",
  };
  const fb: FillBlankTask = {
    ...(emptyTask("FILL_BLANK") as FillBlankTask),
    question: "Заполните пропуск в определении.",
    template: `${input.topic} — это важное понятие предмета «___».`,
    answers: [input.subject],
    hint: "Название предмета, в рамках которого изучается тема.",
  };
  const ordering: OrderingTask = {
    ...(emptyTask("ORDERING") as OrderingTask),
    question: "Расставьте этапы работы с новой темой в правильном порядке.",
    items: [
      "Постановка цели урока",
      "Изучение нового материала",
      "Тренировочные задания",
      "Рефлексия и итоги",
    ],
    correctOrder: [0, 1, 2, 3],
    hint: "Сначала цель, затем материал, затем практика, в конце — итоги.",
  };
  const numeric: NumericTask = {
    ...(emptyTask("NUMERIC") as NumericTask),
    question: `Сколько ключевых понятий встречается в теме «${input.topic}»? (введите примерное число)`,
    answer: 3,
    tolerance: 1,
    hint: "Обычно 2–4 основных понятия.",
  };
  const tasks: InteractiveTask[] = [mcq, tf, fb, ordering, numeric];
  return tasks.slice(0, Math.min(count, tasks.length));
}
