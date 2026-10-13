import "server-only";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import {
  evaluateTask,
  type InteractiveTask,
  type TaskAnswer,
} from "@/lib/ksp/tasks";
import { correctSummary, toPublicTask, type PublicTask } from "@/lib/ksp/live-quiz";
import { interactiveTaskSchema } from "@/lib/validation/ksp";
import type { PlanDoc } from "@/lib/plans-repo";

/**
 * Домашние выдачи ученикам: учитель собирает набор интерактивных заданий
 * (из КСП или из прошлых выдач — «повтор»), ученик проходит по ссылке/коду
 * без регистрации, проверка — на сервере, учитель видит таблицу результатов.
 */

export interface AssignmentDoc {
  _id?: ObjectId;
  code: string; // 6 цифр, уникален
  owner_id: string;
  title: string;
  subject: string | null;
  grade: number | null;
  tasks: InteractiveTask[];
  feedbackMode?: "none" | "correct_only";
  /** Откуда собрано: план или повтор прошлой выдачи (для «повтора»). */
  source: { planId?: string; assignmentId?: string; taskRefs?: string[] };
  status: "open" | "closed";
  attempts_count: number;
  created_at: Date;
  expires_at: Date;
}

export interface AttemptDoc {
  _id?: ObjectId;
  assignment_id: string;
  /**
   * Владелец выдачи (учитель). Дублируется из assignment, чтобы удаление
   * аккаунта и выгрузка данных находили попытки одним запросом, а не через
   * двойной join по идентификатору выдачи.
   */
  owner_id: string;
  student_name: string;
  answers: TaskAnswer[];
  score: number;
  max_score: number;
  per_task: Array<{ correct: boolean; score: number; omitted?: boolean }>;
  attempts: number; // какая по счёту попытка
  last_score?: number;
  last_max_score?: number;
  last_per_task?: Array<{ correct: boolean; score: number; omitted?: boolean }>;
  last_submitted_at?: Date;
  creation_token?: string;
  created_at: Date;
}

const taskAnswerSchema: z.ZodType<TaskAnswer> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MCQ"), selectedIndex: z.number().int().min(0).nullable() }),
  z.object({ type: z.literal("TRUE_FALSE"), selected: z.boolean().nullable() }),
  z.object({ type: z.literal("SHORT_ANSWER"), text: z.string().max(2000) }),
  z.object({ type: z.literal("FILL_BLANK"), fillers: z.array(z.string().max(500)).max(20) }),
  z.object({
    type: z.literal("MATCHING"),
    pairs: z.array(z.object({ leftIndex: z.number().int().min(0), rightIndex: z.number().int().min(0) })).max(20),
  }),
  z.object({ type: z.literal("ORDERING"), order: z.array(z.number().int().min(0)).max(20) }),
  z.object({ type: z.literal("NUMERIC"), value: z.number().finite().nullable() }),
]);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(200).optional().default(""),
  grade: z.coerce.number().int().min(1).max(11).nullable().optional(),
  taskIds: z.array(z.string().regex(/^[a-f\d]{24}:\d+$/i)).min(1).max(20),
  planId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  previewFingerprint: z.string().regex(/^[a-f\d]{64}$/i),
  feedbackMode: z.enum(["none", "correct_only"]).default("correct_only"),
  daysValid: z.coerce.number().int().min(1).max(60).default(14),
});

const previewSchema = z.object({
  taskIds: z.array(z.string().regex(/^[a-f\d]{24}:\d+$/i)).min(1).max(20),
});

const editedReissueSchema = z.object({
  title: z.string().trim().min(1).max(200),
  daysValid: z.coerce.number().int().min(1).max(60).default(14),
  feedbackMode: z.enum(["none", "correct_only"]),
  sourceFingerprint: z.string().regex(/^[a-f\d]{64}$/i),
  tasks: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    question: z.string().trim().min(1).max(5000),
    hint: z.string().trim().max(2000).nullable().optional(),
  })).min(1).max(20),
});

function taskFingerprint(tasks: InteractiveTask[]): string {
  return createHash("sha256").update(JSON.stringify(tasks)).digest("hex");
}

/**
 * Публичный код выдачи: 6 цифр из CSPRNG.
 *
 * Раньше был Math.random() — предсказуемый генератор, а эндпоинт чтения по
 * коду был открыт без ограничения частоты, то есть весь диапазон из 900 000
 * вариантов можно было перебрать и получить чужие задания.
 */
function randomCode(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Собирает задания по ссылкам вида "<assignmentOrPlanId>:<index>".
 * Источники: свои выдачи (tasks из снапшота) и свои планы (stages.*.tasks).
 * Чужие материалы недоступны.
 */
async function resolveTasks(
  db: Awaited<ReturnType<typeof getDb>>,
  ownerId: string,
  taskIds: string[],
): Promise<InteractiveTask[]> {
  const out: InteractiveTask[] = [];
  for (const ref of taskIds) {
    const [id, indexRaw] = ref.split(":");
    const index = Number(indexRaw);
    if (!Number.isInteger(index) || index < 0 || index > 50) continue;
    const oid = toObjectId(id);
    if (!oid) continue;
    const assignment = await db.collection<AssignmentDoc>(COL.assignments).findOne({ _id: oid, owner_id: ownerId });
    if (assignment?.tasks[index]) {
      out.push(assignment.tasks[index]);
      continue;
    }
    const plan = await db.collection<PlanDoc>(COL.plans).findOne({ _id: oid, owner_id: ownerId });
    const planTasks = plan
      ? [
        ...(plan.content?.stages?.beginning?.tasks ?? []),
        ...(plan.content?.stages?.middle?.tasks ?? []),
        ...(plan.content?.stages?.end?.tasks ?? []),
      ]
      : [];
    if (planTasks[index]) out.push(planTasks[index] as InteractiveTask);
  }
  return out;
}

/** Возвращает владельцу student-safe preview выбранных собственных заданий. */
export async function previewAssignmentTasks(ownerId: string, input: unknown): Promise<{ tasks: PublicTask[]; fingerprint: string }> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) throw new Error("Некорректный список заданий");
  const db = await getDb();
  const tasks = await resolveTasks(db, ownerId, parsed.data.taskIds);
  if (tasks.length !== parsed.data.taskIds.length) {
    throw new Error("Некоторые задания больше недоступны");
  }
  const checked = z.array(interactiveTaskSchema).safeParse(tasks);
  if (!checked.success) throw new Error("Задания не прошли проверку");
  return {
    tasks: checked.data.map(toPublicTask),
    fingerprint: taskFingerprint(checked.data),
  };
}

export async function createAssignment(ownerId: string, input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new Error("Некорректные данные выдачи");
  const db = await getDb();
  const tasks = await resolveTasks(db, ownerId, parsed.data.taskIds);
  if (tasks.length === 0) throw new Error("Не выбрано ни одного доступного задания");
  if (tasks.length !== parsed.data.taskIds.length) throw new Error("Некоторые задания больше недоступны");
  // Валидируем снапшот той же схемой, что и КСП.
  const checked = z.array(interactiveTaskSchema).safeParse(tasks);
  if (!checked.success) throw new Error("Задания повреждены и не прошли проверку");
  if (taskFingerprint(checked.data) !== parsed.data.previewFingerprint) {
    throw new Error("Задания изменились после предпросмотра. Проверьте предпросмотр ещё раз.");
  }
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const code = randomCode();
      const doc: AssignmentDoc = {
        code,
        owner_id: ownerId,
        title: parsed.data.title,
        subject: parsed.data.subject || null,
        grade: parsed.data.grade ?? null,
        tasks: checked.data as InteractiveTask[],
        feedbackMode: parsed.data.feedbackMode,
        source: {
          ...(parsed.data.planId ? { planId: parsed.data.planId } : {}),
          taskRefs: parsed.data.taskIds,
        },
        status: "open",
        attempts_count: 0,
        created_at: now,
        expires_at: new Date(now.getTime() + parsed.data.daysValid * 86400_000),
      };
      const result = await db.collection<AssignmentDoc>(COL.assignments).insertOne(doc);
      return { id: result.insertedId.toHexString(), code };
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  throw new Error("Не удалось создать выдачу, попробуйте ещё раз");
}

export interface PublicAssignment {
  code: string;
  title: string;
  subject: string | null;
  grade: number | null;
  tasks: PublicTask[];
  feedbackMode: "none" | "correct_only";
  total: number;
  closed: boolean;
}

/** Публичная версия выдачи: задания БЕЗ правильных ответов. */
export async function getPublicAssignment(code: string): Promise<PublicAssignment | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const db = await getDb();
  const doc = await db.collection<AssignmentDoc>(COL.assignments).findOne({ code });
  if (!doc) return null;
  const closed = doc.status !== "open" || doc.expires_at.getTime() <= Date.now();
  return {
    code: doc.code,
    title: doc.title,
    subject: doc.subject,
    grade: doc.grade,
    tasks: doc.tasks.map(toPublicTask),
    feedbackMode: doc.feedbackMode ?? "correct_only",
    total: doc.tasks.length,
    closed,
  };
}

const submitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  answers: z.array(taskAnswerSchema).min(1).max(20),
});

function isOmittedAnswer(answer: TaskAnswer | undefined): boolean {
  if (!answer) return true;
  switch (answer.type) {
    case "MCQ": return answer.selectedIndex === null;
    case "TRUE_FALSE": return answer.selected === null;
    case "SHORT_ANSWER": return answer.text.trim().length === 0;
    case "FILL_BLANK": return answer.fillers.length === 0 || answer.fillers.some((value) => value.trim().length === 0);
    case "MATCHING": return answer.pairs.length === 0;
    case "ORDERING": return answer.order.length === 0;
    case "NUMERIC": return answer.value === null;
  }
}

/** Сдача: серверная проверка, сохраняется лучший результат ученика. */
export async function submitAttempt(code: string, input: unknown) {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) throw new Error("Некорректные ответы");
  const db = await getDb();
  const doc = await db.collection<AssignmentDoc>(COL.assignments).findOne({ code });
  if (!doc) throw new Error("Выдача не найдена");
  if (doc.status !== "open" || doc.expires_at.getTime() <= Date.now()) {
    throw new Error("Приём ответов завершён");
  }
  const student = parsed.data.name;
  const perTask = doc.tasks.map((task, i) => {
    const answer = parsed.data.answers[i];
    if (!answer || answer.type !== task.type) {
      return { correct: false, score: 0, max: Math.max(1, task.points), omitted: true };
    }
    const r = evaluateTask(task, answer);
    return { correct: r.isCorrect, score: r.score, max: r.maxScore, omitted: isOmittedAnswer(answer) };
  });
  const score = perTask.reduce((s, t) => s + t.score, 0);
  const maxScore = perTask.reduce((s, t) => s + t.max, 0);
  const key = student.trim().toLowerCase();

  // Раньше здесь стояло findOne → вычисление attempts = prev.attempts + 1 →
  // updateOne. Это read-modify-write: два параллельных «Отправить» ученика
  // читали один и тот же prev, получали одинаковый номер попытки, и второй
  // перетирал результат первого. Хуже: две параллельные ПЕРВЫЕ отправки обе
  // видели prev = null, обе инкрементили attempts_count и обе решали, что
  // их результат — лучший.
  //
  // Теперь номер попытки увеличивается атомарно ($inc), лучший результат
  // обновляется условным серверным сравнением, а счётчик участников растёт
  // только на первом upsert, помеченном одноразовым creation token.
  const attemptsCol = db.collection<AttemptDoc>(COL.assignmentAttempts);
  const filter = { assignment_id: doc._id.toHexString(), student_name: key };
  const creationToken = randomUUID();

  // Шаг 1 — атомарно увеличиваем счётчик попыток и создаём документ, если
  // его ещё нет. $inc не читает и не пишет «prev.attempts + 1» в JS, поэтому
  // параллельные отправки не затирают номер друг друга.
  const after = await attemptsCol.findOneAndUpdate(
    filter,
    {
      $set: {
        assignment_id: doc._id.toHexString(),
        owner_id: doc.owner_id,
        student_name: key,
        display_name: student.trim(),
      },
      $inc: { attempts: 1 },
      // score всегда существует, чтобы сравнение «лучше ли новая попытка»
      // не получало undefined на первой отправке.
      $setOnInsert: { score: 0, created_at: new Date(), creation_token: creationToken },
    },
    { upsert: true, returnDocument: "after" },
  );

  const stored = after as { score?: number; attempts?: number; creation_token?: string } | null;
  const attemptNo = stored?.attempts ?? 1;
  const previousBest = stored?.score ?? 0;
  const isBest = score >= previousBest;

  // Сохраняем последнюю попытку отдельно; номер не даёт старому параллельному
  // запросу перезаписать результат новой попытки.
  if (after) {
    await attemptsCol.updateOne(
      { ...filter, attempts: attemptNo },
      {
        $set: {
          last_score: score,
          last_max_score: maxScore,
          last_per_task: perTask.map(({ correct, score: s, omitted }) => ({ correct, score: s, omitted })),
          last_submitted_at: new Date(),
        },
      },
    );
  }

  // Шаг 2 — ответы и балл пишем только если попытка не хуже уже сохранённой.
  // Фильтр с $expr делает проверку на стороне сервера, поэтому даже при гонке
  // двух параллельных отправок худшая не перезапишет лучшую.
  if (isBest) {
    await attemptsCol.updateOne(
      { ...filter, $expr: { $gte: [score, { $ifNull: ["$score", 0] }] } },
      {
        $set: {
          answers: parsed.data.answers,
          score,
          max_score: maxScore,
          per_task: perTask.map(({ correct, score: s, omitted }) => ({ correct, score: s, omitted })),
          updated_at: new Date(),
        },
      },
    );
  }

  // Счётчик attempts_count отражает число участников (по введённому имени),
  // а не число отправок; token надёжно отличает новый документ и удаляется.
  if (stored?.creation_token === creationToken) {
    await attemptsCol.updateOne(
      { ...filter, creation_token: creationToken },
      { $unset: { creation_token: "" } },
    );
    await db
      .collection<AssignmentDoc>(COL.assignments)
      .updateOne({ _id: doc._id }, { $inc: { attempts_count: 1 } });
  }

  return {
    score,
    maxScore,
    isBest,
    attempts: attemptNo,
    details: doc.tasks.map((task, i) => ({
      correct: perTask[i].correct,
      // Разбор правильного ответа — только за верный ответ. Иначе ученик,
      // отправив один случайный ответ, получал эталон ко всем заданиям.
      summary: doc.feedbackMode !== "none" && perTask[i].correct ? correctSummary(task) : null,
    })),
  };
}

export interface TeacherAssignmentRow {
  id: string;
  code: string;
  title: string;
  tasksCount: number;
  attemptsCount: number;
  status: "open" | "closed";
  createdAt: string;
  expiresAt: string;
}

export async function listTeacherAssignments(ownerId: string, limit = 50): Promise<TeacherAssignmentRow[]> {
  const db = await getDb();
  const rows = await db.collection<AssignmentDoc>(COL.assignments)
    .find({ owner_id: ownerId })
    .sort({ created_at: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .toArray();
  const now = Date.now();
  return rows.map((d) => ({
    id: d._id.toHexString(),
    code: d.code,
    title: d.title,
    tasksCount: d.tasks.length,
    attemptsCount: d.attempts_count,
    status: d.status !== "open" || d.expires_at.getTime() <= now ? "closed" : "open",
    createdAt: d.created_at.toISOString(),
    expiresAt: d.expires_at.toISOString(),
  }));
}

export interface AssignmentResults {
  id: string;
  code: string;
  title: string;
  subject: string | null;
  grade: number | null;
  feedbackMode: "none" | "correct_only";
  editableTasks: PublicTask[];
  editFingerprint: string;
  sourceAssignmentId: string | null;
  status: "open" | "closed" | "expired";
  maxScore: number;
  studentCount: number;
  averageScore: number | null;
  rowsTruncated: boolean;
  rows: Array<{ name: string; score: number; lastScore: number | null; lastMaxScore: number | null; attempts: number; createdAt: string }>;
  analytics: {
    hasData: boolean;
    minimumGroupSize: number;
    overallParticipants: number | null;
    tasks: Array<{
      taskIndex: number;
      question: string;
      objectiveCode: string | null;
      suppressed: boolean;
      participants: number | null;
      responseCount: number | null;
      correctCount: number | null;
      incorrectCount: number | null;
      accuracyPercent: number | null;
      attemptCount: number | null;
      omittedCount: number | null;
    }>;
    objectives: Array<{
      objectiveCode: string | null;
      suppressed: boolean;
      participants: number | null;
      responseCount: number | null;
      correctCount: number | null;
      incorrectCount: number | null;
      accuracyPercent: number | null;
      attemptCount: number | null;
      omittedCount: number | null;
    }>;
  };
}

export async function getAssignmentResults(ownerId: string, id: string): Promise<AssignmentResults | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const db = await getDb();
  const doc = await db.collection<AssignmentDoc>(COL.assignments).findOne({ _id: oid, owner_id: ownerId });
  if (!doc) return null;
  const attemptsCol = db.collection<AttemptDoc>(COL.assignmentAttempts);
  const objectiveCodes = doc.tasks.map((task) => task.objectiveCode?.trim() || null);
  const [attempts, totalParticipants, taskAgg, objectiveAgg, scoreAgg] = await Promise.all([
    attemptsCol.find({ assignment_id: id, owner_id: ownerId }).sort({ score: -1 }).limit(500).toArray(),
    attemptsCol.countDocuments({ assignment_id: id, owner_id: ownerId }),
    attemptsCol.aggregate<{
      _id: number;
      participants: number;
      correctCount: number;
      attemptCount: number;
      omittedCount: number;
      omissionKnownCount: number;
    }>([
      { $match: { assignment_id: id, owner_id: ownerId } },
      { $unwind: { path: "$per_task", includeArrayIndex: "taskIndex" } },
      {
        $group: {
          _id: "$taskIndex",
          participants: { $sum: 1 },
          correctCount: { $sum: { $cond: [{ $eq: ["$per_task.correct", true] }, 1, 0] } },
          attemptCount: { $sum: { $ifNull: ["$attempts", 1] } },
          omittedCount: { $sum: { $cond: [{ $eq: ["$per_task.omitted", true] }, 1, 0] } },
          omissionKnownCount: { $sum: { $cond: [{ $eq: [{ $type: "$per_task.omitted" }, "bool"] }, 1, 0] } },
        },
      },
    ]).toArray(),
    attemptsCol.aggregate<{
      _id: string | null;
      participants: number;
      responseCount: number;
      correctCount: number;
      attemptCount: number;
      omittedCount: number;
      omissionKnownCount: number;
    }>([
      { $match: { assignment_id: id, owner_id: ownerId } },
      { $unwind: { path: "$per_task", includeArrayIndex: "taskIndex" } },
      { $addFields: { objectiveCode: { $arrayElemAt: [objectiveCodes, "$taskIndex"] } } },
      {
        $group: {
          _id: { student: "$student_name", objectiveCode: "$objectiveCode" },
          responseCount: { $sum: 1 },
          correctCount: { $sum: { $cond: [{ $eq: ["$per_task.correct", true] }, 1, 0] } },
          attemptCount: { $sum: { $ifNull: ["$attempts", 1] } },
          omittedCount: { $sum: { $cond: [{ $eq: ["$per_task.omitted", true] }, 1, 0] } },
          omissionKnownCount: { $sum: { $cond: [{ $eq: [{ $type: "$per_task.omitted" }, "bool"] }, 1, 0] } },
        },
      },
      {
        $group: {
          _id: "$_id.objectiveCode",
          participants: { $sum: 1 },
          responseCount: { $sum: "$responseCount" },
          correctCount: { $sum: "$correctCount" },
          attemptCount: { $sum: "$attemptCount" },
          omittedCount: { $sum: "$omittedCount" },
          omissionKnownCount: { $sum: "$omissionKnownCount" },
        },
      },
    ]).toArray(),
    attemptsCol.aggregate<{ _id: null; averageScore: number }>([
      { $match: { assignment_id: id, owner_id: ownerId } },
      { $group: { _id: null, averageScore: { $avg: "$score" } } },
    ]).toArray(),
  ]);
  const minimumGroupSize = 5;
  const taskByIndex = new Map(taskAgg.map((row) => [Number(row._id), row]));
  const makeStats = (
    participants: number,
    responseCount: number,
    correctCount: number,
    attemptCount: number,
    omittedCount: number,
    omissionKnownCount: number,
  ) => {
    const suppressed = participants < minimumGroupSize;
    const incorrectCount = responseCount - correctCount;
    return {
      suppressed,
      participants: suppressed ? null : participants,
      responseCount: suppressed ? null : responseCount,
      correctCount: suppressed ? null : correctCount,
      incorrectCount: suppressed ? null : incorrectCount,
      accuracyPercent: suppressed || responseCount === 0 ? null : Math.round((correctCount / responseCount) * 100),
      attemptCount: suppressed ? null : attemptCount,
      omittedCount: suppressed || omissionKnownCount !== responseCount ? null : omittedCount,
    };
  };
  const analyticsTasks = doc.tasks.map((task, taskIndex) => {
    const aggregate = taskByIndex.get(taskIndex);
    const participants = aggregate?.participants ?? 0;
    const correctCount = aggregate?.correctCount ?? 0;
    return {
      taskIndex,
      question: task.question,
      objectiveCode: task.objectiveCode?.trim() || null,
      ...makeStats(participants, participants, correctCount, aggregate?.attemptCount ?? 0, aggregate?.omittedCount ?? 0, aggregate?.omissionKnownCount ?? 0),
    };
  });
  const analyticsObjectives = objectiveAgg.map((row) => ({
    objectiveCode: row._id,
    ...makeStats(row.participants, row.responseCount, row.correctCount, row.attemptCount, row.omittedCount, row.omissionKnownCount),
  }));
  return {
    id,
    code: doc.code,
    title: doc.title,
    subject: doc.subject,
    grade: doc.grade,
    feedbackMode: doc.feedbackMode ?? "correct_only",
    editableTasks: doc.tasks.map(toPublicTask),
    editFingerprint: taskFingerprint(doc.tasks),
    sourceAssignmentId: doc.source.assignmentId ?? null,
    status: doc.status !== "open" ? "closed" : doc.expires_at.getTime() <= Date.now() ? "expired" : "open",
    maxScore: doc.tasks.reduce((s, t) => s + Math.max(1, t.points), 0),
    studentCount: totalParticipants,
    averageScore: scoreAgg[0]?.averageScore ?? null,
    rowsTruncated: totalParticipants > attempts.length,
    rows: attempts.map((a) => ({
      name: (a as { display_name?: string }).display_name ?? a.student_name,
      score: a.score,
      lastScore: typeof a.last_score === "number" ? a.last_score : null,
      lastMaxScore: typeof a.last_max_score === "number" ? a.last_max_score : null,
      attempts: a.attempts,
      createdAt: (a.last_submitted_at ?? a.created_at).toISOString(),
    })),
    analytics: {
      hasData: totalParticipants > 0 && (taskAgg.length > 0 || objectiveAgg.length > 0),
      minimumGroupSize,
      overallParticipants: totalParticipants >= minimumGroupSize ? totalParticipants : null,
      tasks: analyticsTasks,
      objectives: analyticsObjectives,
    },
  };
}

/** Новый snapshot после ручной правки текста; исходная выдача и её попытки не меняются. */
export async function createEditedReissue(ownerId: string, id: string, input: unknown) {
  const parsed = editedReissueSchema.safeParse(input);
  const oid = toObjectId(id);
  if (!parsed.success || !oid) throw new Error("Некорректные данные повторной выдачи");
  const db = await getDb();
  const source = await db.collection<AssignmentDoc>(COL.assignments).findOne({ _id: oid, owner_id: ownerId });
  if (!source || source.tasks.length !== parsed.data.tasks.length) throw new Error("Исходная выдача не найдена");
  if (taskFingerprint(source.tasks) !== parsed.data.sourceFingerprint) {
    throw new Error("Исходная выдача изменилась; обновите страницу и проверьте новый предпросмотр");
  }
  const edited = source.tasks.map((task, index) => {
    const change = parsed.data.tasks[index];
    if (task.id !== change.id) throw new Error("Состав заданий изменился; обновите страницу и проверьте выдачу ещё раз");
    return { ...task, question: change.question, hint: change.hint?.trim() || undefined };
  });
  const checked = z.array(interactiveTaskSchema).safeParse(edited);
  if (!checked.success) throw new Error("Изменённые задания не прошли проверку");
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const code = randomCode();
      const result = await db.collection<AssignmentDoc>(COL.assignments).insertOne({
        code,
        owner_id: ownerId,
        title: parsed.data.title,
        subject: source.subject,
        grade: source.grade,
        tasks: checked.data as InteractiveTask[],
        feedbackMode: parsed.data.feedbackMode,
        source: { assignmentId: id },
        status: "open",
        attempts_count: 0,
        created_at: now,
        expires_at: new Date(now.getTime() + parsed.data.daysValid * 86400_000),
      });
      return { id: result.insertedId.toHexString(), code };
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  throw new Error("Не удалось создать новую выдачу");
}

/** Повтор прошлой выдачи: те же задания, новый код и срок. */
export async function repeatAssignment(ownerId: string, id: string, daysValid = 14) {
  const oid = toObjectId(id);
  if (!oid) throw new Error("Выдача не найдена");
  const db = await getDb();
  const src = await db.collection<AssignmentDoc>(COL.assignments).findOne({ _id: oid, owner_id: ownerId });
  if (!src || src.tasks.length === 0) throw new Error("Выдача не найдена");
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const code = randomCode();
      const result = await db.collection<AssignmentDoc>(COL.assignments).insertOne({
        code,
        owner_id: ownerId,
        title: src.title,
        subject: src.subject,
        grade: src.grade,
        tasks: src.tasks,
        feedbackMode: src.feedbackMode ?? "correct_only",
        source: { assignmentId: id },
        status: "open",
        attempts_count: 0,
        created_at: now,
        expires_at: new Date(now.getTime() + daysValid * 86400_000),
      });
      return { id: result.insertedId.toHexString(), code };
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  throw new Error("Не удалось повторить выдачу");
}

export async function closeAssignment(ownerId: string, id: string) {
  const oid = toObjectId(id);
  if (!oid) throw new Error("Выдача не найдена");
  const db = await getDb();
  const res = await db.collection<AssignmentDoc>(COL.assignments).updateOne(
    { _id: oid, owner_id: ownerId },
    { $set: { status: "closed" } },
  );
  if (res.matchedCount === 0) throw new Error("Выдача не найдена");
}

export interface LibraryTask {
  ref: string; // "<id>:<index>" для выдачи
  question: string;
  type: string;
  points: number;
  from: string; // название выдачи
  uses: number; // в скольких выдачах используется (повторяемость)
}

/** Библиотека заданий учителя для повтора: свои выдачи + свои планы. */
export async function teacherTaskLibrary(ownerId: string): Promise<{ fromAssignments: LibraryTask[]; fromPlans: LibraryTask[] }> {
  const db = await getDb();
  const assignments = await db.collection<AssignmentDoc>(COL.assignments)
    .find({ owner_id: ownerId })
    .sort({ created_at: -1 })
    .limit(100)
    .toArray();
  const fromAssignments: LibraryTask[] = [];
  for (const a of assignments) {
    a.tasks.forEach((t, i) => {
      fromAssignments.push({
        ref: `${a._id.toHexString()}:${i}`,
        question: t.question,
        type: t.type,
        points: t.points,
        from: a.title,
        uses: a.attempts_count,
      });
    });
  }
  const plans = await db.collection<PlanDoc>(COL.plans)
    .find({ owner_id: ownerId })
    .sort({ updated_at: -1 })
    .limit(30)
    .project({ title: 1, content: 1 })
    .toArray();
  const fromPlans: LibraryTask[] = [];
  for (const p of plans) {
    const tasks = [
      ...(p.content?.stages?.beginning?.tasks ?? []),
      ...(p.content?.stages?.middle?.tasks ?? []),
      ...(p.content?.stages?.end?.tasks ?? []),
    ];
    tasks.forEach((t, i) => {
      const task = t as InteractiveTask;
      fromPlans.push({
        ref: `${p._id.toHexString()}:${i}`,
        question: task.question,
        type: task.type,
        points: task.points,
        from: p.title,
        uses: 0,
      });
    });
    if (fromPlans.length >= 100) break;
  }
  return { fromAssignments: fromAssignments.slice(0, 200), fromPlans: fromPlans.slice(0, 100) };
}

export async function checkSubmitRateLimit(code: string): Promise<boolean> {
  const rl = await checkRateLimitAsync(`assign:submit:${code}`, 60, 3600_000);
  return rl.ok;
}
