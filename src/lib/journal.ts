import { ObjectId } from "mongodb";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import type { AssignmentDoc, AttemptDoc } from "@/lib/assignments";
import { escapeCsvValue } from "@/lib/gradebook";

export type AttendanceStatus = "excused" | "unexcused" | "sick";

export const ATTENDANCE_CODES: Record<AttendanceStatus, { ru: string; kz: string; fullRu: string; fullKz: string }> = {
  excused: {
    ru: "УП",
    kz: "ДС",
    fullRu: "Уважительная причина",
    fullKz: "Дәлелді себеп",
  },
  unexcused: {
    ru: "НП",
    kz: "ДЖ",
    fullRu: "Неуважительная причина",
    fullKz: "Дәлелсіз себеп",
  },
  sick: {
    ru: "Б",
    kz: "А",
    fullRu: "По болезни",
    fullKz: "Ауруына байланысты",
  },
};

export interface JournalStudentDoc {
  _id?: ObjectId;
  owner_id: string;
  school_id?: string | null;
  full_name: string;
  normalized_name: string;
  class_name: string;
  source: "homework" | "manual" | "school";
  created_at: Date;
  updated_at: Date;
}

export interface JournalEntryDoc {
  /** Детерминированный ключ: ownerId:studentId:subject:date */
  _id: string;
  owner_id: string;
  student_id: string;
  class_name: string;
  subject: string;
  /** YYYY-MM-DD */
  date: string;
  score: number | null;
  attendance: AttendanceStatus | null;
  note?: string;
  assignment_id?: string | null;
  updated_at: Date;
}

export interface JournalStudentView {
  id: string;
  fullName: string;
  className: string;
  source: "homework" | "manual" | "school";
  averageScore: number | null;
  scoresCount: number;
  qualityPercent: number | null;
  excusedCount: number;
  unexcusedCount: number;
  sickCount: number;
}

export interface JournalEntryView {
  studentId: string;
  subject: string;
  date: string;
  score: number | null;
  attendance: AttendanceStatus | null;
  note?: string;
  assignmentId?: string | null;
}

export interface HomeworkAssignmentOption {
  id: string;
  title: string;
  subject: string;
  className: string;
  attemptsCount: number;
  latestDate: string;
}

export interface JournalState {
  students: JournalStudentView[];
  classes: string[];
  subjects: string[];
  dates: string[];
  entries: JournalEntryView[];
  assignments: HomeworkAssignmentOption[];
}

export function normalizeStudentName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function cleanStudentDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 100);
}

export function cleanClassName(raw: string | null | undefined, fallbackGrade?: number | null): string {
  const trimmed = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
  if (trimmed) return trimmed;
  if (fallbackGrade && Number.isFinite(fallbackGrade)) return `${fallbackGrade} класс`;
  return "Общий класс";
}

export function cleanSubjectName(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return trimmed || "Общий предмет";
}

/**
 * Перевод результата ДЗ в 10-балльную шкалу ФО РК (минимум 1, максимум 10 баллов).
 * Если ученик набрал 0 из N, ставится 1 балл (в 10-балльной шкале ФО диапазон 1–10).
 */
export function scaleHomeworkToTen(score: number, maxScore: number): number {
  const safeMax = Math.max(1, maxScore);
  const raw = Math.round((Math.max(0, score) / safeMax) * 10);
  return Math.min(10, Math.max(1, raw));
}

export function makeEntryId(ownerId: string, studentId: string, subject: string, date: string): string {
  return `${ownerId}:${studentId}:${subject.toLowerCase()}:${date}`;
}

/**
 * Автоматически пополняет базу учеников ФИО из всех выполненных ДЗ учителя
 * (а также из школьного списка students, если у учителя есть активная школа).
 */
export async function syncRosterFromHomework(
  ownerId: string,
  schoolId?: string | null,
): Promise<{ added: number; total: number }> {
  const db = await getDb();
  const studentsCol = db.collection<JournalStudentDoc>(COL.journalStudents);

  const [attempts, assignments, schoolStudents] = await Promise.all([
    db
      .collection<AttemptDoc>(COL.assignmentAttempts)
      .find({ owner_id: ownerId })
      .sort({ created_at: -1 })
      .limit(2000)
      .toArray(),
    db
      .collection<AssignmentDoc>(COL.assignments)
      .find({ owner_id: ownerId })
      .limit(500)
      .toArray(),
    schoolId && /^[0-9a-f]{24}$/i.test(schoolId)
      ? db
          .collection<{ full_name?: string; class_name?: string }>(COL.students)
          .find({ school_id: schoolId })
          .limit(1000)
          .toArray()
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const assignmentMap = new Map(
    assignments.map((a) => [a._id?.toHexString() ?? "", a]),
  );

  const candidates = new Map<
    string,
    { fullName: string; normalizedName: string; className: string; source: "homework" | "school" }
  >();

  for (const attempt of attempts) {
    const rawName = (attempt as { display_name?: string }).display_name ?? attempt.student_name;
    const fullName = cleanStudentDisplayName(rawName || "");
    if (fullName.length < 2) continue;
    const normalizedName = normalizeStudentName(fullName);
    const assignment = assignmentMap.get(attempt.assignment_id);
    const className = cleanClassName(
      (assignment as { class_name?: string | null } | undefined)?.class_name,
      assignment?.grade ?? null,
    );
    const key = `${className.toLowerCase()}::${normalizedName}`;
    if (!candidates.has(key)) {
      candidates.set(key, { fullName, normalizedName, className, source: "homework" });
    }
  }

  for (const st of schoolStudents) {
    const fullName = cleanStudentDisplayName(st.full_name ?? "");
    if (fullName.length < 2) continue;
    const normalizedName = normalizeStudentName(fullName);
    const className = cleanClassName(st.class_name, null);
    const key = `${className.toLowerCase()}::${normalizedName}`;
    if (!candidates.has(key)) {
      candidates.set(key, { fullName, normalizedName, className, source: "school" });
    }
  }

  let added = 0;
  const now = new Date();
  for (const item of candidates.values()) {
    const res = await studentsCol.updateOne(
      {
        owner_id: ownerId,
        class_name: item.className,
        normalized_name: item.normalizedName,
      },
      {
        $setOnInsert: {
          owner_id: ownerId,
          school_id: schoolId ?? null,
          full_name: item.fullName,
          normalized_name: item.normalizedName,
          class_name: item.className,
          source: item.source,
          created_at: now,
          updated_at: now,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount > 0) added++;
  }

  const total = await studentsCol.countDocuments({ owner_id: ownerId });
  return { added, total };
}

/** Ручное добавление одного или списка учеников (ФИО построчно) в указанный класс. */
export async function addJournalStudents(
  ownerId: string,
  input: { className: string; names: string[]; schoolId?: string | null },
): Promise<{ added: number }> {
  const db = await getDb();
  const studentsCol = db.collection<JournalStudentDoc>(COL.journalStudents);
  const className = cleanClassName(input.className);
  const now = new Date();
  let added = 0;

  for (const raw of input.names.slice(0, 80)) {
    const fullName = cleanStudentDisplayName(raw.replace(/^\s*\d+[.)]\s*/, ""));
    if (fullName.length < 2) continue;
    const normalizedName = normalizeStudentName(fullName);
    const res = await studentsCol.updateOne(
      { owner_id: ownerId, class_name: className, normalized_name: normalizedName },
      {
        $set: { full_name: fullName, updated_at: now },
        $setOnInsert: {
          owner_id: ownerId,
          school_id: input.schoolId ?? null,
          normalized_name: normalizedName,
          class_name: className,
          source: "manual",
          created_at: now,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount > 0) added++;
    if (input.schoolId && /^[0-9a-f]{24}$/i.test(input.schoolId)) {
      const parsedGrade = Number.parseInt(className, 10);
      await db.collection(COL.students).updateOne(
        { school_id: input.schoolId, full_name: fullName, class_name: className },
        {
          $setOnInsert: {
            school_id: input.schoolId,
            full_name: fullName,
            class_name: className,
            class_grade: Number.isFinite(parsedGrade) && parsedGrade >= 1 && parsedGrade <= 12 ? parsedGrade : 7,
            gender: "M",
            status: "active",
            created_at: now,
          },
        },
        { upsert: true },
      );
    }
  }
  return { added };
}

export async function deleteJournalStudent(ownerId: string, studentId: string): Promise<boolean> {
  const oid = toObjectId(studentId);
  if (!oid) return false;
  const db = await getDb();
  const res = await db.collection<JournalStudentDoc>(COL.journalStudents).deleteOne({
    _id: oid,
    owner_id: ownerId,
  });
  if (res.deletedCount > 0) {
    await db.collection<JournalEntryDoc>(COL.journalEntries).deleteMany({
      owner_id: ownerId,
      student_id: studentId,
    });
    return true;
  }
  return false;
}

/**
 * Запись в ячейку электронного журнала:
 *  - либо балл 1..10 (score),
 *  - либо отметка посещаемости ("excused" | "unexcused" | "sick"),
 *  - либо очистка ячейки (score = null && attendance = null).
 */
export async function setJournalCell(
  ownerId: string,
  input: {
    studentId: string;
    subject: string;
    date: string;
    score?: number | null;
    attendance?: AttendanceStatus | null;
    note?: string;
  },
): Promise<void> {
  const oid = toObjectId(input.studentId);
  if (!oid) throw new Error("Некорректный идентификатор ученика");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Некорректная дата урока");
  }

  const db = await getDb();
  const student = await db
    .collection<JournalStudentDoc>(COL.journalStudents)
    .findOne({ _id: oid, owner_id: ownerId });
  if (!student) throw new Error("Ученик не найден");

  const subject = cleanSubjectName(input.subject);
  const entryId = makeEntryId(ownerId, input.studentId, subject, input.date);
  const entriesCol = db.collection<JournalEntryDoc>(COL.journalEntries);

  const hasScore = typeof input.score === "number" && Number.isFinite(input.score);
  const hasAttendance =
    input.attendance === "excused" ||
    input.attendance === "unexcused" ||
    input.attendance === "sick";

  if (!hasScore && !hasAttendance) {
    await entriesCol.deleteOne({ _id: entryId, owner_id: ownerId });
    if (student.school_id) {
      await Promise.all([
        db.collection(COL.attendance).deleteMany({
          school_id: student.school_id,
          student_id: input.studentId,
          date: input.date,
          subject,
        }),
        db.collection(COL.schoolGrades).deleteMany({
          school_id: student.school_id,
          student_id: input.studentId,
          date: input.date,
          subject,
          type: "current",
        }),
      ]);
    }
    return;
  }

  if (hasScore && (input.score! < 1 || input.score! > 10 || !Number.isInteger(input.score))) {
    throw new Error("Балл в электронном журнале должен быть целым числом от 1 до 10");
  }

  const now = new Date();
  await entriesCol.updateOne(
    { _id: entryId, owner_id: ownerId },
    {
      $set: {
        owner_id: ownerId,
        student_id: input.studentId,
        class_name: student.class_name,
        subject,
        date: input.date,
        score: hasScore ? input.score! : null,
        attendance: hasScore ? null : (input.attendance ?? null),
        ...(input.note !== undefined ? { note: input.note.slice(0, 200) } : {}),
        updated_at: now,
      },
    },
    { upsert: true },
  );

  // Зеркалируем отметки посещаемости и баллы в школьную аналитику, если учитель состоит в школе.
  let activeSchoolId = student.school_id ?? null;
  if (!activeSchoolId) {
    const membership = await db
      .collection<{ school_id?: string }>(COL.schoolMembers)
      .findOne({ user_id: ownerId }, { projection: { school_id: 1 } });
    activeSchoolId = membership?.school_id ?? null;
  }
  if (activeSchoolId) {
    const attendanceStatus = hasScore
      ? "present"
      : input.attendance === "unexcused"
        ? "absent_unexcused"
        : "absent_excused";
    await db.collection(COL.attendance).updateOne(
      {
        school_id: activeSchoolId,
        student_id: input.studentId,
        date: input.date,
        subject,
      },
      {
        $set: {
          school_id: activeSchoolId,
          student_id: input.studentId,
          student_name: student.full_name,
          class_name: student.class_name,
          date: input.date,
          subject,
          status: attendanceStatus,
          recorded_by: ownerId,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );

    if (hasScore) {
      await db.collection(COL.schoolGrades).updateOne(
        {
          school_id: activeSchoolId,
          student_id: input.studentId,
          date: input.date,
          subject,
          type: "current",
        },
        {
          $set: {
            school_id: activeSchoolId,
            student_id: input.studentId,
            student_name: student.full_name,
            class_name: student.class_name,
            subject,
            teacher_id: ownerId,
            quarter: 1,
            type: "current",
            score: input.score!,
            max_score: 10,
            date: input.date,
          },
          $setOnInsert: { created_at: now },
        },
        { upsert: true },
      );
    } else {
      await db.collection(COL.schoolGrades).deleteMany({
        school_id: activeSchoolId,
        student_id: input.studentId,
        date: input.date,
        subject,
        type: "current",
      });
    }
  }
}

/**
 * Переносит результаты выбранного ДЗ в электронный журнал по 10-балльной шкале.
 * Если ученик из ДЗ ещё не был в классе — создаёт его автоматически.
 */
export async function importAssignmentToJournal(
  ownerId: string,
  input: {
    assignmentId: string;
    className?: string;
    subject?: string;
    date?: string;
  },
): Promise<{ imported: number; date: string; subject: string; className: string }> {
  const oid = toObjectId(input.assignmentId);
  if (!oid) throw new Error("Некорректный идентификатор выдачи ДЗ");

  const db = await getDb();
  const assignment = await db
    .collection<AssignmentDoc>(COL.assignments)
    .findOne({ _id: oid, owner_id: ownerId });
  if (!assignment) throw new Error("Выдача ДЗ не найдена");

  const attempts = await db
    .collection<AttemptDoc>(COL.assignmentAttempts)
    .find({ owner_id: ownerId, assignment_id: input.assignmentId })
    .sort({ score: -1, created_at: -1 })
    .limit(500)
    .toArray();

  const targetClass = cleanClassName(
    input.className || (assignment as { class_name?: string | null }).class_name,
    assignment.grade ?? null,
  );
  const targetSubject = cleanSubjectName(input.subject || assignment.subject);
  const targetDate =
    input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
      ? input.date
      : (attempts[0]?.created_at ?? new Date()).toISOString().slice(0, 10);

  const studentsCol = db.collection<JournalStudentDoc>(COL.journalStudents);
  const entriesCol = db.collection<JournalEntryDoc>(COL.journalEntries);

  // Берём лучший результат каждого ученика по этой выдаче
  const seen = new Set<string>();
  let imported = 0;
  const now = new Date();

  for (const att of attempts) {
    const rawName = (att as { display_name?: string }).display_name ?? att.student_name;
    const fullName = cleanStudentDisplayName(rawName || "");
    if (fullName.length < 2) continue;
    const normalizedName = normalizeStudentName(fullName);
    if (seen.has(normalizedName)) continue;
    seen.add(normalizedName);

    let studentDoc = await studentsCol.findOne({
      owner_id: ownerId,
      class_name: targetClass,
      normalized_name: normalizedName,
    });

    if (!studentDoc) {
      const inserted = await studentsCol.insertOne({
        owner_id: ownerId,
        full_name: fullName,
        normalized_name: normalizedName,
        class_name: targetClass,
        source: "homework",
        created_at: now,
        updated_at: now,
      });
      studentDoc = {
        _id: inserted.insertedId,
        owner_id: ownerId,
        full_name: fullName,
        normalized_name: normalizedName,
        class_name: targetClass,
        source: "homework",
        created_at: now,
        updated_at: now,
      };
    }

    const studentId = studentDoc._id!.toHexString();
    const scaled = scaleHomeworkToTen(att.score, att.max_score || 1);
    const entryId = makeEntryId(ownerId, studentId, targetSubject, targetDate);

    await entriesCol.updateOne(
      { _id: entryId, owner_id: ownerId },
      {
        $set: {
          owner_id: ownerId,
          student_id: studentId,
          class_name: targetClass,
          subject: targetSubject,
          date: targetDate,
          score: scaled,
          attendance: null,
          note: `ДЗ: ${assignment.title} (${att.score}/${att.max_score})`.slice(0, 200),
          assignment_id: input.assignmentId,
          updated_at: now,
        },
      },
      { upsert: true },
    );
    imported++;
  }

  return { imported, date: targetDate, subject: targetSubject, className: targetClass };
}

/** Чтение полного состояния электронного журнала учителя (с авто-синхронизацией ФИО из выполненных ДЗ). */
export async function getJournalState(
  ownerId: string,
  options: { schoolId?: string | null; syncHomework?: boolean; className?: string; subject?: string } = {},
): Promise<JournalState> {
  if (options.syncHomework !== false) {
    await syncRosterFromHomework(ownerId, options.schoolId).catch(() => {});
  }

  const db = await getDb();
  const [studentDocs, entryDocs, assignments, attempts] = await Promise.all([
    db
      .collection<JournalStudentDoc>(COL.journalStudents)
      .find({ owner_id: ownerId })
      .sort({ class_name: 1, full_name: 1 })
      .limit(2000)
      .toArray(),
    db
      .collection<JournalEntryDoc>(COL.journalEntries)
      .find({ owner_id: ownerId })
      .sort({ date: 1 })
      .limit(10_000)
      .toArray(),
    db
      .collection<AssignmentDoc>(COL.assignments)
      .find({ owner_id: ownerId })
      .sort({ created_at: -1 })
      .limit(200)
      .toArray(),
    db
      .collection<AttemptDoc>(COL.assignmentAttempts)
      .find({ owner_id: ownerId })
      .sort({ created_at: -1 })
      .limit(2000)
      .toArray(),
  ]);

  const classesSet = new Set<string>();
  for (const s of studentDocs) classesSet.add(s.class_name);
  const classes = Array.from(classesSet).sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));

  const subjectsSet = new Set<string>();
  for (const e of entryDocs) subjectsSet.add(e.subject);
  for (const a of assignments) {
    if (a.subject) subjectsSet.add(cleanSubjectName(a.subject));
  }
  if (subjectsSet.size === 0) subjectsSet.add("Общий предмет");
  const subjects = Array.from(subjectsSet).sort((a, b) => a.localeCompare(b, "ru"));

  const activeSubject = options.subject ? cleanSubjectName(options.subject) : null;
  const activeClass = options.className ? options.className.trim() : null;

  const filteredEntries = entryDocs.filter((e) => {
    if (activeClass && e.class_name !== activeClass) return false;
    if (activeSubject && e.subject !== activeSubject) return false;
    return true;
  });

  const entriesByStudent = new Map<string, JournalEntryDoc[]>();
  const datesSet = new Set<string>();
  for (const e of filteredEntries) {
    datesSet.add(e.date);
    const arr = entriesByStudent.get(e.student_id) ?? [];
    arr.push(e);
    entriesByStudent.set(e.student_id, arr);
  }

  const dates = Array.from(datesSet).sort();

  const students: JournalStudentView[] = studentDocs
    .filter((s) => !activeClass || s.class_name === activeClass)
    .map((s) => {
      const id = s._id!.toHexString();
      const sEntries = entriesByStudent.get(id) ?? [];
      const scores = sEntries
        .map((e) => e.score)
        .filter((v): v is number => typeof v === "number" && v >= 1 && v <= 10);
      const averageScore =
        scores.length > 0
          ? Math.round((scores.reduce((acc, v) => acc + v, 0) / scores.length) * 10) / 10
          : null;
      const qualityPercent =
        scores.length > 0
          ? Math.round((scores.filter((v) => v >= 7).length / scores.length) * 100)
          : null;
      const excusedCount = sEntries.filter((e) => e.attendance === "excused").length;
      const unexcusedCount = sEntries.filter((e) => e.attendance === "unexcused").length;
      const sickCount = sEntries.filter((e) => e.attendance === "sick").length;

      return {
        id,
        fullName: s.full_name,
        className: s.class_name,
        source: s.source,
        averageScore,
        scoresCount: scores.length,
        qualityPercent,
        excusedCount,
        unexcusedCount,
        sickCount,
      };
    });

  // Агрегация выполненных ДЗ для кнопки «Импортировать баллы ДЗ в журнал»
  const attemptsByAssignment = new Map<string, { count: number; latest: Date }>();
  for (const att of attempts) {
    const prev = attemptsByAssignment.get(att.assignment_id);
    if (!prev) {
      attemptsByAssignment.set(att.assignment_id, { count: 1, latest: att.created_at });
    } else {
      prev.count++;
      if (att.created_at > prev.latest) prev.latest = att.created_at;
    }
  }

  const assignmentOptions: HomeworkAssignmentOption[] = assignments
    .map((a) => {
      const id = a._id?.toHexString() ?? "";
      const stat = attemptsByAssignment.get(id);
      return {
        id,
        title: a.title,
        subject: cleanSubjectName(a.subject),
        className: cleanClassName((a as { class_name?: string | null }).class_name, a.grade ?? null),
        attemptsCount: stat?.count ?? 0,
        latestDate: (stat?.latest ?? a.created_at).toISOString().slice(0, 10),
      };
    })
    .filter((a) => a.attemptsCount > 0);

  return {
    students,
    classes,
    subjects,
    dates,
    entries: filteredEntries.map((e) => ({
      studentId: e.student_id,
      subject: e.subject,
      date: e.date,
      score: e.score,
      attendance: e.attendance,
      note: e.note,
      assignmentId: e.assignment_id,
    })),
    assignments: assignmentOptions,
  };
}

function cellText(entry: JournalEntryView | undefined, lang: "ru" | "kz" = "ru"): string {
  if (!entry) return "";
  if (typeof entry.score === "number") return String(entry.score);
  if (entry.attendance) return ATTENDANCE_CODES[entry.attendance][lang];
  return "";
}

/** Экспорт электронного журнала в CSV (с защитой от формул Excel). */
export function exportJournalToCsv(
  state: JournalState,
  meta: { className?: string; subject?: string; lang?: "ru" | "kz" } = {},
): string {
  const lang = meta.lang ?? "ru";
  const dates = state.dates;
  const entryMap = new Map<string, JournalEntryView>();
  for (const e of state.entries) {
    entryMap.set(`${e.studentId}:${e.date}`, e);
  }

  const headers =
    lang === "kz"
      ? [
          "№",
          "Оқушының аты-жөні",
          "Сынып",
          ...dates,
          "Орташа балл (10)",
          "Сапа %",
          "ДС (дәлелді)",
          "ДЖ (дәлелсіз)",
          "А (ауру)",
        ]
      : [
          "№",
          "ФИО ученика",
          "Класс",
          ...dates,
          "Ср. балл (из 10)",
          "% качества",
          "УП (уваж.)",
          "НП (неуваж.)",
          "Б (болезнь)",
        ];

  const lines = [headers.map(escapeCsvValue).join(",")];
  state.students.forEach((st, idx) => {
    const dateCells = dates.map((d) => cellText(entryMap.get(`${st.id}:${d}`), lang));
    lines.push(
      [
        idx + 1,
        st.fullName,
        st.className,
        ...dateCells,
        st.averageScore ?? "—",
        st.qualityPercent !== null ? `${st.qualityPercent}%` : "—",
        st.excusedCount,
        st.unexcusedCount,
        st.sickCount,
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  });

  return "\uFEFF" + lines.join("\n");
}

/** Экспорт электронного журнала в официальный печатный документ Word (.docx, альбомная ориентация). */
export async function buildJournalDocx(
  state: JournalState,
  meta: { className?: string; subject?: string; teacherName?: string | null; lang?: "ru" | "kz" } = {},
): Promise<Buffer> {
  const lang = meta.lang ?? "ru";
  const dates = state.dates.slice(-14); // последние 14 дат для читаемости на листе A4
  const entryMap = new Map<string, JournalEntryView>();
  for (const e of state.entries) {
    entryMap.set(`${e.studentId}:${e.date}`, e);
  }

  const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" };
  const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

  const headerCells = [
    "#",
    lang === "kz" ? "Оқушының аты-жөні" : "ФИО ученика",
    ...dates.map((d) => d.slice(5)), // MM-DD
    lang === "kz" ? "Орт." : "Ср.",
    lang === "kz" ? "Сапа" : "Кач.",
    lang === "kz" ? "ДС/ДЖ/А" : "УП/НП/Б",
  ].map(
    (label) =>
      new TableCell({
        borders: BORDERS,
        shading: { type: ShadingType.CLEAR, fill: "1E3A8A" },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: label, bold: true, size: 18, color: "FFFFFF" })],
          }),
        ],
      }),
  );

  const bodyRows = state.students.map((st, idx) => {
    const rowValues = [
      String(idx + 1),
      st.fullName,
      ...dates.map((d) => cellText(entryMap.get(`${st.id}:${d}`), lang) || "·"),
      st.averageScore !== null ? String(st.averageScore) : "—",
      st.qualityPercent !== null ? `${st.qualityPercent}%` : "—",
      `${st.excusedCount}/${st.unexcusedCount}/${st.sickCount}`,
    ];
    return new TableRow({
      children: rowValues.map((val, colIdx) =>
        new TableCell({
          borders: BORDERS,
          children: [
            new Paragraph({
              alignment: colIdx === 1 ? AlignmentType.LEFT : AlignmentType.CENTER,
              children: [new TextRun({ text: val, size: 18, bold: colIdx === 1 })],
            }),
          ],
        }),
      ),
    });
  });

  const title =
    lang === "kz"
      ? `Электрондық журнал — ${meta.className || "Барлық сыныптар"} (${meta.subject || "Пән"})`
      : `Электронный журнал — ${meta.className || "Все классы"} (${meta.subject || "Предмет"})`;

  const legend =
    lang === "kz"
      ? "Шкала: 1–10 балл (ҚБ). Қатысу белгілері: ДС — дәлелді себеп, ДЖ — дәлелсіз себеп, А — ауруына байланысты."
      : "Шкала ФО: 1–10 баллов. Отметки посещаемости: УП — уважительная причина, НП — неуважительная причина, Б — по болезни.";

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: title, bold: true, size: 28, color: "1E3A8A" })],
          }),
          ...(meta.teacherName
            ? [
                new Paragraph({
                  spacing: { after: 120 },
                  children: [
                    new TextRun({
                      text: `${lang === "kz" ? "Педагог" : "Педагог"}: ${meta.teacherName}`,
                      size: 20,
                      color: "475569",
                    }),
                  ],
                }),
              ]
            : []),
          new Paragraph({
            spacing: { after: 180 },
            children: [new TextRun({ text: legend, italics: true, size: 18, color: "475569" })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: headerCells }), ...bodyRows],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export interface TeacherJournalAnalytics {
  hasData: boolean;
  students: JournalStudentView[];
  classes: Array<{
    className: string;
    studentsCount: number;
    avgScore: number | null;
    qualityPercent: number | null;
    attendanceRate: number | null;
  }>;
  attendance: {
    total: number;
    present: number;
    excused: number;
    unexcused: number;
    sick: number;
    rate: number | null;
    perDay: Array<{ date: string; rate: number }>;
  };
  subjects: Array<{
    subject: string;
    avgScore: number;
    qualityPercent: number;
    entriesCount: number;
  }>;
  plansCount: number;
  ktpCount: number;
}

/**
 * Единая сводка по классам, ученикам, посещаемости и успеваемости учителя
 * из электронного журнала (для работы разделов /school/* без обязательного создания организации).
 */
export async function getTeacherJournalAnalytics(ownerId: string): Promise<TeacherJournalAnalytics> {
  const db = await getDb();
  const [state, plansCount, ktpCount] = await Promise.all([
    getJournalState(ownerId),
    db.collection(COL.plans).countDocuments({ owner_id: ownerId }),
    db.collection(COL.longtermPlans).countDocuments({ owner_id: ownerId }),
  ]);

  let present = 0;
  let excused = 0;
  let unexcused = 0;
  let sick = 0;

  const byDay = new Map<string, { present: number; total: number }>();
  const byClassAtt = new Map<string, { present: number; total: number }>();
  const studentClassMap = new Map(state.students.map((s) => [s.id, s.className]));
  const bySubject = new Map<string, number[]>();

  for (const entry of state.entries) {
    const className = studentClassMap.get(entry.studentId) ?? "Общий класс";
    const dayBucket = byDay.get(entry.date) ?? { present: 0, total: 0 };
    const clsBucket = byClassAtt.get(className) ?? { present: 0, total: 0 };

    if (entry.score !== null) {
      present += 1;
      dayBucket.present += 1;
      dayBucket.total += 1;
      clsBucket.present += 1;
      clsBucket.total += 1;
      const list = bySubject.get(entry.subject) ?? [];
      list.push(entry.score);
      bySubject.set(entry.subject, list);
    } else if (entry.attendance === "excused") {
      excused += 1;
      dayBucket.total += 1;
      clsBucket.total += 1;
    } else if (entry.attendance === "unexcused") {
      unexcused += 1;
      dayBucket.total += 1;
      clsBucket.total += 1;
    } else if (entry.attendance === "sick") {
      sick += 1;
      dayBucket.total += 1;
      clsBucket.total += 1;
    }

    if (dayBucket.total > 0) byDay.set(entry.date, dayBucket);
    if (clsBucket.total > 0) byClassAtt.set(className, clsBucket);
  }

  const totalAtt = present + excused + unexcused + sick;
  const attRate = totalAtt > 0 ? present / totalAtt : null;

  const perDay = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, rate: d.total ? d.present / d.total : 0 }));

  const classMap = new Map<string, JournalStudentView[]>();
  for (const st of state.students) {
    const list = classMap.get(st.className) ?? [];
    list.push(st);
    classMap.set(st.className, list);
  }

  const classes = [...classMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru", { numeric: true }))
    .map(([className, list]) => {
      const scored = list.filter((s) => s.averageScore !== null);
      const avgScore =
        scored.length > 0
          ? Math.round(
              (scored.reduce((sum, s) => sum + (s.averageScore ?? 0), 0) / scored.length) * 10,
            ) / 10
          : null;
      const qualityPercent =
        scored.length > 0
          ? Math.round((scored.filter((s) => (s.averageScore ?? 0) >= 7).length / scored.length) * 100)
          : null;
      const att = byClassAtt.get(className);
      return {
        className,
        studentsCount: list.length,
        avgScore,
        qualityPercent,
        attendanceRate: att && att.total > 0 ? att.present / att.total : null,
      };
    });

  const subjects = [...bySubject.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([subject, scores]) => {
      const avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      const qualityPercent = Math.round((scores.filter((s) => s >= 7).length / scores.length) * 100);
      return { subject, avgScore, qualityPercent, entriesCount: scores.length };
    });

  return {
    hasData: state.students.length > 0 || state.entries.length > 0 || plansCount > 0 || ktpCount > 0,
    students: state.students,
    classes,
    attendance: {
      total: totalAtt,
      present,
      excused,
      unexcused,
      sick,
      rate: attRate,
      perDay,
    },
    subjects,
    plansCount,
    ktpCount,
  };
}
