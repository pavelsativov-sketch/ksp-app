import type { KspContent, LessonStage } from "@/lib/types/ksp";

/**
 * Слияние результата AI с планом учителя.
 *
 * Отдельный модуль без `server-only` и без импорта AI-провайдеров: функция
 * чистая и нужна клиентскому компоненту plan-form. Раньше она жила в
 * `lib/ai/generate` вместе с сетевыми вызовами, из-за чего клиентский бандл
 * тянул серверные модули и сборка падала на `import "server-only"`.
 */

export interface AiKspPayload {
  topic?: unknown;
  lessonObjectives?: unknown;
  assessmentCriteria?: unknown;
  languageObjectives?: { terms?: unknown; phrases?: unknown } | undefined;
  values?: unknown;
  crossCurricularLinks?: unknown;
  priorKnowledge?: unknown;
  stages?: {
    beginning?: Partial<LessonStage> | undefined;
    middle?: Partial<LessonStage> | undefined;
    end?: Partial<LessonStage> | undefined;
  };
  evaluation?: {
    formativeAssessment?: unknown;
    differentiation?: unknown;
    healthAndSafety?: unknown;
    reflection?: unknown;
  };
}

export function mergeAiIntoKsp(
  current: KspContent,
  ai: AiKspPayload,
): KspContent {
  const ensureString = (val: unknown, fallback = ""): string => {
    // Пустая строка от AI означает «поле не заполнено», а не «стереть текст учителя».
    if (Array.isArray(val)) {
      const joined = val.join("\n");
      return joined.trim() ? joined : fallback;
    }
    if (typeof val === "string") return val.trim() ? val : fallback;
    return fallback;
  };

  const ensureArray = (val: unknown, fallback: string[] = []): string[] => {
    if (Array.isArray(val)) {
      const arr = val.map(String);
      return arr.length ? arr : fallback;
    }
    if (typeof val === "string") return val.trim() ? [val] : fallback;
    return fallback;
  };

  const mergeStage = (
    base: LessonStage | undefined,
    incoming: Partial<LessonStage> | undefined,
  ): LessonStage => {
    const fallback: LessonStage =
      base ?? { time: "", teacherActions: "", studentActions: "", resources: "" };
    if (!incoming) return fallback;
    return {
      ...fallback,
      ...incoming,
      time: ensureString(incoming.time, fallback.time),
      teacherActions: ensureString(incoming.teacherActions, fallback.teacherActions),
      studentActions: ensureString(incoming.studentActions, fallback.studentActions),
      resources: ensureString(incoming.resources, fallback.resources),
      keyQuestions: ensureArray(incoming.keyQuestions, fallback.keyQuestions ?? []),
      descriptors: ensureArray(incoming.descriptors, fallback.descriptors ?? []),
      assessmentMethod: ensureString(incoming.assessmentMethod, fallback.assessmentMethod ?? ""),
      tasks: Array.isArray(incoming.tasks) && incoming.tasks.length ? incoming.tasks : (fallback.tasks ?? []),
      homework:
        incoming.homework !== undefined ? ensureString(incoming.homework) : (fallback.homework ?? ""),
      summary:
        incoming.summary !== undefined ? ensureString(incoming.summary) : (fallback.summary ?? ""),
      reflectionQuestions:
        incoming.reflectionQuestions !== undefined
          ? ensureArray(incoming.reflectionQuestions)
          : (fallback.reflectionQuestions ?? []),
    };
  };

  return {
    ...current,
    topic: ensureString(ai.topic, current.topic),
    lessonObjectives: ensureArray(ai.lessonObjectives, current.lessonObjectives),
    assessmentCriteria: ensureArray(ai.assessmentCriteria, current.assessmentCriteria),
    languageObjectives: {
      terms: ensureArray(ai.languageObjectives?.terms, current.languageObjectives?.terms),
      phrases: ensureArray(ai.languageObjectives?.phrases, current.languageObjectives?.phrases),
    },
    values: ensureString(ai.values, current.values),
    crossCurricularLinks: ensureString(ai.crossCurricularLinks, current.crossCurricularLinks),
    priorKnowledge: ensureString(ai.priorKnowledge, current.priorKnowledge),
    stages: {
      beginning: mergeStage(current.stages?.beginning, ai.stages?.beginning),
      middle: mergeStage(current.stages?.middle, ai.stages?.middle),
      end: mergeStage(current.stages?.end, ai.stages?.end),
    },
    evaluation: {
      ...current.evaluation,
      formativeAssessment: ensureString(ai.evaluation?.formativeAssessment, current.evaluation?.formativeAssessment),
      differentiation: ensureString(ai.evaluation?.differentiation, current.evaluation?.differentiation),
      healthAndSafety: ensureString(ai.evaluation?.healthAndSafety, current.evaluation?.healthAndSafety),
      reflection: ensureString(ai.evaluation?.reflection, current.evaluation?.reflection),
    },
  };
}
