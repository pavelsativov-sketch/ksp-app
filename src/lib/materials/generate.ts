import { z } from "zod";
import { executeWithFallback, isAnyProviderConfigured } from "@/lib/ai/providers";
import { extractJson } from "@/lib/ai/extract-json";
import { emptyTask, type McqTask } from "@/lib/ksp/tasks";
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
