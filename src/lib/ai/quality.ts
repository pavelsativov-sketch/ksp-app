/**
 * Валидация качества AI-генерируемого контента.
 *
 * Проверяет КСП, задания и изображения на соответствие стандартам качества.
 * Возвращает оценки и предложения по улучшению.
 */

import type { KspContent } from "@/lib/types/ksp";
import type { InteractiveTask } from "@/lib/ksp/tasks";

// ── Типы результатов валидации ──────────────────────────────────

export interface QualityIssue {
  severity: "error" | "warning" | "info";
  field: string;
  message: string;
}

export interface QualityResult {
  /** Общая оценка качества (0-100) */
  score: number;
  /** Пройдена ли валидация */
  passed: boolean;
  /** Найденные проблемы */
  issues: QualityIssue[];
  /** Предложения по улучшению */
  suggestions: string[];
}

// ── Валидация КСП ──────────────────────────────────────────────

export function validateKspQuality(ksp: KspContent): QualityResult {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // Проверка темы
  if (!ksp.topic || ksp.topic.trim().length < 3) {
    issues.push({ severity: "error", field: "topic", message: "Тема урока слишком короткая или отсутствует" });
    score -= 20;
  }

  // Проверка целей обучения
  if (!ksp.lessonObjectives || ksp.lessonObjectives.length < 3) {
    issues.push({ severity: "error", field: "lessonObjectives", message: "Недостаточно целей обучения (минимум 3)" });
    score -= 15;
  } else {
    // Проверка SMART-формата
    const smartGoals = ksp.lessonObjectives.filter((g) =>
      g.length > 20 && /(сможет|смогут|научится|научатся|сможет объяснить|сможет применять)/i.test(g)
    );
    if (smartGoals.length < ksp.lessonObjectives.length * 0.5) {
      issues.push({ severity: "warning", field: "lessonObjectives", message: "Цели обучения должны быть SMART (конкретные, измеримые)" });
      suggestions.push("Переформулируй цели, используя глаголы действия: 'сможет объяснить', 'сможет применять', 'сможет анализировать'");
      score -= 10;
    }
  }

  // Проверка критериев оценивания
  if (!ksp.assessmentCriteria || ksp.assessmentCriteria.length < 3) {
    issues.push({ severity: "error", field: "assessmentCriteria", message: "Недостаточно критериев оценивания (минимум 3)" });
    score -= 15;
  } else {
    // Проверка измеримости
    const measurableCriteria = ksp.assessmentCriteria.filter((c) =>
      /(называет|объясняет|применяет|анализирует|сравнивает|вычисляет|определяет|описывает)/i.test(c)
    );
    if (measurableCriteria.length < ksp.assessmentCriteria.length * 0.5) {
      issues.push({ severity: "warning", field: "assessmentCriteria", message: "Критерии оценивания должны быть измеримыми" });
      suggestions.push("Используй конкретные глаголы действия в критериях: 'называет', 'объясняет', 'применяет', 'анализирует'");
      score -= 10;
    }
  }

  // Проверка языковых целей
  if (!ksp.languageObjectives?.terms || ksp.languageObjectives.terms.length < 5) {
    issues.push({ severity: "warning", field: "languageObjectives.terms", message: "Недостаточно предметных терминов (рекомендуется 5-10)" });
    suggestions.push("Добавь больше предметных терминов, связанных с темой урока");
    score -= 5;
  }

  if (!ksp.languageObjectives?.phrases || ksp.languageObjectives.phrases.length < 3) {
    issues.push({ severity: "warning", field: "languageObjectives.phrases", message: "Недостаточно ключевых фраз (рекомендуется 3-5)" });
    suggestions.push("Добавь ключевые фразы для устной работы на уроке");
    score -= 5;
  }

  // Проверка ценностей
  if (!ksp.values || ksp.values.trim().length < 20) {
    issues.push({ severity: "warning", field: "values", message: "Описание ценностей слишком короткое" });
    suggestions.push("Раскрой воспитательную ценность подробнее, свяжи с конкретными действиями на уроке");
    score -= 5;
  }

  // Проверка межпредметных связей
  if (!ksp.crossCurricularLinks || ksp.crossCurricularLinks.trim().length < 30) {
    issues.push({ severity: "warning", field: "crossCurricularLinks", message: "Межпредметные связи слишком общие" });
    suggestions.push("Укажи конкретные связи с другими предметами, например: 'Математика — через расчёты в физических задачах'");
    score -= 5;
  }

  // Проверка предшествующих знаний
  if (!ksp.priorKnowledge || ksp.priorKnowledge.trim().length < 20) {
    issues.push({ severity: "warning", field: "priorKnowledge", message: "Описание предшествующих знаний слишком короткое" });
    suggestions.push("Опиши конкретно, что ученики уже должны знать по этой теме");
    score -= 5;
  }

  // Проверка этапов
  const stages = ksp.stages;
  if (!stages) {
    issues.push({ severity: "error", field: "stages", message: "Отсутствуют этапы урока" });
    score -= 30;
  } else {
    // Проверка beginning
    if (!stages.beginning?.teacherActions || stages.beginning.teacherActions.length < 100) {
      issues.push({ severity: "error", field: "stages.beginning.teacherActions", message: "Сценарий речи педагога в начале урока слишком короткий" });
      score -= 10;
    }
    if (!stages.beginning?.studentActions || stages.beginning.studentActions.length < 50) {
      issues.push({ severity: "warning", field: "stages.beginning.studentActions", message: "Описание действий учеников в начале урока слишком короткое" });
      score -= 5;
    }

    // Проверка middle
    if (!stages.middle?.teacherActions || stages.middle.teacherActions.length < 200) {
      issues.push({ severity: "error", field: "stages.middle.teacherActions", message: "Сценарий речи педагога в середине урока слишком короткий" });
      score -= 10;
    }
    if (!stages.middle?.studentActions || stages.middle.studentActions.length < 100) {
      issues.push({ severity: "warning", field: "stages.middle.studentActions", message: "Описание действий учеников в середине урока слишком короткое" });
      score -= 5;
    }

    // Проверка end
    if (!stages.end?.teacherActions || stages.end.teacherActions.length < 100) {
      issues.push({ severity: "error", field: "stages.end.teacherActions", message: "Сценарий речи педагога в конце урока слишком короткий" });
      score -= 10;
    }
    if (!stages.end?.summary || stages.end.summary.length < 50) {
      issues.push({ severity: "warning", field: "stages.end.summary", message: "Итог урока слишком короткий" });
      score -= 5;
    }
    if (!stages.end?.homework || stages.end.homework.length < 30) {
      issues.push({ severity: "warning", field: "stages.end.homework", message: "Домашнее задание слишком короткое" });
      score -= 5;
    }
  }

  // Проверка оценки
  if (!ksp.evaluation) {
    issues.push({ severity: "error", field: "evaluation", message: "Отсутствует раздел оценки" });
    score -= 15;
  } else {
    if (!ksp.evaluation.formativeAssessment || ksp.evaluation.formativeAssessment.length < 30) {
      issues.push({ severity: "warning", field: "evaluation.formativeAssessment", message: "Описание формативного оценивания слишком короткое" });
      score -= 5;
    }
    if (!ksp.evaluation.differentiation || ksp.evaluation.differentiation.length < 50) {
      issues.push({ severity: "warning", field: "evaluation.differentiation", message: "Описание дифференциации слишком короткое" });
      suggestions.push("Конкретно опиши, как поддержать слабых учеников и усложнить для сильных");
      score -= 5;
    }
  }

  // Проверка навыков XXI века
  const allText = JSON.stringify(ksp).toLowerCase();
  const has21stCenturySkills =
    (allText.includes("критическое мышление") || allText.includes("анализ")) &&
    (allText.includes("сотрудничество") || allText.includes("групп")) &&
    (allText.includes("коммуникация") || allText.includes("объясн")) &&
    (allText.includes("креативность") || allText.includes("созда"));

  if (!has21stCenturySkills) {
    issues.push({ severity: "info", field: "general", message: "Рекомендуется включить навыки XXI века (критическое мышление, сотрудничество, коммуникация, креативность)" });
    suggestions.push("Добавь задания, развивающие навыки XXI века: анализ, групповую работу, презентацию, творчество");
    score -= 5;
  }

  // Проверка цифровой грамотности
  const hasDigitalLiteracy =
    allText.includes("цифров") ||
    allText.includes("интернет") ||
    allText.includes("онлайн") ||
    allText.includes("презентац") ||
    allText.includes("интерактив");

  if (!hasDigitalLiteracy) {
    issues.push({ severity: "info", field: "general", message: "Рекомендуется включить элементы цифровой грамотности" });
    suggestions.push("Добавь использование цифровых инструментов: презентации, интерактивные доски, онлайн-ресурсы");
    score -= 3;
  }

  // Ограничение оценки
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    passed: score >= 70 && !issues.some((i) => i.severity === "error"),
    issues,
    suggestions,
  };
}

// ── Валидация заданий ──────────────────────────────────────────

export function validateTaskQuality(task: InteractiveTask): QualityResult {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // Проверка вопроса
  if (!task.question || task.question.trim().length < 10) {
    issues.push({ severity: "error", field: "question", message: "Вопрос слишком короткий или отсутствует" });
    score -= 20;
  }

  // Проверка подсказки
  if (!task.hint || task.hint.trim().length < 10) {
    issues.push({ severity: "warning", field: "hint", message: "Подсказка слишком короткая или отсутствует" });
    suggestions.push("Добавь полезную подсказку, которая направляет ученика к правильному ответу");
    score -= 10;
  } else if (task.hint.toLowerCase().includes("подумай") && task.hint.length < 30) {
    issues.push({ severity: "warning", field: "hint", message: "Подсказка слишком общая" });
    suggestions.push("Замени общую подсказку на конкретное направление");
    score -= 5;
  }

  // Проверка баллов
  if (task.points < 1 || task.points > 5) {
    issues.push({ severity: "warning", field: "points", message: "Баллы должны быть от 1 до 5" });
    score -= 5;
  }

  // Специфические проверки по типам
  switch (task.type) {
    case "MCQ": {
      const mcq = task as import("@/lib/ksp/tasks").McqTask;
      if (!mcq.options || mcq.options.length !== 4) {
        issues.push({ severity: "error", field: "options", message: "MCQ должен иметь ровно 4 варианта ответа" });
        score -= 15;
      } else {
        // Проверка на повторяющиеся варианты
        const uniqueOptions = new Set(mcq.options.map((o) => o.toLowerCase().trim()));
        if (uniqueOptions.size !== mcq.options.length) {
          issues.push({ severity: "error", field: "options", message: "Варианты ответов не должны повторяться" });
          score -= 10;
        }
        // Проверка правильного индекса
        if (mcq.correctIndex < 0 || mcq.correctIndex >= mcq.options.length) {
          issues.push({ severity: "error", field: "correctIndex", message: "Индекс правильного ответа вне диапазона" });
          score -= 10;
        }
      }
      break;
    }

    case "TRUE_FALSE": {
      // Дополнительных проверок не требуется
      break;
    }

    case "SHORT_ANSWER": {
      const sa = task as import("@/lib/ksp/tasks").ShortAnswerTask;
      if (!sa.acceptedAnswers || sa.acceptedAnswers.length < 2) {
        issues.push({ severity: "warning", field: "acceptedAnswers", message: "Рекомендуется указать 2-4 варианта принятых ответов" });
        suggestions.push("Добавь синонимы и альтернативные формулировки правильного ответа");
        score -= 10;
      }
      break;
    }

    case "FILL_BLANK": {
      const fb = task as import("@/lib/ksp/tasks").FillBlankTask;
      if (!fb.template || !fb.template.includes("___")) {
        issues.push({ severity: "error", field: "template", message: "Шаблон должен содержать пропуски (___)" });
        score -= 15;
      }
      if (!fb.answers || fb.answers.length === 0) {
        issues.push({ severity: "error", field: "answers", message: "Ответы отсутствуют" });
        score -= 15;
      }
      // Проверка соответствия количества пропусков и ответов
      const blankCount = (fb.template.match(/___/g) || []).length;
      if (blankCount !== fb.answers.length) {
        issues.push({ severity: "error", field: "answers", message: `Количество пропусков (${blankCount}) не совпадает с количеством ответов (${fb.answers.length})` });
        score -= 10;
      }
      break;
    }

    case "MATCHING": {
      const m = task as import("@/lib/ksp/tasks").MatchingTask;
      if (!m.left || !m.right || m.left.length !== m.right.length) {
        issues.push({ severity: "error", field: "matching", message: "Количество элементов слева и справа должно совпадать" });
        score -= 15;
      }
      if (!m.pairs || m.pairs.length === 0) {
        issues.push({ severity: "error", field: "pairs", message: "Парные соответствия отсутствуют" });
        score -= 15;
      }
      break;
    }

    case "ORDERING": {
      const o = task as import("@/lib/ksp/tasks").OrderingTask;
      if (!o.items || o.items.length < 4) {
        issues.push({ severity: "warning", field: "items", message: "Рекомендуется 4-6 элементов для упорядочивания" });
        score -= 10;
      }
      if (!o.correctOrder || o.correctOrder.length !== o.items.length) {
        issues.push({ severity: "error", field: "correctOrder", message: "Правильный порядок должен содержать все элементы" });
        score -= 10;
      }
      break;
    }

    case "NUMERIC": {
      const n = task as import("@/lib/ksp/tasks").NumericTask;
      if (typeof n.answer !== "number" || isNaN(n.answer)) {
        issues.push({ severity: "error", field: "answer", message: "Числовой ответ должен быть валидным числом" });
        score -= 15;
      }
      if (n.tolerance < 0) {
        issues.push({ severity: "error", field: "tolerance", message: "Допуск не может быть отрицательным" });
        score -= 5;
      }
      break;
    }
  }

  // Ограничение оценки
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    passed: score >= 70 && !issues.some((i) => i.severity === "error"),
    issues,
    suggestions,
  };
}

// ── Валидация изображений ──────────────────────────────────────

export function validateImageQuality(base64: string): QualityResult {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // Проверка размера
  if (!base64 || base64.length < 1000) {
    issues.push({ severity: "error", field: "image", message: "Изображение слишком маленькое или отсутствует" });
    score -= 50;
  }

  // Проверка сигнатуры
  try {
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length < 500) {
      issues.push({ severity: "error", field: "image", message: "Файл изображения слишком маленький" });
      score -= 30;
    }

    // Проверка формата
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;

    if (!isJpeg && !isPng) {
      issues.push({ severity: "error", field: "image", message: "Неподдерживаемый формат изображения (ожидается JPEG или PNG)" });
      score -= 20;
    }

    // Проверка на полностью чёрное или белое изображение (простая эвристика)
    if (buffer.length > 100) {
      const sampleSize = Math.min(1000, buffer.length);
      let sum = 0;
      for (let i = 0; i < sampleSize; i++) {
        sum += buffer[i];
      }
      const avg = sum / sampleSize;
      if (avg < 10) {
        issues.push({ severity: "warning", field: "image", message: "Изображение может быть слишком тёмным" });
        suggestions.push("Попробуй другой промпт или стиль генерации");
        score -= 10;
      } else if (avg > 245) {
        issues.push({ severity: "warning", field: "image", message: "Изображение может быть слишком светлым" });
        suggestions.push("Попробуй другой промпт или стиль генерации");
        score -= 10;
      }
    }
  } catch {
    issues.push({ severity: "error", field: "image", message: "Не удалось декодировать изображение" });
    score -= 50;
  }

  // Ограничение оценки
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    passed: score >= 70 && !issues.some((i) => i.severity === "error"),
    issues,
    suggestions,
  };
}

// ── Утилиты ────────────────────────────────────────────────────

/**
 * Возвращает текстовое описание качества.
 */
export function getQualityLabel(score: number): string {
  if (score >= 90) return "Отлично";
  if (score >= 80) return "Хорошо";
  if (score >= 70) return "Удовлетворительно";
  if (score >= 50) return "Требует улучшения";
  return "Неудовлетворительно";
}

/**
 * Возвращает цвет для отображения оценки качества.
 */
export function getQualityColor(score: number): string {
  if (score >= 90) return "green";
  if (score >= 80) return "blue";
  if (score >= 70) return "yellow";
  if (score >= 50) return "orange";
  return "red";
}
