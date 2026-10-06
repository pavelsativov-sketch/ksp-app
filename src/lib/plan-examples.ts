import { emptyKsp, type SubjectRow } from "@/lib/types/ksp";
import type { SavePlanInput } from "@/app/actions/plans";

export interface PlanExample {
  key: string;
  subjectName: string;
  plan: SavePlanInput;
}

/** Local teaching starters, not AI output or official curriculum objectives. */
export function getPlanExamples(subjects: SubjectRow[]): PlanExample[] {
  const templates = [
    { subject: "Математика", grade: 5, topic: "Обыкновенные дроби", objective: "Представлять долю целого в виде дроби и объяснять смысл числителя и знаменателя.", activity: "Разделите бумажный круг на равные части. Запишите дробь для закрашенной части и сравните ответы в парах." },
    { subject: "Русский язык", grade: 5, topic: "Имя существительное", objective: "Находить существительные в тексте и определять их род и число.", activity: "Найдите существительные в коротком описании класса. Распределите слова по роду и объясните свой выбор." },
    { subject: "Информатика", grade: 5, topic: "Безопасная работа за компьютером", objective: "Объяснять основные правила безопасной работы за компьютером.", activity: "Обсудите ситуации: провод у прохода, напиток рядом с клавиатурой, длительная работа без перерыва. Предложите безопасные действия." },
  ];
  const result: PlanExample[] = [];
  for (const template of templates) {
    const subject = subjects.find((s) => s.name_ru === template.subject && s.grade_min <= template.grade && s.grade_max >= template.grade);
    if (!subject) continue;
    const content = emptyKsp();
    content.topic = template.topic;
    content.header.grade = String(template.grade);
    content.lessonObjectives = [template.objective];
    content.assessmentCriteria = ["Объясняет решение своими словами и приводит пример."];
    content.stages.beginning = { ...content.stages.beginning, time: "5 минут", teacherActions: "Объявите тему и обсудите, что учащиеся уже знают.", studentActions: "Приводят знакомые примеры и формулируют вопросы." };
    content.stages.middle = { ...content.stages.middle, time: "30 минут", teacherActions: template.activity, studentActions: "Выполняют задание, сравнивают ответы в парах и объясняют ход рассуждений." };
    content.stages.end = { ...content.stages.end, time: "10 минут", teacherActions: "Предложите назвать один вывод и один оставшийся вопрос.", studentActions: "Формулируют вывод и оценивают свою работу." };
    result.push({ key: subject.id, subjectName: subject.name_ru, plan: { title: `${template.topic} — пример КСП`, subject_id: subject.id, grade: template.grade, quarter: null, section: null, visibility: "private", language: "ru", content } });
  }
  return result;
}

export function exampleHref(example: PlanExample) {
  return `/plans/new?example=${encodeURIComponent(example.key)}`;
}
