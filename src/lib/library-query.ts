import type { Filter } from "mongodb";
import type { PlanDoc } from "@/lib/plans-repo";

export type LibrarySearchParams = Record<string, string | string[] | undefined>;
export const LIBRARY_PAGE_SIZE = 24;
export const LIBRARY_QUERY_MAX = 120;
export interface LibraryQuery {
  q: string;
  subject: string;
  grade: string;
  quarter: string;
  language: string;
  dateFrom: string;
  dateTo: string;
  sort: "newest" | "title" | "popularity" | "relevance";
  page: number;
}

// Repeated, oversized and unrecognised parameters never become Mongo operators.
export function parseLibraryQuery(params: LibrarySearchParams): LibraryQuery {
  const scalar = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const page = scalar("page");
  const sort = scalar("sort");
  const dateFrom = scalar("dateFrom");
  const dateTo = scalar("dateTo");
  return {
    q: scalar("q").slice(0, LIBRARY_QUERY_MAX).trim(),
    subject: /^[a-f\d]{24}$/i.test(scalar("subject")) ? scalar("subject").toLowerCase() : "",
    grade: /^(?:[1-9]|10|11)$/.test(scalar("grade")) ? scalar("grade") : "",
    quarter: /^(?:[1-4]|none)$/.test(scalar("quarter")) ? scalar("quarter") : "",
    language: /^(?:ru|kz)$/.test(scalar("language")) ? scalar("language") : "",
    dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : "",
    dateTo: /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : "",
    sort: sort === "title" || sort === "popularity" || sort === "relevance" ? sort : "newest",
    page: /^\d{1,7}$/.test(page) ? Math.max(1, Math.min(1_000_000, Number(page))) : 1,
  };
}

export function buildLibraryFilter(query: LibraryQuery, subjects: Array<{ id: string; name_ru: string }>): Filter<PlanDoc> {
  const filter: Filter<PlanDoc> = { visibility: "public", is_draft: { $ne: true }, moderation_hidden: { $ne: true } };
  if (query.subject) filter.subject_id = query.subject;
  if (query.grade) filter.grade = Number(query.grade);
  if (query.quarter) filter.quarter = query.quarter === "none" ? null : Number(query.quarter);
  if (query.language) filter.language = query.language as "ru" | "kz";
  if (query.dateFrom || query.dateTo) {
    const range: Record<string, Date> = {};
    if (query.dateFrom) range.$gte = new Date(query.dateFrom);
    if (query.dateTo) range.$lte = new Date(query.dateTo + "T23:59:59.999Z");
    filter.created_at = range;
  }
  if (query.q) {
    const literal = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const subjectIds = subjects.filter((s) => s.name_ru.toLowerCase().includes(query.q.toLowerCase())).map((s) => s.id);
    // Full-text search across multiple fields with relevance scoring
    filter.$or = [
      { title: { $regex: literal, $options: "i" } },
      { "content.topic": { $regex: literal, $options: "i" } },
      { "content.learningObjectives.text": { $regex: literal, $options: "i" } },
      { "content.stages.beginning.teacherActions": { $regex: literal, $options: "i" } },
      { "content.stages.beginning.studentActions": { $regex: literal, $options: "i" } },
      { "content.stages.middle.teacherActions": { $regex: literal, $options: "i" } },
      { "content.stages.middle.studentActions": { $regex: literal, $options: "i" } },
      { "content.stages.end.teacherActions": { $regex: literal, $options: "i" } },
      { "content.stages.end.studentActions": { $regex: literal, $options: "i" } },
      { "content.stages.beginning.keyQuestions": { $regex: literal, $options: "i" } },
      { "content.stages.middle.keyQuestions": { $regex: literal, $options: "i" } },
      { "content.stages.end.keyQuestions": { $regex: literal, $options: "i" } },
      { "content.stages.beginning.descriptors": { $regex: literal, $options: "i" } },
      { "content.stages.middle.descriptors": { $regex: literal, $options: "i" } },
      { "content.stages.end.descriptors": { $regex: literal, $options: "i" } },
      { "content.lessonObjectives": { $regex: literal, $options: "i" } },
      { "content.assessmentCriteria": { $regex: literal, $options: "i" } },
      { "content.languageObjectives.terms": { $regex: literal, $options: "i" } },
      { "content.languageObjectives.phrases": { $regex: literal, $options: "i" } },
      { "content.values": { $regex: literal, $options: "i" } },
      { "content.crossCurricularLinks": { $regex: literal, $options: "i" } },
      { "content.priorKnowledge": { $regex: literal, $options: "i" } },
      { "content.evaluation.formativeAssessment": { $regex: literal, $options: "i" } },
      { "content.evaluation.differentiation": { $regex: literal, $options: "i" } },
      { "content.evaluation.reflection": { $regex: literal, $options: "i" } },
      { subject_id: { $in: subjectIds } },
    ];
  }
  return filter;
}

export function libraryHref(query: LibraryQuery, page = query.page): string {
  const params = new URLSearchParams();
  for (const key of ["q", "subject", "grade", "quarter", "language", "dateFrom", "dateTo"] as const) {
    if (query[key]) params.set(key, query[key]);
  }
  if (query.sort !== "newest") params.set("sort", query.sort);
  if (page > 1) params.set("page", String(page));
  return `/library${params.size ? `?${params}` : ""}`;
}
