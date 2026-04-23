import { z } from "zod";

const taskBase = {
  id: z.string().min(1),
  question: z.string().trim().default(""),
  hint: z.string().trim().optional(),
  points: z.number().int().min(1).max(100).default(1),
  objectiveCode: z.string().trim().optional(),
};

const taskSchema = z.discriminatedUnion("type", [
  z.object({
    ...taskBase,
    type: z.literal("MCQ"),
    options: z.array(z.string()).min(2),
    correctIndex: z.number().int().min(0),
  }),
  z.object({
    ...taskBase,
    type: z.literal("TRUE_FALSE"),
    correct: z.boolean(),
  }),
  z.object({
    ...taskBase,
    type: z.literal("SHORT_ANSWER"),
    acceptedAnswers: z.array(z.string().trim()).min(1),
  }),
  z.object({
    ...taskBase,
    type: z.literal("FILL_BLANK"),
    template: z.string().min(1),
    answers: z.array(z.string().trim()).min(1),
  }),
  z.object({
    ...taskBase,
    type: z.literal("MATCHING"),
    left: z.array(z.string()).min(2),
    right: z.array(z.string()).min(2),
    pairs: z.array(
      z.object({
        leftIndex: z.number().int().min(0),
        rightIndex: z.number().int().min(0),
      }),
    ),
  }),
  z.object({
    ...taskBase,
    type: z.literal("ORDERING"),
    items: z.array(z.string()).min(2),
    correctOrder: z.array(z.number().int().min(0)),
  }),
]);

const stageSchema = z.object({
  time: z.string().trim().default(""),
  teacherActions: z.string().trim().default(""),
  studentActions: z.string().trim().default(""),
  resources: z.string().trim().default(""),
  tasks: z.array(taskSchema).default([]),
});

const headerSchema = z.object({
  longTermPlanSection: z.string().trim().default(""),
  school: z.string().trim().default(""),
  date: z.string().trim().default(""),
  teacherName: z.string().trim().default(""),
  grade: z.string().trim().default(""),
  studentsPresent: z.number().int().min(0).nullable().default(null),
  studentsAbsent: z.number().int().min(0).nullable().default(null),
});

export const kspContentSchema = z.object({
  header: headerSchema,
  topic: z.string().trim().min(1, "Укажите тему урока"),
  learningObjectives: z
    .array(z.object({ code: z.string().trim(), text: z.string().trim() }))
    .default([]),
  lessonObjectives: z.array(z.string().trim()).default([]),
  assessmentCriteria: z.array(z.string().trim()).default([]),
  languageObjectives: z
    .object({
      terms: z.array(z.string().trim()).default([]),
      phrases: z.array(z.string().trim()).default([]),
    })
    .default({ terms: [], phrases: [] }),
  values: z.string().trim().default(""),
  crossCurricularLinks: z.string().trim().default(""),
  priorKnowledge: z.string().trim().default(""),
  stages: z.object({
    beginning: stageSchema,
    middle: stageSchema,
    end: stageSchema,
  }),
  evaluation: z.object({
    formativeAssessment: z.string().trim().default(""),
    differentiation: z.string().trim().default(""),
    healthAndSafety: z.string().trim().default(""),
    reflection: z.string().trim().default(""),
  }),
});

export const lessonPlanMetaSchema = z.object({
  title: z.string().trim().min(1, "Укажите название КСП"),
  subject_id: z.string().uuid().nullable().default(null),
  grade: z.coerce.number().int().min(1).max(12),
  quarter: z.coerce.number().int().min(1).max(4).nullable().default(null),
  section: z.string().trim().nullable().default(null),
  visibility: z.enum(["private", "unlisted", "public"]).default("private"),
  language: z.enum(["ru", "kz"]).default("ru"),
});

export const createLessonPlanSchema = lessonPlanMetaSchema.extend({
  content: kspContentSchema,
});

export type CreateLessonPlanInput = z.infer<typeof createLessonPlanSchema>;
