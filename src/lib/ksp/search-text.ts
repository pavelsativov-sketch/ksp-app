import type { KspContent, LessonStage } from "@/lib/types/ksp";

/** Strip HTML tags so rich-text actions are searchable as plain text. */
function plain(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stageText(stage: LessonStage): string {
  return [
    plain(stage.teacherActions),
    plain(stage.studentActions),
    plain(stage.resources),
    (stage.keyQuestions ?? []).join(" "),
    (stage.descriptors ?? []).join(" "),
    (stage.reflectionQuestions ?? []).join(" "),
    plain(stage.summary),
    plain(stage.homework),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Build a single lower-cased haystack string from a KspContent payload so the
 * library/dashboard search box can match on any field — topic, lesson goals,
 * stage texts, prior knowledge, etc. — not just the plan title.
 */
export function buildPlanSearchText(content: Partial<KspContent> | null | undefined): string {
  if (!content) return "";
  const parts: string[] = [];

  if (content.topic) parts.push(content.topic);
  if (content.lessonObjectives?.length)
    parts.push(content.lessonObjectives.join(" "));
  if (content.assessmentCriteria?.length)
    parts.push(content.assessmentCriteria.join(" "));
  if (content.learningObjectives?.length)
    parts.push(content.learningObjectives.map((o) => `${o.code} ${o.text}`).join(" "));
  if (content.languageObjectives?.terms?.length)
    parts.push(content.languageObjectives.terms.join(" "));
  if (content.languageObjectives?.phrases?.length)
    parts.push(content.languageObjectives.phrases.join(" "));
  if (content.values) parts.push(content.values);
  if (content.crossCurricularLinks) parts.push(content.crossCurricularLinks);
  if (content.priorKnowledge) parts.push(content.priorKnowledge);

  if (content.stages) {
    if (content.stages.beginning) parts.push(stageText(content.stages.beginning));
    if (content.stages.middle) parts.push(stageText(content.stages.middle));
    if (content.stages.end) parts.push(stageText(content.stages.end));
  }

  if (content.evaluation) {
    parts.push(
      content.evaluation.formativeAssessment ?? "",
      content.evaluation.differentiation ?? "",
      content.evaluation.healthAndSafety ?? "",
      content.evaluation.reflection ?? "",
    );
  }

  // Lower-cased so the in-memory filter doesn't have to do work per keystroke.
  return parts.join(" ").toLowerCase();
}
