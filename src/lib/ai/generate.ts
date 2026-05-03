import type { KspContent } from "@/lib/types/ksp";
import {
  buildSystemPrompt,
  buildUserPrompt,
  OPENAI_JSON_SCHEMA,
  type AiKspPayload,
  type GenerateKspInput,
} from "./prompt";
import { completeJson, isAiConfigured } from "./client";

export { isAiConfigured };

/** @deprecated alias kept for compatibility — use isAiConfigured(). */
export function isOpenAIConfigured(): boolean {
  return isAiConfigured();
}

/**
 * Generate a KSP body (everything except header and learningObjectives).
 * Uses Gemini if `GEMINI_API_KEY` is set, OpenAI otherwise. If no provider
 * is configured the call returns a heuristic stub so the UI still works
 * end-to-end for demos.
 */
export async function generateKsp(
  input: GenerateKspInput,
): Promise<AiKspPayload> {
  if (!isAiConfigured()) return stubKsp(input);
  return completeJson<AiKspPayload>({
    system: buildSystemPrompt(input.language),
    user: buildUserPrompt(input),
    schema: OPENAI_JSON_SCHEMA.schema,
    schemaName: OPENAI_JSON_SCHEMA.name,
    temperature: 0.7,
  });
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
    pointsScale: ai.pointsScale ?? current.pointsScale,
    overallRubric: ai.overallRubric ?? current.overallRubric,
    languageObjectives: ai.languageObjectives,
    values: ai.values,
    crossCurricularLinks: ai.crossCurricularLinks,
    priorKnowledge: ai.priorKnowledge,
    stages: ai.stages,
    evaluation: ai.evaluation,
  };
}

/** Deterministic high-quality stub used when no AI provider is configured. */
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
    pointsScale: [
      { label: "Активное участие в кумулятивной беседе (начало урока)", points: 2 },
      { label: "Правильное выполнение практической работы (середина)", points: 4 },
      { label: "Работа в паре / взаимооценивание", points: 1 },
      { label: "Правильность итоговой задачи / мини-СОР", points: 2 },
      { label: "Домашнее задание", points: 1 },
    ],
    overallRubric: [
      { points: 1, descriptor: `Не приступил к работе по теме «${topic}». Не отвечает на вопросы.` },
      { points: 2, descriptor: `Узнаёт термин «${topic}», но не может назвать ни одного признака.` },
      { points: 3, descriptor: `Называет 1–2 признака темы, но не связывает их между собой.` },
      { points: 4, descriptor: `Распознаёт ключевые понятия в готовом примере, не объясняет.` },
      { points: 5, descriptor: `Решает базовые задания по теме с подсказкой/опорой.` },
      { points: 6, descriptor: `Самостоятельно выполняет типовые задания, иногда ошибается.` },
      { points: 7, descriptor: `Уверенно решает типовые задачи, объясняет своё решение.` },
      { points: 8, descriptor: `Обобщает и сравнивает, видит закономерности темы.` },
      { points: 9, descriptor: `Переносит изученное в новый контекст, обосновывает ответ.` },
      { points: 10, descriptor: `Объясняет тему другим, формулирует исследовательский вопрос.` },
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
        time: "1–10 мин",
        teacherActions:
          "Орг. момент. Приветствие, проверка присутствующих. Психологический настрой. Актуализация опорных знаний через кумулятивную беседу. Знакомство с темой урока и критериями успеха.",
        studentActions:
          "Настраиваются на работу, отвечают на вопросы, формулируют свои ожидания от урока. Записывают тему в тетрадь.",
        resources: "Доска, презентация, вопросы для актуализации.",
        keyQuestions: [
          `Что вы помните из предыдущего урока, что связано с темой «${topic}»?`,
          "Где в реальной жизни нам может пригодиться этот материал?",
          "Какие вопросы у вас остались с прошлого урока?",
        ],
        descriptors: [
          "Отвечает на наводящие вопросы по предыдущей теме",
          "Формулирует тему и цели урока своими словами",
        ],
        assessmentMethod: "Похвала",
      },
      middle: {
        time: "11–35 мин",
        teacherActions: `Опираясь на ответы учеников в кумулятивной беседе, учитель переходит к объяснению нового материала по теме «${topic}» с использованием наглядности. Затем организует работу в парах: ученики выполняют задание по образцу, затем — самостоятельно. Учитель задаёт наводящие вопросы, корректирует работу групп, раздаёт дифференцированные карточки. Физкультминутка в середине этапа.`,
        studentActions:
          "Слушают объяснение, делают записи. Работают в парах над заданием. Сильные ученики помогают слабым. Выполняют индивидуальные карточки, при затруднении обращаются к учителю.",
        resources:
          "Презентация, раздаточные карточки (3 уровня сложности), учебник, тетрадь.",
        keyQuestions: [
          `Какое ключевое свойство темы «${topic}» вы заметили?`,
          "Как изменится результат, если поменять одно из условий?",
        ],
        descriptors: [
          "Записывает определение/формулу/алгоритм",
          "Приводит не менее двух примеров применения изученного",
          "Решает задачу по образцу с опорой на алгоритм",
          "Сравнивает свои выводы с эталоном и исправляет ошибки",
        ],
        assessmentMethod: "ФО + Взаимооценивание",
      },
      end: {
        time: "36–45 мин",
        teacherActions:
          "Закрепив навык на практике, учитель подводит итог урока через приём «3 вещи, которые я сегодня узнал». Ученики возвращаются к целям урока и оценивают их достижение. Проводит рефлексию по технике «Лестница успеха». Даёт домашнее задание с комментарием. Благодарит за работу.",
        studentActions:
          "Называют ключевые выводы урока. Отвечают на рефлексивные вопросы. Записывают домашнее задание. Отмечают свою позицию на «Лестнице успеха».",
        resources: "Карточки «Светофор», плакат «Лестница успеха», дневник.",
        keyQuestions: [
          "Что нового вы узнали на этом уроке?",
        ],
        descriptors: [
          "Называет 2–3 ключевых вывода урока",
          "Оценивает свою работу по «Лестнице успеха»",
        ],
        assessmentMethod: "Самооценивание",
        summary: `На уроке мы изучили тему «${topic}»: ключевые понятия, основные свойства и способы применения. Закрепили материал на практических примерах.`,
        reflectionQuestions: [
          "Что было легко?",
          "Что было сложно?",
          "Что вам особенно понравилось?",
        ],
        homework: `Прочитать соответствующий параграф учебника и выполнить задания по теме «${topic}».`,
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
