import { z } from "zod";
import { executeWithFallback, isAnyProviderConfigured } from "@/lib/ai/providers";
import { extractJson } from "@/lib/ai/extract-json";
import { emptyTask, type InteractiveTask, type McqTask } from "@/lib/ksp/tasks";
import { interactiveTaskSchema } from "@/lib/validation/ksp";
import type { InteractiveFormat } from "./interactive-formats";
import type { LessonPlanRow } from "@/lib/types/ksp";

export const MIN_CHOICES = 5;
export const MAX_CHOICES = 10;

export const speechSchema = z.object({
  stages: z
    .array(
      z.object({
        stage: z.enum(["beginning", "middle", "end"]),
        time: z.string().default(""),
        lines: z
          .array(z.object({ say: z.string().trim().min(1), action: z.string().trim().optional(), expected: z.string().trim().optional() }))
          .min(1)
          .max(20),
      }),
    )
    .min(1)
    .max(3),
});
export type TeacherSpeech = z.infer<typeof speechSchema>;

const choiceSchema = z.object({
  steps: z.array(
    z.object({
      question: z.string().trim().min(1),
      options: z.array(z.string().trim().min(1)).min(3).max(4),
      correctIndex: z.coerce.number().int().min(0),
      hint: z.string().trim().optional(),
    }),
  ),
});

const STAGE_TITLES = { beginning: "Начало урока", middle: "Середина урока", end: "Конец урока" } as const;

/** Краткая выжимка плана для запроса: только то, на что опирается материал. */
function planBrief(plan: LessonPlanRow): string {
  const c = plan.content;
  const objectives = [...c.learningObjectives.map((o) => `${o.code} — ${o.text}`), ...c.lessonObjectives];
  const stages = (["beginning", "middle", "end"] as const).map((key) => {
    const s = c.stages[key];
    return `${STAGE_TITLES[key]} (${s.time || "время не указано"}): учитель — ${s.teacherActions || "—"}; ученики — ${s.studentActions || "—"}${s.keyQuestions?.length ? `; ключевые вопросы: ${s.keyQuestions.join(" | ")}` : ""}`;
  });
  return [
    `Класс: ${plan.grade}. Язык: ${plan.language === "kz" ? "казахский" : "русский"}.`,
    `Тема: ${c.topic || plan.title}.`,
    `Цели:\n${objectives.map((o) => `- ${o}`).join("\n") || "- не указаны"}`,
    `Критерии оценивания:\n${c.assessmentCriteria.map((o) => `- ${o}`).join("\n") || "- не указаны"}`,
    `Ход урока:\n${stages.join("\n")}`,
  ].join("\n");
}

async function askJson<T>(schema: z.ZodType<T>, system: string, user: string): Promise<T> {
  if (!isAnyProviderConfigured()) throw new Error("Не настроен AI-провайдер");
  return executeWithFallback("generation", async (client, model, config, signal) => {
    const response = await client.chat.completions.create(
      {
        model,
        temperature: config.temperature ?? 0.7,
        max_completion_tokens: config.maxTokens ?? 8192,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      },
      { signal },
    );
    const choice = response.choices[0];
    const raw = choice?.message.content;
    if (!raw?.trim()) throw new Error("AI вернул пустой ответ");
    if (choice?.finish_reason === "length") throw new Error("AI оборвал ответ: материал не дописан");
    const parsed = schema.safeParse(extractJson<unknown>(raw));
    if (!parsed.success) throw new Error(`AI вернул некорректный материал: ${parsed.error.issues[0]?.message ?? "ошибка схемы"}`);
    return parsed.data;
  });
}

/** Слова педагога: живая речь учителя по этапам, а не пересказ полей плана. */
export function generateTeacherSpeech(plan: LessonPlanRow): Promise<TeacherSpeech> {
  const system = `Ты опытный методист и учитель. Пиши ровно то, что учитель ГОВОРИТ вслух на уроке: обращения к классу, объяснения простыми словами, вопросы ученикам, переходы между этапами, похвала, подведение итога. Не пересказывай план, а проговаривай его живой речью. Отвечай только JSON.`;
  const user = `${planBrief(plan)}

Составь слова педагога по трём этапам. Для каждого этапа 5–12 реплик. Реплика — объект {"say": "что говорит учитель", "action": "что делает или показывает (необязательно)", "expected": "ожидаемый ответ учеников (необязательно)"}.
Формат ответа: {"stages":[{"stage":"beginning"|"middle"|"end","time":"0–5 мин","lines":[...]}]}. Говори на языке плана, учитывай возраст класса.`;
  return askJson(speechSchema, system, user);
}

/** Интерактив: цепочка из 5–10 выборов, готовая выдаваться ученикам как задания. */
export async function generateChoiceTasks(plan: LessonPlanRow, count: number): Promise<McqTask[]> {
  const wanted = Math.min(Math.max(Math.round(count), MIN_CHOICES), MAX_CHOICES);
  const system = `Ты методист. Составляешь интерактив для школьников: серию вопросов с выбором одного верного варианта. Ответы должны проверяться однозначно, неверные варианты правдоподобны. Отвечай только JSON.`;
  const user = `${planBrief(plan)}

Составь ровно ${wanted} вопросов с выбором ответа по теме урока: от простых к сложным, каждый вопрос на цель урока. У каждого 3–4 варианта, один верный.
Формат: {"steps":[{"question":"…","options":["…","…","…"],"correctIndex":0,"hint":"короткая подсказка без ответа"}]}.`;
  const { steps } = await askJson(choiceSchema, system, user);
  const valid = steps.filter((s) => s.correctIndex < s.options.length);
  if (valid.length < MIN_CHOICES) throw new Error("AI составил слишком мало корректных вопросов");
  return valid.slice(0, wanted).map((s) => ({
    ...(emptyTask("MCQ") as McqTask),
    question: s.question,
    options: s.options,
    correctIndex: s.correctIndex,
    ...(s.hint ? { hint: s.hint } : {}),
    shuffle: true,
    aiGenerated: true,
    aiReviewed: false,
  }));
}

type RawStep = Record<string, unknown>;
const stepsSchema = z.object({ steps: z.array(z.record(z.string(), z.unknown())).min(1) });

const FORMAT_PROMPTS: Record<Exclude<InteractiveFormat, "live" | "mcq">, { what: string; shape: string }> = {
  truefalse: {
    what: "утверждений «верно или неверно»: примерно половина верных, половина с правдоподобной ошибкой",
    shape: '{"question":"утверждение","correct":true,"hint":"подсказка"}',
  },
  fill: {
    what: "предложений с пропусками: пропущено ключевое понятие или результат",
    shape: '{"question":"короткая инструкция","template":"предложение, где пропуск обозначен ___","answers":["ответ на каждый пропуск по порядку"],"hint":"подсказка"}',
  },
  match: {
    what: "наборов «найди пары», в каждом 4–6 пар: термин и определение или выражение и результат",
    shape: '{"question":"Соедини термин и определение","pairs":[{"left":"термин","right":"определение"}],"hint":"подсказка"}',
  },
  order: {
    what: "заданий «расставь по порядку», в каждом 4–6 шагов алгоритма или этапов процесса",
    shape: '{"question":"Расставь шаги по порядку","items":["шаги строго в ВЕРНОМ порядке"],"hint":"подсказка"}',
  },
};

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const textList = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

/** Собирает задание из ответа модели. Порядок правых колонок и шагов перемешиваем сами: модели это не доверить. */
export function buildFormatTask(format: Exclude<InteractiveFormat, "live" | "mcq">, step: RawStep): InteractiveTask | null {
  const hint = text(step.hint);
  const common = { question: text(step.question), ...(hint ? { hint } : {}), aiGenerated: true, aiReviewed: false };
  let task: unknown = null;
  if (format === "truefalse" && typeof step.correct === "boolean") {
    task = { ...emptyTask("TRUE_FALSE"), ...common, correct: step.correct };
  }
  if (format === "fill") {
    const template = text(step.template);
    const answers = textList(step.answers);
    const blanks = template.match(/_{3,}/g)?.length ?? 0;
    if (answers.length > 0 && blanks === answers.length) {
      task = { ...emptyTask("FILL_BLANK"), ...common, question: common.question || "Заполни пропуск", template, answers };
    }
  }
  if (format === "match" && Array.isArray(step.pairs)) {
    const pairs = (step.pairs as RawStep[]).map((pair) => ({ left: text(pair?.left), right: text(pair?.right) })).filter((pair) => pair.left && pair.right);
    if (pairs.length >= 2) {
      const right = shuffled(pairs.map((pair) => pair.right));
      task = {
        ...emptyTask("MATCHING"),
        ...common,
        points: 2,
        left: pairs.map((pair) => pair.left),
        right,
        pairs: pairs.map((pair, leftIndex) => ({ leftIndex, rightIndex: right.indexOf(pair.right) })),
      };
    }
  }
  if (format === "order") {
    const steps = textList(step.items);
    if (steps.length >= 3) {
      const items = shuffled(steps);
      task = { ...emptyTask("ORDERING"), ...common, points: 2, items, correctOrder: steps.map((value) => items.indexOf(value)) };
    }
  }
  const parsed = interactiveTaskSchema.safeParse(task);
  return parsed.success ? (parsed.data as InteractiveTask) : null;
}

/** Интерактив выбранного формата: каждый формат даёт свой тип заданий. */
export async function generateInteractiveTasks(plan: LessonPlanRow, format: InteractiveFormat, count: number): Promise<InteractiveTask[]> {
  if (format === "live" || format === "mcq") return generateChoiceTasks(plan, count);
  const { what, shape } = FORMAT_PROMPTS[format];
  const system = "Ты методист. Составляешь интерактивные задания для школьников на языке плана. Каждое задание опирается на содержание урока и проверяется однозначно. Перед ответом сам реши задание и проверь ключ. Отвечай только JSON.";
  const user = `${planBrief(plan)}

Составь ровно ${count} ${what}. От простого к сложному, каждое задание на цель урока.
Формат: {"steps":[${shape}]}.`;
  const { steps } = await askJson(stepsSchema, system, user);
  const tasks = steps.map((step) => buildFormatTask(format, step)).filter((task): task is InteractiveTask => task !== null);
  if (tasks.length === 0) throw new Error("AI не составил ни одного корректного задания");
  return tasks.slice(0, count);
}
