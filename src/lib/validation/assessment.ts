import { z } from "zod";

const taskTypeSchema = z.enum(["open", "test", "match", "fill", "essay"]);

const learningObjectiveSchema = z.object({
  code: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(2000),
});

const criterionSchema = z.object({
  code: z.string().trim().min(1).max(64),
  descriptor: z.string().trim().min(1).max(2000),
  taskNumbers: z.array(z.number().int().min(1).max(50)).max(50),
});

const taskSchema = z.object({
  number: z.number().int().min(1).max(50),
  learningObjectiveCode: z.string().trim().min(1).max(64),
  type: taskTypeSchema,
  text: z.string().trim().min(1).max(8000),
  answerKey: z.string().max(8000).default(""),
  points: z.number().int().min(0).max(50),
  descriptors: z.array(z.string().trim().max(1000)).max(20).default([]),
});

const gradeBoundarySchema = z.object({
  grade: z
    .number()
    .int()
    .min(1)
    .max(5)
    .transform((v) => v as 1 | 2 | 3 | 4 | 5),
  minPoints: z.number().int().min(0).max(500),
  maxPoints: z.number().int().min(0).max(500),
});

export const assessmentContentSchema = z.object({
  header: z.object({
    school: z.string().max(500).default(""),
    teacherName: z.string().max(500).default(""),
    date: z.string().max(64).default(""),
    grade: z.string().max(32).default(""),
  }),
  sections: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  durationMinutes: z.number().int().min(5).max(180).default(40),
  learningObjectives: z.array(learningObjectiveSchema).max(20).default([]),
  criteria: z.array(criterionSchema).max(20).default([]),
  tasks: z.array(taskSchema).min(1).max(20),
  gradeBoundaries: z.array(gradeBoundarySchema).max(5).default([]),
  instructions: z.string().max(4000).default(""),
});

export type AssessmentContentParsed = z.infer<typeof assessmentContentSchema>;

export const createAssessmentSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["sor", "soch"]),
  title: z.string().trim().min(1).max(300),
  subject_id: z.string().uuid().nullable(),
  grade: z.number().int().min(1).max(12),
  quarter: z.number().int().min(1).max(4).nullable(),
  section: z.string().max(500).nullable(),
  duration_minutes: z.number().int().min(5).max(180).nullable(),
  visibility: z.enum(["private", "unlisted", "public"]),
  language: z.enum(["ru", "kz"]),
  content: assessmentContentSchema,
});
