import "server-only";
import { ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";
import type { AssignmentDoc, AttemptDoc } from "@/lib/assignments";

/**
 * Журнал успеваемости: агрегация результатов учеников по всем выдачам учителя.
 */

export interface GradebookRow {
  studentName: string;
  assignmentId: string;
  assignmentTitle: string;
  subject: string | null;
  grade: number | null;
  score: number;
  maxScore: number;
  percentage: number;
  attempts: number;
  date: string;
}

export interface StudentSummary {
  studentName: string;
  assignments: GradebookRow[];
  average: number;
  best: number;
  worst: number;
  totalAssignments: number;
}

export interface GradebookData {
  rows: GradebookRow[];
  students: StudentSummary[];
  assignments: Array<{ id: string; title: string; subject: string | null; grade: number | null }>;
}

/**
 * Получить все результаты учеников для учителя, сгруппированные по ученикам.
 */
export async function getTeacherGradebook(ownerId: string): Promise<GradebookData> {
  const db = await getDb();

  // Получаем все попытки учителя с информацией о выдачах
  const attempts = await db
    .collection<AttemptDoc>(COL.assignmentAttempts)
    .find({ owner_id: ownerId })
    .sort({ created_at: -1 })
    .limit(5000)
    .toArray();

  // Получаем все выдачи учителя для обогащения данных
  const assignments = await db
    .collection<AssignmentDoc>(COL.assignments)
    .find({ owner_id: ownerId })
    .limit(1000)
    .toArray();

  const assignmentMap = new Map(assignments.map((a) => [a._id?.toHexString() ?? "", a]));

  const rows: GradebookRow[] = [];
  for (const attempt of attempts) {
    const assignment = assignmentMap.get(attempt.assignment_id);
    const displayName = (attempt as { display_name?: string }).display_name ?? attempt.student_name;
    const maxScore = attempt.max_score || 1;
    rows.push({
      studentName: displayName,
      assignmentId: attempt.assignment_id,
      assignmentTitle: assignment?.title ?? "—",
      subject: assignment?.subject ?? null,
      grade: assignment?.grade ?? null,
      score: attempt.score,
      maxScore,
      percentage: Math.round((attempt.score / maxScore) * 100),
      attempts: attempt.attempts,
      date: attempt.created_at.toISOString(),
    });
  }

  // Группируем по ученикам
  const studentMap = new Map<string, GradebookRow[]>();
  for (const row of rows) {
    const existing = studentMap.get(row.studentName) ?? [];
    existing.push(row);
    studentMap.set(row.studentName, existing);
  }

  const students: StudentSummary[] = [];
  for (const [studentName, studentRows] of studentMap) {
    const scores = studentRows.map((r) => r.percentage);
    students.push({
      studentName,
      assignments: studentRows,
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      best: Math.max(...scores),
      worst: Math.min(...scores),
      totalAssignments: studentRows.length,
    });
  }

  // Сортируем учеников по имени
  students.sort((a, b) => a.studentName.localeCompare(b.studentName));

  // Список уникальных выдач
  const uniqueAssignments = new Map<string, { id: string; title: string; subject: string | null; grade: number | null }>();
  for (const row of rows) {
    if (!uniqueAssignments.has(row.assignmentId)) {
      uniqueAssignments.set(row.assignmentId, {
        id: row.assignmentId,
        title: row.assignmentTitle,
        subject: row.subject,
        grade: row.grade,
      });
    }
  }

  return {
    rows,
    students,
    assignments: Array.from(uniqueAssignments.values()),
  };
}

/**
 * Получить все результаты конкретного ученика.
 */
export async function getStudentResults(ownerId: string, studentName: string): Promise<StudentSummary | null> {
  const db = await getDb();

  const attempts = await db
    .collection<AttemptDoc>(COL.assignmentAttempts)
    .find({ owner_id: ownerId, student_name: studentName.toLowerCase() })
    .sort({ created_at: -1 })
    .limit(500)
    .toArray();

  if (attempts.length === 0) return null;

  // Получаем выдачи для обогащения
  const assignmentIds = [...new Set(attempts.map((a) => a.assignment_id))];
  const assignmentObjectIds = assignmentIds
    .filter((id) => /^[0-9a-f]{24}$/i.test(id))
    .map((id) => new ObjectId(id));
  const assignments = await db
    .collection<AssignmentDoc>(COL.assignments)
    .find({ _id: { $in: assignmentObjectIds }, owner_id: ownerId })
    .limit(100)
    .toArray();

  const assignmentMap = new Map(assignments.map((a) => [a._id?.toHexString() ?? "", a]));

  const rows: GradebookRow[] = [];
  for (const attempt of attempts) {
    const assignment = assignmentMap.get(attempt.assignment_id);
    const displayName = (attempt as { display_name?: string }).display_name ?? attempt.student_name;
    const maxScore = attempt.max_score || 1;
    rows.push({
      studentName: displayName,
      assignmentId: attempt.assignment_id,
      assignmentTitle: assignment?.title ?? "—",
      subject: assignment?.subject ?? null,
      grade: assignment?.grade ?? null,
      score: attempt.score,
      maxScore,
      percentage: Math.round((attempt.score / maxScore) * 100),
      attempts: attempt.attempts,
      date: attempt.created_at.toISOString(),
    });
  }

  const scores = rows.map((r) => r.percentage);
  return {
    studentName: rows[0].studentName,
    assignments: rows,
    average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    best: Math.max(...scores),
    worst: Math.min(...scores),
    totalAssignments: rows.length,
  };
}

/**
 * Экранирование значения для CSV.
 *
 * Раньше обрабатывались только запятая/кавычка/перевод строки, а функция
 * была продублирована в двух местах файла. Имя ученика задаёт сам ученик
 * при отправке ответа (до 100 символов), поэтому в ячейку могло попасть
 * `=HYPERLINK("http://evil","Открыть")` или `+cmd|...`. Excel и LibreOffice
 * выполняют такие формулы при открытии файла — учитель скачивал журнал и
 * запускал чужой код на своём компьютере.
 *
 * Стандартный приём: значение, начинающееся с символа формулы,
 * оборачивается в апостроф.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@"];

export function escapeCsvValue(value: string | number | null): string {
  // Убираем невидимые символы, которые Excel игнорирует при разборе
  // формулы: `=\u0001A1` иначе прошёл бы как «обычный текст».
  // Переводы строк и табуляцию НАМЕРЕННО сохраняем — они легитимная часть
  // значения, и их удаление склеивало строки, ломая структуру CSV.
  // eslint-disable-next-line no-control-regex
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\ufeff]/g, "")
    .trim();

  const safe = FORMULA_TRIGGERS.includes(cleaned[0] ?? "") ? `'${cleaned}` : cleaned;

  if (safe.includes(",") || safe.includes('"') || safe.includes("\n") || safe.includes("\r")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Экспорт журнала в CSV.
 */
export function exportGradebookToCsv(data: GradebookData): string {
  const headers = [
    "Ученик",
    "Выдача",
    "Предмет",
    "Класс",
    "Балл",
    "Макс. балл",
    "Процент",
    "Попыток",
    "Дата",
  ];

  const lines = [headers.map(escapeCsvValue).join(",")];

  for (const row of data.rows) {
    lines.push(
      [
        row.studentName,
        row.assignmentTitle,
        row.subject ?? "",
        row.grade ?? "",
        row.score,
        row.maxScore,
        `${row.percentage}%`,
        row.attempts,
        new Date(row.date).toLocaleDateString("ru-RU"),
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  }

  // BOM для корректного отображения кириллицы в Excel
  return "\uFEFF" + lines.join("\n");
}

/**
 * Экспорт результатов ученика в CSV.
 */
export function exportStudentToCsv(student: StudentSummary): string {
  const headers = [
    "Выдача",
    "Предмет",
    "Класс",
    "Балл",
    "Макс. балл",
    "Процент",
    "Попыток",
    "Дата",
  ];

  const lines = [headers.map(escapeCsvValue).join(",")];

  for (const row of student.assignments) {
    lines.push(
      [
        row.assignmentTitle,
        row.subject ?? "",
        row.grade ?? "",
        row.score,
        row.maxScore,
        `${row.percentage}%`,
        row.attempts,
        new Date(row.date).toLocaleDateString("ru-RU"),
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  }

  return "\uFEFF" + lines.join("\n");
}
