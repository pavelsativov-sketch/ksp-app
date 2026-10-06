import { z } from "zod";
import type { Language, LessonPlanRow } from "@/lib/types/ksp";

/** Calendar dates only, without time zones or rollover (e.g. February 30). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export const ktpRequestSchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i, "Некорректный идентификатор"),
  topics: z.array(z.string().trim().min(1).max(300)).min(1).max(40).optional(),
  startDate: z.string().refine(isCalendarDate, "Некорректная дата").optional(),
}).strict();

export type KtpRequest = z.infer<typeof ktpRequestSchema>;
export interface Ktp {
  title: string;
  subject: string;
  grade: number;
  language: Language;
  draft: true;
  rows: Array<{ number: number; topic: string; hours: number; date: string; objectives: string }>;
}

/** Pure draft builder: no curriculum inference, AI, scheduling, or persistence. */
export function buildKtp(
  plan: Pick<LessonPlanRow, "title" | "grade" | "language" | "content">,
  subject: string,
  options: Pick<KtpRequest, "topics" | "startDate"> = {},
): Ktp {
  const sourceTopic = plan.content.topic.trim();
  const objectives = plan.content.learningObjectives
    .map(({ code, text }) => [code.trim(), text.trim()].filter(Boolean).join(" — "))
    .filter(Boolean).join("\n");
  return {
    title: plan.title,
    subject,
    grade: plan.grade,
    language: plan.language,
    draft: true,
    rows: (options.topics ?? [sourceTopic]).map((topic, index) => ({
      number: index + 1,
      topic: topic.trim(),
      hours: 1,
      date: index === 0 ? options.startDate ?? "" : "",
      objectives: topic.trim() === sourceTopic ? objectives : "",
    })),
  };
}
