/**
 * Структура КСП (краткосрочного плана) по стандарту обновлённого содержания РК.
 * Используется как для формы, так и для хранения в `lesson_plans.content` (jsonb).
 */

import type { InteractiveTask } from "@/lib/ksp/tasks";
import type { ReusableBlockProvenance, ReusedCriterionSource } from "@/lib/types/provenance";

export type Visibility = "private" | "unlisted" | "public";
export type Language = "ru" | "kz";
export type SchoolProfile = "emn" | "ogn";

export interface KspQualityTargets {
  /** Teacher-selected planning aid; never an official timing requirement. */
  durationMinutes?: number;
  /** Teacher-selected point scale for the lesson's interactive tasks. */
  taskPoints?: number;
}

/** Этап урока: начало / середина / конец */
export interface LessonStage {
  /** Запланированное время, напр. "0–5 мин" */
  time: string;
  /** Действия учителя */
  teacherActions: string;
  /** Действия учеников */
  studentActions: string;
  /** Ресурсы, раздаточный материал, ссылки */
  resources: string;
  /** Интерактивные задания, привязанные к этому этапу */
  tasks?: InteractiveTask[];
  /** Teacher-side source metadata when this stage was copied from an owned KSP. */
  copiedFrom?: ReusableBlockProvenance;
  /**
   * Ключевые вопросы (кумулятивная беседа) — открытые/закрытые вопросы
   * для повторения, актуализации, обсуждения. Используется в начале урока,
   * но допустимо и в середине/конце.
   */
  keyQuestions?: string[];
  /**
   * Дескрипторы оценивания — короткие проверяемые критерии того, что
   * именно делает ученик на этом этапе ("Записывает команду…", "Объясняет смысл…").
   */
  descriptors?: string[];
  /**
   * Метод оценивания на этапе: ФО / СОР / Взаимооценивание / Самооценивание / Похвала и т.п.
   */
  assessmentMethod?: string;
  /** Домашнее задание — обычно только в этапе «Конец урока». */
  homework?: string;
  /** Итог урока — краткое содержание, обычно в этапе «Конец урока». */
  summary?: string;
  /** Рефлексивные вопросы для учеников — обычно в этапе «Конец урока». */
  reflectionQuestions?: string[];
}

/** Оценивание и рефлексия */
export interface LessonEvaluation {
  /** Формативное оценивание */
  formativeAssessment: string;
  /** Дифференциация: поддержка менее способных + вызов более способных */
  differentiation: string;
  /** Здоровье и соблюдение ТБ */
  healthAndSafety: string;
  /** Рефлексия учителя по уроку */
  reflection: string;
}

/** Шапка КСП */
export interface LessonHeader {
  /** Раздел долгосрочного плана */
  longTermPlanSection: string;
  /** Школа */
  school: string;
  /** Дата */
  date: string;
  /** ФИО учителя */
  teacherName: string;
  /** Класс (напр. "5А") */
  grade: string;
  /** Присутствовало */
  studentsPresent: number | null;
  /** Отсутствовало */
  studentsAbsent: number | null;
}

/** Полный шаблон КСП */
export interface KspContent {
  /** Профиль старшей школы для выбора ТУП и генерации КСП. */
  schoolProfile?: SchoolProfile;
  /** Optional teacher-selected thresholds used only by the advisory quality gate. */
  qualityTargets?: KspQualityTargets;
  header: LessonHeader;
  /** Тема урока */
  topic: string;
  /** Цели обучения из программы (коды + тексты) */
  learningObjectives: Array<{
    code: string;
    text: string;
  }>;
  /** Цели урока (SMART) */
  lessonObjectives: string[];
  /** Критерии оценивания */
  assessmentCriteria: string[];
  /** Source metadata for criteria copied from the teacher's other KSPs. */
  assessmentCriterionSources?: ReusedCriterionSource[];
  /** Языковые цели: термины и ключевые фразы */
  languageObjectives: {
    terms: string[];
    phrases: string[];
  };
  /** Привитие ценностей */
  values: string;
  /** Межпредметные связи */
  crossCurricularLinks: string;
  /** Предшествующие знания */
  priorKnowledge: string;
  /** Ход урока */
  stages: {
    beginning: LessonStage;
    middle: LessonStage;
    end: LessonStage;
  };
  evaluation: LessonEvaluation;
}

/** Пустой КСП (используется как initialValue формы) */
export function emptyKsp(): KspContent {
  return {
    schoolProfile: undefined,
    header: {
      longTermPlanSection: "",
      school: "",
      date: "",
      teacherName: "",
      grade: "",
      studentsPresent: null,
      studentsAbsent: null,
    },
    topic: "",
    learningObjectives: [],
    lessonObjectives: [],
    assessmentCriteria: [],
    assessmentCriterionSources: [],
    languageObjectives: { terms: [], phrases: [] },
    values: "",
    crossCurricularLinks: "",
    priorKnowledge: "",
    stages: {
      beginning: emptyStage(),
      middle: emptyStage(),
      end: emptyStage(),
    },
    evaluation: {
      formativeAssessment: "",
      differentiation: "",
      healthAndSafety: "",
      reflection: "",
    },
  };
}

function emptyStage(): LessonStage {
  return {
    time: "",
    teacherActions: "",
    studentActions: "",
    resources: "",
    tasks: [],
  };
}

export interface LessonPlanRow {
  id: string;
  owner_id: string;
  title: string;
  subject_id: string | null;
  grade: number;
  quarter: number | null;
  /** Привязка к классу или группе учителя (необязательна: старые планы без неё). */
  class_id?: string | null;
  section: string | null;
  content: KspContent;
  visibility: Visibility;
  language: Language;
  /** Скрыт модерацией (видит только владелец). */
  moderationHidden?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubjectRow {
  id: string;
  name_ru: string;
  name_kz: string | null;
  grade_min: number;
  grade_max: number;
}

export interface LearningObjectiveRow {
  id: string;
  subject_id: string;
  grade: number;
  code: string;
  text_ru: string;
  text_kz: string | null;
  section: string | null;
}
