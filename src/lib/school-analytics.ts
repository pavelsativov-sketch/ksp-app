import { ObjectId, type Filter } from "mongodb";
import { getDb, COL } from "./mongo";
import type { StudentDoc } from "./school";

export interface AttendanceRecord {
  _id?: ObjectId;
  school_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent_excused' | 'absent_unexcused' | 'late';
  subject?: string;
  recorded_by: string;
  created_at: Date;
}

export interface GradeRecord {
  _id?: ObjectId;
  school_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
  subject: string;
  teacher_id: string;
  quarter: number; // 1-4
  type: 'current' | 'sor' | 'soch'; // СОР/СОЧ
  score: number;
  max_score: number;
  topic?: string;
  date: string;
  created_at: Date;
}

export interface CurriculumDoc {
  _id?: ObjectId;
  school_id: string;
  teacher_id: string;
  subject: string;
  class_name: string;
  academic_year: string;
  total_hours: number;
  lessons: CurriculumLesson[];
  created_at: Date;
  updated_at: Date;
}

export interface CurriculumLesson {
  number: number;
  topic: string;
  planned_date: string;
  actual_date?: string;
  status: 'planned' | 'completed' | 'skipped' | 'rescheduled';
  notes?: string;
}

export interface VskInspection {
  _id?: ObjectId;
  school_id: string;
  inspector_id: string;
  inspector_name: string;
  teacher_id: string;
  teacher_name: string;
  subject: string;
  class_name: string;
  date: string;
  direction: string; // e.g. "Посещение урока", "Проверка документации"
  checklist: VskCheckItem[];
  overall_score: number; // 0-100
  findings: string;
  recommendations: string;
  status: 'draft' | 'completed';
  created_at: Date;
}

export interface VskCheckItem {
  criterion: string;
  score: number; // 0-5
  max_score: number;
  comment?: string;
}

export interface Issue {
  type: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

// Analytics functions
export async function getAttendanceSummary(schoolId: string, dateFrom: string, dateTo: string, classNames?: readonly string[]): Promise<{ _id: string; count: number }[]> {
  if (classNames?.length === 0) return [];
  const db = await getDb();
  const match: Filter<AttendanceRecord> = { school_id: schoolId, date: { $gte: dateFrom, $lte: dateTo } };
  if (classNames) match.class_name = { $in: [...classNames] };
  return db.collection(COL.attendance).aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]).toArray();
}

export async function getAttendanceByClass(schoolId: string, className: string, dateFrom: string, dateTo: string): Promise<AttendanceRecord[]> {
  const db = await getDb();
  return db.collection<AttendanceRecord>(COL.attendance).find({
    school_id: schoolId,
    class_name: className,
    date: { $gte: dateFrom, $lte: dateTo }
  }).toArray();
}

/** Посещаемость по классам: % present на класс (по всей истории). */
export async function getAttendancePerClass(schoolId: string): Promise<{ className: string; rate: number; total: number }[]> {
  const db = await getDb();
  const rows = await db.collection<AttendanceRecord>(COL.attendance).aggregate<{ _id: string; present: number; total: number }>([
    { $match: { school_id: schoolId } },
    { $group: { _id: "$class_name", present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } }, total: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  return rows.map((r) => ({ className: r._id, rate: r.total ? r.present / r.total : 0, total: r.total }));
}

/** Посещаемость по дням (для мини-графика): дата → % present. */
export async function getAttendancePerDay(schoolId: string): Promise<{ date: string; rate: number }[]> {
  const db = await getDb();
  const rows = await db.collection<AttendanceRecord>(COL.attendance).aggregate<{ _id: string; present: number; total: number }>([
    { $match: { school_id: schoolId } },
    { $group: { _id: "$date", present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } }, total: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  return rows.map((r) => ({ date: r._id, rate: r.total ? r.present / r.total : 0 }));
}

export async function getQualityMetrics(schoolId: string, quarter?: number, classNames?: readonly string[]): Promise<{ _id: string; average_score: number }[]> {
  if (classNames?.length === 0) return [];
  const db = await getDb();
  const match: Filter<GradeRecord> = { school_id: schoolId };
  if (quarter) match.quarter = quarter;
  if (classNames) match.class_name = { $in: [...classNames] };

  // max_score > 0 в $match: голый $divide при max_score = 0 или отсутствии
  // поля даёт NaN, из-за чего весь $group (и весь дашборд) падал.
  const safeMatch: Filter<GradeRecord> = { ...match, max_score: { $gt: 0 } };

  return db.collection<GradeRecord>(COL.schoolGrades).aggregate<{ _id: string; average_score: number }>([
    { $match: safeMatch },
    { $group: { _id: "$subject", average_score: { $avg: { $divide: ["$score", "$max_score"] } } } },
  ]).toArray();
}

export async function getCurriculumProgress(schoolId: string, teacherId?: string): Promise<CurriculumDoc[]> {
  const db = await getDb();
  const filter: Filter<CurriculumDoc> = { school_id: schoolId };
  if (teacherId) filter.teacher_id = teacherId;
  return db.collection<CurriculumDoc>(COL.curriculum).find(filter).toArray();
}

/**
 * Сводка по ВШК.
 *
 * Параметр `period` РАНЬШЕ полностью игнорировался: функция подписывала его,
 * а запрос шёл без фильтра по дате. Вызывающий код запрашивал сводку за
 * период и получал все проверки школы за всё время — цифры на дашборде были
 * завышены, а учитель не мог понять, почему «за четверть» столько же
 * проверок, сколько за год.
 *
 * Период задаётся как `ГГГГ-ММ` или `ГГГГ-ММ..ГГГГ-ММ`.
 */
export async function getVskSummary(schoolId: string, period?: string, teacherId?: string): Promise<VskInspection[]> {
  const db = await getDb();
  const filter: Record<string, unknown> = { school_id: schoolId };
  if (teacherId) filter.teacher_id = teacherId;

  const range = parsePeriodRange(period);
  if (range) {
    filter.date = { $gte: range.from, $lte: range.to };
  }

  return db.collection<VskInspection>(COL.vskInspections).find(filter).toArray();
}

/**
 * Разбирает «ГГГГ-ММ» или «ГГГГ-ММ..ГГГГ-ММ» в границы дат (строки YYYY-MM).
 * Возвращает null для пустого/некорректного значения — тогда фильтр не
 * добавляется и поведение совпадает с прежним.
 */
export function parsePeriodRange(
  period?: string,
): { from: string; to: string } | null {
  if (!period) return null;
  const raw = period.trim();
  if (!raw) return null;

  if (raw.includes("..")) {
    const [fromRaw, toRaw] = raw.split("..", 2);
    const from = normalizeMonth(fromRaw ?? "");
    const to = normalizeMonth(toRaw ?? "");
    if (!from || !to) return null;
    return from <= to ? { from, to } : { from: to, to: from };
  }

  const month = normalizeMonth(raw);
  if (!month) return null;
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function normalizeMonth(value: string): string | null {
  const m = value.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export interface SchoolOverview {
  hasData: boolean;
  students: number;
  teachers: number;
  classes: number;
  /** % посещаемости за всю собранную историю (present / все записи). */
  attendanceRate: number | null;
  /** Среднее качество знаний: score/max по всем оценкам, 0..1. */
  qualityScore: number | null;
  /** Доля пройденных уроков по КТП (status=completed), 0..1. */
  curriculumProgress: number | null;
  /** Средний балл ВШК по проверкам, 0..100. */
  vskAverage: number | null;
  score: number;
  issues: Issue[];
  warnings: Issue[];
}

/** Реальная сводка по школе из коллекций (не мок): посещаемость + оценки + КТП + ВШК. */
export async function getSchoolOverview(schoolId: string): Promise<SchoolOverview> {
  const db = await getDb();
  const since = new Date(Date.now() - 60 * 24 * 3600_000);

  const [students, teachers, classes, attendance, quality, curriculum, vsk] = await Promise.all([
    db.collection(COL.students).countDocuments({ school_id: schoolId, $or: [{ status: 'active' }, { status: { $exists: false } }] }),
    db.collection(COL.schoolMembers).countDocuments({ school_id: schoolId, role: { $in: ['teacher', 'director', 'deputy'] } }),
    db.collection<StudentDoc>(COL.students).distinct('class_name', { school_id: schoolId, $or: [{ status: 'active' }, { status: { $exists: false } }] }),
    db.collection<AttendanceRecord>(COL.attendance).aggregate<{ _id: string; count: number }>([
      { $match: { school_id: schoolId, date: { $gte: new Date(since).toISOString().slice(0, 10) } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection<GradeRecord>(COL.schoolGrades).aggregate<{ avg: number | null }>([
      // Защита знаменателя. Раньше здесь стоял голый $divide: при
      // max_score = 0 (или отсутствии поля) он давал NaN/ошибку, и весь
      // $group падал — то есть дашборд школы отдавал 500 из-за одной
      // некорректно заведённой оценки.
      { $match: { school_id: schoolId, max_score: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: { $divide: ['$score', '$max_score'] } } } },
    ]).toArray(),
    db.collection<CurriculumDoc>(COL.curriculum).find({ school_id: schoolId }).toArray(),
    db.collection<VskInspection>(COL.vskInspections).aggregate<{ avg: number | null }>([
      { $match: { school_id: schoolId, status: 'completed' } },
      { $group: { _id: null, avg: { $avg: '$overall_score' } } },
    ]).toArray(),
  ]);

  const totalMarks = attendance.reduce((s, r) => s + r.count, 0);
  const present = attendance.filter((r) => r._id === 'present').reduce((s, r) => s + r.count, 0);
  const attendanceRate = totalMarks > 0 ? present / totalMarks : null;
  const qualityScore = quality[0]?.avg ?? null;
  const lessons = curriculum.flatMap((c) => c.lessons);
  const curriculumProgress = lessons.length
    ? lessons.filter((l) => l.status === 'completed').length / lessons.length
    : null;
  const vskAverage = vsk[0]?.avg ?? null;

  const parts = [attendanceRate, qualityScore, curriculumProgress].filter((v): v is number => v !== null);
  const score = parts.length ? Math.round((parts.reduce((s, v) => s + v, 0) / parts.length) * 100) : 0;

  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  if (attendanceRate !== null && attendanceRate < 0.85) {
    issues.push({ type: 'attendance', description: `Посещаемость ${Math.round(attendanceRate * 100)}% — ниже нормы 85%`, severity: attendanceRate < 0.75 ? 'high' : 'medium' });
  }
  if (qualityScore !== null && qualityScore < 0.6) {
    warnings.push({ type: 'grades', description: `Качество знаний ${Math.round(qualityScore * 100)}% — ниже целевых 60%`, severity: 'medium' });
  }
  if (curriculumProgress !== null && curriculumProgress < 0.7) {
    warnings.push({ type: 'curriculum', description: `По КТП пройдено ${Math.round(curriculumProgress * 100)}% уроков`, severity: 'low' });
  }

  return {
    hasData: totalMarks > 0 || lessons.length > 0 || students > 0 || vsk.length > 0 || qualityScore !== null,
    students, teachers, classes: classes.length,
    attendanceRate, qualityScore, curriculumProgress, vskAverage,
    score, issues, warnings,
  };
}
