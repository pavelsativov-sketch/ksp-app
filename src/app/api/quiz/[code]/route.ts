import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { computeAnswerScore, generateRoomCode, MAX_STUDENTS } from "@/lib/ksp/live-quiz";
import { evaluateTask, type InteractiveTask, type TaskAnswer } from "@/lib/ksp/tasks";
import { getAccessiblePlan } from "@/lib/plans-repo";

export const runtime = "nodejs";

interface HostQuestionPayload {
  index: number;
  task: Record<string, unknown>;
  endsAt?: number;
  planId?: string;
  secret: Record<string, unknown>;
}

const ROOM_TTL_MS = 6 * 3600_000;
const MAX_BODY_BYTES = 32 * 1024;
const EVENTS_PER_MINUTE = 240;
/** Попыток сгенерировать свободный код комнаты при коллизии. */
const MAX_CODE_ATTEMPTS = 5;

interface RoomStudent {
  name?: string;
  score?: number;
  answered?: number;
}

interface RoomDoc {
  code: string;
  ownerId?: string | null;
  seq?: number;
  createdAt?: Date;
  updatedAt?: Date;
  expiresAt?: Date;
  /** Авторитетное состояние текущего вопроса (серверный подсчёт очков). */
  currentIndex?: number;
  questionStartedAt?: Date | number;
  questionEndsAt?: Date | number;
  secretTask?: Record<string, unknown> | null;
  students?: Record<string, RoomStudent>;
  answers?: Record<string, Record<string, true>>;
  /** Восстановление хоста: план, фаза и все задачи по индексам. */
  planId?: string | null;
  phase?: "lobby" | "question" | "reveal" | "ended" | null;
  hostTasks?: Record<string, Record<string, unknown>>;
}

/** Допуск на сетевые задержки: ответ, пришедший чуть после конца таймера, ещё принимается. */
const ANSWER_GRACE_MS = 2_000;

function asTime(value: Date | number | undefined): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" ? value : 0;
}

/** Лидерборд из карты студентов комнаты (сервер — единственный источник очков). */
function buildLeaderboard(students: Record<string, RoomStudent> | undefined) {
  return Object.entries(students ?? {})
    .map(([studentId, s]) => ({
      studentId,
      name: s.name || "Ученик",
      score: s.score ?? 0,
      answered: s.answered ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 200);
}

const leaderboardSchema = z
  .array(
    z.object({
      studentId: z.string().min(1).max(64),
      name: z.string().max(80),
      score: z.number(),
      answered: z.number().int().min(0),
    }),
  )
  .max(200);

/** Схемы payload по типу события — вместо z.unknown(), который пропускал любой мусор. */
const payloadSchemas = {
  "host:question": z.object({
    index: z.number().int().min(0).max(500),
    task: z.record(z.string(), z.unknown()),
    endsAt: z.number().optional(),
    /** Полная задача С правильными ответами: хранится на сервере, из событий убирается. */
    secret: z.record(z.string(), z.unknown()),
    /** План-источник — для восстановления хоста после обновления страницы (F5). */
    planId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  }),
  "host:reveal": z.object({
    index: z.number().int().min(0).max(500),
    correctSummary: z.string().max(2_000),
  }),
  "host:state": z.object({
    phase: z.string().max(20),
    currentIndex: z.number().int().min(-1).max(500),
    total: z.number().int().min(0).max(500).optional(),
    leaderboard: leaderboardSchema,
    /** Привязка комнаты к плану в лобби: иначе F5 хоста до первого вопроса
     * создавал бы новую комнату, а ученики ждали бы в старой. */
    planId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  }),
  "host:end": z.object({ leaderboard: leaderboardSchema }),
  "student:join": z.object({
    studentId: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(40),
  }),
  "student:answer": z.object({
    studentId: z.string().min(1).max(64),
    index: z.number().int().min(0).max(500),
    answer: z.record(z.string(), z.unknown()),
    ms: z.number().int().min(0).max(3_600_000),
  }),
} as const;

const postSchema = z.object({
  event: z.enum(["host:question", "host:reveal", "host:state", "host:end", "student:join", "student:answer"]),
  payload: z.unknown(),
});

/** POST /api/quiz/[code] — записать событие в комнату. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!isMongoConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  const payloadChecked = payloadSchemas[parsed.data.event].safeParse(parsed.data.payload ?? {});
  if (!payloadChecked.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const db = await getDb();
  const rooms = db.collection<RoomDoc>(COL.quizRooms);
  const now = new Date();

  // Хост-события — только от владельца комнаты. Комната создаётся первым
  // host-событием; если студенты успели создать её раньше хоста (lobby),
  // хост «занимает» комнату, пока у той нет владельца.
  //
  // Защита от захвата: «занять» или создать комнату может только владелец
  // плана, переданного в событии (host:state/х:question несут planId).
  // Студент с аккаунтом, знающий код, не владеет планом — захват невозможен.
  if (parsed.data.event.startsWith("host:")) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    const hostPlanId = (payloadChecked.data as { planId?: string }).planId;
    let ownsPlan = false;
    if (hostPlanId) {
      const plan = await getAccessiblePlan(hostPlanId, user.id);
      ownsPlan = plan?.owner_id === user.id;
    }
    const room0 = await rooms.findOne({ code });
    if (!room0) {
      // Комнаты нет — создаём сразу с владельцем, но только для владельца
      // плана (upsert + unique-индекс на code защищают от гонки двух хостов).
      if (!ownsPlan) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      // Коллизия кода (другой хост случайно выбрал тот же 6-значный код):
      // повторяем генерацию до MAX_CODE_ATTEMPTS раз, а не «занимаем»
      // чужую комнату.
      let created = false;
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !created; attempt++) {
        const candidate = attempt === 0 ? code : generateRoomCode();
        const res = await rooms.updateOne(
          { code: candidate },
          { $setOnInsert: { code: candidate, ownerId: user.id, planId: hostPlanId, createdAt: now, seq: 0 } },
          { upsert: true },
        );
        if (res.upsertedCount === 1) {
          created = true;
          if (candidate !== code) {
            // Комната создалась под другим кодом — сообщаем хост-клиенту.
            return NextResponse.json({ ok: true, seq: 0, roomCode: candidate });
          }
        }
      }
      if (!created) {
        return NextResponse.json({ error: "Не удалось создать комнату: повторите попытку" }, { status: 409 });
      }
    } else if (room0.ownerId && room0.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else if (!room0.ownerId) {
      // Студенты успели создать комнату раньше хоста — «занимаем» её.
      // Претендент должен владеть планом, к которому привязана комната.
      if (!ownsPlan) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      await rooms.updateOne({ code, ownerId: null }, { $set: { ownerId: user.id, planId: hostPlanId } });
      const claimed = await rooms.findOne({ code });
      if (claimed?.ownerId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const rl = await checkRateLimitAsync(`quiz:${code}`, EVENTS_PER_MINUTE, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Слишком много событий в комнате" }, { status: 429 });
  }

  const seqDoc = await rooms.findOneAndUpdate(
    { code },
    {
      $inc: { seq: 1 },
      $set: { updatedAt: now, expiresAt: new Date(now.getTime() + ROOM_TTL_MS) },
      $setOnInsert: { code, createdAt: now },
    },
    { returnDocument: "after", upsert: true },
  );
  const seq = typeof seqDoc?.seq === "number" ? seqDoc.seq : 1;

  // ── Серверная обработка события (авторитетный подсчёт очков) ──
  // По умолчанию в событие пишем payload как есть; отдельные типы — ниже.
  let storedPayload: unknown = payloadChecked.data;

  if (parsed.data.event === "host:question") {
    const q = payloadChecked.data as HostQuestionPayload;
    // Секретную задачу убираем из события — она не должна попасть к ученикам.
    const { secret, ...publicPayload } = q;
    storedPayload = publicPayload;
    const limitSec = typeof secret.timeLimitSec === "number" ? secret.timeLimitSec : 30;
    const questionSet: Record<string, unknown> = {
      currentIndex: q.index,
      questionStartedAt: now,
      questionEndsAt: new Date(now.getTime() + limitSec * 1000),
      secretTask: secret,
      phase: "question",
      // Все задачи сохраняются по индексам — хост сможет продолжить после F5.
      [`hostTasks.${q.index}`]: secret,
    };
    if (q.planId) questionSet.planId = q.planId;
    await rooms.updateOne({ code }, { $set: questionSet });
  } else if (
    parsed.data.event === "host:reveal" ||
    parsed.data.event === "host:state" ||
    parsed.data.event === "host:end"
  ) {
    // Лидерборд подменяется серверным — клиентские очки не доверенные.
    const room = await rooms.findOne({ code });
    storedPayload = {
      ...(payloadChecked.data as Record<string, unknown>),
      leaderboard: buildLeaderboard(room?.students),
    };
    // host:state несёт собственную фазу (напр. "lobby"-сердцебиение хоста);
    // host:reveal без phase ведёт себя как раньше.
    const statePhase = (payloadChecked.data as { phase?: string }).phase;
    const statePlanId = (payloadChecked.data as { planId?: string }).planId;
    const set: Record<string, unknown> = {
      phase: parsed.data.event === "host:end" ? "ended" : statePhase ?? "reveal",
    };
    // planId привязывается к комнате один раз — до него комнату нельзя
    // восстановить после F5 хоста в лобби.
    if (parsed.data.event === "host:state" && statePlanId && room && !room.planId) {
      set.planId = statePlanId;
    }
    await rooms.updateOne({ code }, { $set: set });
  } else if (parsed.data.event === "student:join") {
    const { studentId, name } = payloadChecked.data as { studentId: string; name: string };
    const roomNow = await rooms.findOne({ code }, { projection: { students: 1 } });
    const existingCount = roomNow?.students ? Object.keys(roomNow.students).length : 0;
    // Защита от флуда: без лимита любой знающий код мог раздуть словарь
    // students до тысяч записей. Уже вошедший ученик лимит не расходует.
    if (existingCount >= MAX_STUDENTS && !roomNow?.students?.[studentId]) {
      return NextResponse.json({ error: "В комнате слишком много участников" }, { status: 429 });
    }
    const firstJoin = await rooms.updateOne(
      { code, [`students.${studentId}`]: { $exists: false } },
      { $set: { [`students.${studentId}`]: { name, score: 0, answered: 0 } } },
    );
    if (firstJoin.matchedCount === 0) {
      // Повторный вход: обновляем имя, счёт не трогаем.
      await rooms.updateOne({ code }, { $set: { [`students.${studentId}.name`]: name } });
    }
  } else if (parsed.data.event === "student:answer") {
    const { studentId, index, answer } = payloadChecked.data as {
      studentId: string;
      index: number;
      answer: unknown;
    };
    const room = await rooms.findOne({ code });
    const secretTask = room?.secretTask;
    const startedAt = asTime(room?.questionStartedAt);
    const endsAt = asTime(room?.questionEndsAt);
    // Фаза должна быть «question»: после host:reveal (или конца квиза) ответы
    // больше не принимаются, даже если таймер ещё не истёк, — иначе ученики
    // набирали бы баллы, уже видя правильный ответ.
    const stateOk =
      secretTask != null &&
      typeof secretTask === "object" &&
      "type" in secretTask &&
      room?.phase === "question" &&
      room?.currentIndex === index &&
      startedAt > 0 &&
      Date.now() <= endsAt + ANSWER_GRACE_MS;

    if (stateOk) {
      const task = secretTask as unknown as InteractiveTask;
      const ms = Math.max(0, Date.now() - startedAt);
      let evaluation = { isCorrect: false, score: 0 };
      try {
        evaluation = evaluateTask(task, answer as TaskAnswer);
      } catch {
        evaluation = { isCorrect: false, score: 0 };
      }
      const gained = computeAnswerScore(
        evaluation,
        ms,
        typeof task.timeLimitSec === "number" ? task.timeLimitSec : undefined,
      );
      // Один ответ на вопрос на ученика; дубликаты и ответы без join — мимо.
      await rooms.updateOne(
        {
          code,
          [`students.${studentId}`]: { $exists: true },
          [`answers.${index}.${studentId}`]: { $exists: false },
        },
        {
          $set: { [`answers.${index}.${studentId}`]: true },
          $inc: {
            [`students.${studentId}.score`]: gained,
            [`students.${studentId}.answered`]: 1,
          },
        },
      );
    }
  }

  // TTL-индекс на createdAt (см. ensureIndexes) удаляет события старше 6 ч —
  // без O(N)-пересчёта на каждый POST.
  await db.collection(COL.quizEvents).insertOne({
    roomCode: code,
    seq,
    event: parsed.data.event,
    payload: storedPayload,
    createdAt: now,
  });
  return NextResponse.json({ ok: true, seq });
}

/** GET /api/quiz/[code]?since=N — забрать события комнаты. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!isMongoConfigured()) return NextResponse.json({ events: [] });
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  // Ученики поллят каждые ~1.5 с, поэтому лимит щедрый, но перебор 6-значных
  // кодов комнат и amplification чтения БД без него ничем не ограничены.
  const rl = await checkRateLimitAsync(`quiz:get:${clientIp(request)}:${code}`, 120, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(request.url);
  const since = Math.max(0, Number(url.searchParams.get("since") ?? 0) || 0);
  const db = await getDb();
  const events = await db
    .collection(COL.quizEvents)
    .find({ roomCode: code, seq: { $gt: since } })
    .sort({ seq: 1 })
    .limit(100)
    .toArray();
  return NextResponse.json({
    events: events.map((e) => ({ seq: e.seq, event: e.event, payload: e.payload, createdAt: e.createdAt })),
  });
}
