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

/** Предел тем в КТП. Объявлен здесь, чтобы форма и сервер считали одно и то же. */
export const MAX_KTP_TOPICS = 40;

/**
 * Часы и дата в строке темы.
 *
 * Учитель вписывает темы списком, но в календарном плане у каждой темы есть
 * количество часов и дата. Раньше часы жёстко равнялись 1, а дата ставилась
 * только первой строке, поэтому таблицу приходилось заполнять заново целиком.
 *
 * Поддерживаются два формата после темы:
 *   «Дроби · 2 ч.» — два часа;
 *   «Дроби | 2026-09-01» — конкретная дата.
 * Оба необязательны, тема без них остаётся корректной.
 */
// Хвостовые точки разрешены: учитель пишет «Дроби · 2 ч.» с точкой, и без
// неё в конце строка не распознавалась как часы — тема оставалась с часами 1.
const HOURS_SUFFIX = /(?:^|\s)[·|\-–—]\s*(\d{1,2})\s*(?:ч|сағ|hour)?\s*\.?\s*$/i;
const DATE_SUFFIX = /\s*[·|\-–—]\s*(\d{4}-\d{2}-\d{2})\s*$/;

interface ParsedTopicLine {
  topic: string;
  hours: number | null;
  date: string;
}

/** Разбирает одну строку списка тем. Неверная дата или часы остаются в теме. */
export function parseTopicLine(line: string, fallbackDate: string): ParsedTopicLine {
  let rest = line.trim();
  let date = "";
  let hours: number | null = null;

  const dateMatch = rest.match(DATE_SUFFIX);
  if (dateMatch?.[1]) {
    if (isCalendarDate(dateMatch[1])) {
      date = dateMatch[1];
      rest = rest.slice(0, dateMatch.index).trim();
    }
    // Дата в неверном формате остаётся в тексте темы: молча выбрасывать её
    // нельзя — иначе учитель не заметит собственную опечатку.
  }

  const hoursMatch = rest.match(HOURS_SUFFIX);
  if (hoursMatch?.[1]) {
    const value = Number(hoursMatch[1]);
    if (Number.isFinite(value) && value >= 1 && value <= 10) {
      hours = value;
      rest = rest.slice(0, hoursMatch.index).trim();
    }
  }

  return { topic: rest || line.trim(), hours, date: date || fallbackDate };
}

/**
 * Даты по неделям от первой.
 *
 * Раньше в таблице заполнялась только первая дата, а остальные строки
 * оставались пустыми — учителю приходилось проставлять их вручную. Теперь
 * каждая тема получает дату через неделю после предыдущей.
 *
 * Воскресенье пропускается: в школах Казахстана учебная неделя
 * шестидневная, воскресенье выходной. Праздники и каникулы в расчёт не
 * входят — их учитель правит вручную, и таблица для этого остаётся
 * редактируемой в Word.
 */
function weeklyDates(start: string, count: number): string[] {
  const dates: string[] = [];
  if (!start) return dates;
  const [year, month, day] = start.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  // Первая строка получает ровно ту дату, которую указал учитель: сдвигать её
  // на понедельник нельзя, это искажение введённых данных.
  dates.push(start);
  // Дальше — шаг в неделю, но шаг считается от последнего выданного дня, а не
  // от исходной даты: +7 от воскресенья снова попадает на воскресенье, и цикл
  // не заканчивался. От воскресенья шаг один день — на понедельник.
  let cursorDay = cursor.getUTCDay();
  while (dates.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() + (cursorDay === 0 ? 1 : 7));
    cursorDay = cursor.getUTCDay();
    if (cursorDay !== 0) dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

export type KtpRequest = z.infer<typeof ktpRequestSchema>;
export interface Ktp {
  title: string;
  subject: string;
  grade: number;
  language: Language;
  draft: true;
  rows: Array<{ number: number; topic: string; hours: number; date: string; objectives: string }>;
}

/**
 * Черновик КТП.
 *
 * Чистая функция: без обращения к учебной программе, без ИИ и без записи в
 * базу. Даты проставляются по неделям от указанной, часы берутся из строки
 * темы (по умолчанию 1).
 */
export function buildKtp(
  plan: Pick<LessonPlanRow, "title" | "grade" | "language" | "content">,
  subject: string,
  options: Pick<KtpRequest, "topics" | "startDate"> = {},
): Ktp {
  const sourceTopic = plan.content.topic.trim();
  const objectives = plan.content.learningObjectives
    .map(({ code, text }) => [code.trim(), text.trim()].filter(Boolean).join(" — "))
    .filter(Boolean).join("\n");

  const lines = options.topics ?? [sourceTopic];
  const parsed = lines.map((line) => parseTopicLine(line, ""));
  const dates = weeklyDates(options.startDate ?? "", parsed.length);

  return {
    title: plan.title,
    subject,
    grade: plan.grade,
    language: plan.language,
    draft: true,
    rows: parsed.map((entry, index) => ({
      number: index + 1,
      topic: entry.topic,
      hours: entry.hours ?? 1,
      date: entry.date || dates[index] || "",
      // Цели переносятся по совпадению темы без учёта регистра и лишних
      // пробелов. Раньше сравнение было точным, и та же тема, вписанная чуть
      // иначе, теряла цели урока.
      objectives: normalizeTopic(entry.topic) === normalizeTopic(sourceTopic) ? objectives : "",
    })),
  };
}

/** Ключ сравнения тем: без регистра, лишних пробелов и завершающей точки. */
function normalizeTopic(value: string): string {
  return value.toLocaleLowerCase("ru-KZ").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}
