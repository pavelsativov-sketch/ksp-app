import { z } from "zod";

const MAX_TEXT_LENGTH = 5_000;
const MAX_LIST_ITEMS = 50;
const text = z.string().trim().max(MAX_TEXT_LENGTH);
const nonEmptyText = text.min(1);
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Некорректный идентификатор");
const provenanceSchema = z.object({
  sourcePlanId: objectId,
  sourcePlanTitle: text.max(300),
  sourceGrade: z.number().int().min(1).max(11),
  sourceLanguage: z.enum(["ru", "kz"]),
  blockKind: z.enum(["stage", "task", "criterion"]),
  sourceStage: z.enum(["beginning", "middle", "end"]).optional(),
  copiedAt: z.string().datetime(),
});

const taskBase = {
  id: z.string().trim().min(1).max(100),
  question: nonEmptyText,
  // AI присылает null для пустых опциональных полей — нормализуем в undefined,
  // чтобы тип совпадал с InteractiveTask.
  hint: text.nullish().transform((v) => v ?? undefined),
  points: z.number().int().min(1).max(100).default(1),
  objectiveCode: text.max(100).nullish().transform((v) => v ?? undefined),
  criterionTexts: z.array(text).max(50).optional(),
  differentiationLevel: z.enum(["A", "B", "C"]).nullish().transform((v) => v ?? undefined),
  aiGenerated: z.boolean().optional(),
  aiReviewed: z.boolean().optional(),
  copiedFrom: provenanceSchema.optional(),
  timeLimitSec: z.number().int().min(0).max(3600).optional(),
  shuffle: z.boolean().optional(),
};

export const interactiveTaskSchema = z.discriminatedUnion("type", [
  z.object({ ...taskBase, type: z.literal("MCQ"), options: z.array(nonEmptyText).min(2).max(10), correctIndex: z.number().int().min(0) }).superRefine((task, ctx) => {
    if (task.correctIndex >= task.options.length) ctx.addIssue({ code: "custom", path: ["correctIndex"], message: "Правильный вариант вне списка" });
  }),
  z.object({ ...taskBase, type: z.literal("TRUE_FALSE"), correct: z.boolean() }),
  z.object({ ...taskBase, type: z.literal("SHORT_ANSWER"), acceptedAnswers: z.array(nonEmptyText).min(1).max(20) }),
  z.object({ ...taskBase, type: z.literal("FILL_BLANK"), template: nonEmptyText, answers: z.array(nonEmptyText).min(1).max(20) }).superRefine((task, ctx) => {
    if ((task.template.match(/___/g) ?? []).length !== task.answers.length) ctx.addIssue({ code: "custom", path: ["answers"], message: "Количество ответов должно совпадать с пропусками" });
  }),
  z.object({ ...taskBase, type: z.literal("MATCHING"), left: z.array(nonEmptyText).min(2).max(20), right: z.array(nonEmptyText).min(2).max(20), pairs: z.array(z.object({ leftIndex: z.number().int().min(0), rightIndex: z.number().int().min(0) })).min(2).max(20) }).superRefine((task, ctx) => {
    const left = new Set<number>(); const right = new Set<number>();
    for (const pair of task.pairs) {
      if (pair.leftIndex >= task.left.length || pair.rightIndex >= task.right.length || left.has(pair.leftIndex) || right.has(pair.rightIndex)) ctx.addIssue({ code: "custom", path: ["pairs"], message: "Пары должны однозначно покрывать все варианты" });
      left.add(pair.leftIndex); right.add(pair.rightIndex);
    }
    if (left.size !== task.left.length || right.size !== task.right.length || task.left.length !== task.right.length) ctx.addIssue({ code: "custom", path: ["pairs"], message: "Пары должны однозначно покрывать все варианты" });
  }),
  z.object({ ...taskBase, type: z.literal("ORDERING"), items: z.array(nonEmptyText).min(2).max(20), correctOrder: z.array(z.number().int().min(0)).min(2).max(20) }).superRefine((task, ctx) => {
    const valid = task.correctOrder.length === task.items.length && new Set(task.correctOrder).size === task.items.length && task.correctOrder.every((index) => index < task.items.length);
    if (!valid) ctx.addIssue({ code: "custom", path: ["correctOrder"], message: "Порядок должен содержать каждый элемент ровно один раз" });
  }),
  z.object({ ...taskBase, type: z.literal("NUMERIC"), answer: z.number().finite(), tolerance: z.number().finite().min(0).max(1_000_000).nullish().transform((v) => v ?? 0), unit: text.max(100).nullish().transform((v) => v ?? undefined) }),
]);

const stageSchema = z.object({
  time: text.default(""),
  teacherActions: text.default(""),
  studentActions: text.default(""),
  resources: text.default(""),
  tasks: z.array(interactiveTaskSchema).max(20).default([]),
  copiedFrom: provenanceSchema.optional(),
  keyQuestions: z.array(text).max(MAX_LIST_ITEMS).default([]),
  descriptors: z.array(text).max(MAX_LIST_ITEMS).default([]),
  assessmentMethod: text.default(""),
  homework: text.default(""),
  summary: text.default(""),
  reflectionQuestions: z.array(text).max(MAX_LIST_ITEMS).default([]),
});

const headerSchema = z.object({
  longTermPlanSection: text.default(""), school: text.default(""), date: text.max(100).default(""),
  teacherName: text.max(300).default(""), grade: text.max(100).default(""),
  studentsPresent: z.number().int().min(0).max(10_000).nullable().default(null),
  studentsAbsent: z.number().int().min(0).max(10_000).nullable().default(null),
});

export const kspContentSchema = z.object({
  schoolProfile: z.enum(["emn", "ogn"]).optional(),
  qualityTargets: z.object({
    durationMinutes: z.number().int().min(10).max(180).optional(),
    taskPoints: z.number().int().min(1).max(100).optional(),
  }).optional(),
  header: headerSchema,
  topic: nonEmptyText,
  learningObjectives: z.array(z.object({ code: text.max(100), text: text })).max(MAX_LIST_ITEMS).default([]),
  lessonObjectives: z.array(text).max(MAX_LIST_ITEMS).default([]),
  assessmentCriteria: z.array(text).max(MAX_LIST_ITEMS).default([]),
  assessmentCriterionSources: z.array(z.object({ criterion: nonEmptyText, provenance: provenanceSchema })).max(MAX_LIST_ITEMS).optional(),
  languageObjectives: z.object({ terms: z.array(text).max(MAX_LIST_ITEMS).default([]), phrases: z.array(text).max(MAX_LIST_ITEMS).default([]) }).default({ terms: [], phrases: [] }),
  values: text.default(""), crossCurricularLinks: text.default(""), priorKnowledge: text.default(""),
  stages: z.object({ beginning: stageSchema, middle: stageSchema, end: stageSchema }),
  evaluation: z.object({ formativeAssessment: text.default(""), differentiation: text.default(""), healthAndSafety: text.default(""), reflection: text.default("") }),
});

export const lessonPlanMetaSchema = z.object({
  title: nonEmptyText,
  subject_id: objectId.nullable().default(null),
  grade: z.coerce.number().int().min(1).max(11),
  quarter: z.coerce.number().int().min(1).max(4).nullable().default(null),
  section: text.nullable().default(null),
  /** Привязка к классу/группе учителя; проверяется на принадлежность в экшене. */
  class_id: objectId.nullable().default(null),
  visibility: z.enum(["private", "unlisted", "public"]).default("private"),
  language: z.enum(["ru", "kz"]).default("ru"),
});

export const createLessonPlanSchema = lessonPlanMetaSchema.extend({
  content: kspContentSchema,
});

export type CreateLessonPlanInput = z.infer<typeof createLessonPlanSchema>;
