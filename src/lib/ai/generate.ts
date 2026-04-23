import OpenAI from "openai";
import type { KspContent } from "@/lib/types/ksp";
import {
  buildSystemPrompt,
  buildUserPrompt,
  OPENAI_JSON_SCHEMA,
  type AiKspPayload,
  type GenerateKspInput,
} from "./prompt";

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Generate a KSP body (everything except header and learningObjectives).
 * If OPENAI_API_KEY is not set, returns a heuristic stub so the UI
 * flow works end-to-end for demos.
 */
export async function generateKsp(
  input: GenerateKspInput,
): Promise<AiKspPayload> {
  if (!isOpenAIConfigured()) {
    return stubKsp(input);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      { role: "system", content: buildSystemPrompt(input.language) },
      { role: "user", content: buildUserPrompt(input) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: OPENAI_JSON_SCHEMA,
    },
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) throw new Error("AI не вернул ответ");
  const parsed = JSON.parse(raw) as AiKspPayload;
  return parsed;
}

export function mergeAiIntoKsp(
  current: KspContent,
  ai: AiKspPayload,
): KspContent {
  return {
    ...current,
    topic: ai.topic || current.topic,
    lessonObjectives: ai.lessonObjectives,
    assessmentCriteria: ai.assessmentCriteria,
    languageObjectives: ai.languageObjectives,
    values: ai.values,
    crossCurricularLinks: ai.crossCurricularLinks,
    priorKnowledge: ai.priorKnowledge,
    stages: ai.stages,
    evaluation: ai.evaluation,
  };
}

/** Deterministic high-quality stub used when OPENAI_API_KEY is missing. */
function stubKsp(input: GenerateKspInput): AiKspPayload {
  const { grade, subject, topic } = input;
  return {
    topic,
    lessonObjectives: [
      `Учащиеся смогут объяснить основные понятия темы «${topic}» своими словами.`,
      `Учащиеся смогут применять изученный материал для решения практических задач.`,
      `Учащиеся смогут оценивать правильность собственных рассуждений и исправлять ошибки.`,
    ],
    assessmentCriteria: [
      "Называет ключевые термины темы и даёт им определения.",
      "Приводит не менее двух примеров применения изученного материала.",
      "Решает задачу по теме с опорой на алгоритм.",
      "Формулирует вывод по итогам работы.",
    ],
    languageObjectives: {
      terms: [
        `${topic} (ключевое понятие урока)`,
        "определение",
        "свойство",
        "пример",
        "вывод",
      ],
      phrases: [
        `Тема «${topic}» связана с …`,
        "Я считаю, что …, потому что …",
        "Из этого следует, что …",
      ],
    },
    values:
      "Академическая честность и уважение к чужому мнению: ученики учатся аргументировать свою позицию и принимать критику.",
    crossCurricularLinks: `Связь с другими предметами (напр. для ${subject} в ${grade} классе): математика/язык/естествознание — через анализ данных и оформление выводов.`,
    priorKnowledge:
      "Базовые понятия предыдущих разделов курса, умение работать с учебником и выполнять парные задания.",
    stages: {
      beginning: {
        time: "0–7 мин",
        teacherActions:
          "Приветствие. Психологический настрой (упражнение «Улыбка»). Проверка готовности к уроку. Актуализация опорных знаний через мини-опрос по предыдущей теме. Объявление темы и целей урока, запись на доске.",
        studentActions:
          "Настраиваются на работу, отвечают на вопросы учителя, формулируют свои ожидания от урока. Записывают тему в тетрадь.",
        resources: "Доска, слайд с темой урока, вопросы для актуализации.",
      },
      middle: {
        time: "7–35 мин",
        teacherActions: `Объяснение нового материала по теме «${topic}» с использованием наглядности. Организация работы в парах: ученики выполняют задание по образцу, затем — самостоятельно. Учитель задаёт наводящие вопросы, корректирует работу групп, раздаёт дифференцированные карточки.`,
        studentActions:
          "Слушают объяснение, делают записи. Работают в парах над заданием. Сильные ученики помогают слабым. Выполняют индивидуальные карточки, при затруднении обращаются к учителю.",
        resources:
          "Презентация, раздаточные карточки (3 уровня сложности), учебник, тетрадь.",
      },
      end: {
        time: "35–45 мин",
        teacherActions:
          "Подводит итог: просит учеников назвать 3 вещи, которые они узнали. Проводит формативное оценивание через приём «Светофор». Даёт домашнее задание с комментарием. Проводит рефлексию по технике «Лестница успеха».",
        studentActions:
          "Называют ключевые выводы урока. Оценивают своё понимание с помощью цветовых карточек. Записывают домашнее задание. Отмечают свою позицию на «Лестнице успеха».",
        resources: "Карточки «Светофор», плакат «Лестница успеха», дневник.",
      },
    },
    evaluation: {
      formativeAssessment:
        "Приёмы «Светофор» (красный/жёлтый/зелёный), «Две звезды и пожелание» при взаимопроверке, устная обратная связь по критериям оценивания.",
      differentiation:
        "Более способным: задание повышенной сложности (исследовательский вопрос). Менее способным: карточка-подсказка с алгоритмом, работа в паре с сильным учеником.",
      healthAndSafety:
        "Физкультминутка в середине урока (1 мин). Соблюдение дистанции при работе за партой, правил ТБ при работе с раздаточными материалами.",
      reflection:
        "1) Достигнуты ли цели урока всеми учениками? 2) Какие приёмы сработали лучше всего? 3) Что я бы изменил(а) в следующий раз?",
    },
  };
}
