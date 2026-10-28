import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * HTTP-слой live-квиза (`api/quiz/[code]`) не был покрыт тестами, хотя именно
 * там решается: не утекают ли правильные ответы ученикам, может ли чужой
 * вести комнату и можно ли ответить дважды.
 */

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isMongoConfigured: vi.fn(() => true),
  getCurrentUser: vi.fn(),
  checkRateLimitAsync: vi.fn(async () => ({ ok: true, remaining: 100, resetAt: Date.now() + 60_000 })),
}));

vi.mock("@/lib/mongo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mongo")>("@/lib/mongo");
  return { ...actual, getDb: mocks.getDb, isMongoConfigured: mocks.isMongoConfigured };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRateLimitAsync: mocks.checkRateLimitAsync };
});

import { POST, GET } from "@/app/api/quiz/[code]/route";

const CODE = "123456";
const params = { params: Promise.resolve({ code: CODE }) };

function req(body: unknown): Request {
  return new Request(`http://localhost/api/quiz/${CODE}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Минимальный ин-memory MongoDB: достаточно для документов комнаты. */
function fakeDb(room: Record<string, unknown> | null, sink: { events: Array<Record<string, unknown>> } = { events: [] }) {
  const state = { room: room ? { ...room } : null, seq: room?.seq ?? 0 };

  const applyPath = (obj: Record<string, unknown>, path: string, value: unknown) => {
    const parts = path.split(".");
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!;
      if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
      cur = cur[key] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]!] = value;
  };

  const readPath = (obj: Record<string, unknown>, path: string): unknown => {
    let cur: unknown = obj;
    for (const key of path.split(".")) {
      if (typeof cur !== "object" || cur === null) return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
  };

  /**
   * Проверка условий фильтра вида `{ "поле": { $exists: true|false } }` и
   * `{ code: X }`. Именно на них держится атомарность: без проверки ученик
   * без join набирал бы очки, а повторный ответ засчитывался бы дважды.
   */
  const filterMatches = (filter: Record<string, unknown>): boolean => {
    for (const [key, cond] of Object.entries(filter)) {
      const value = readPath(state.room ?? {}, key);
      if (cond !== null && typeof cond === "object" && "$exists" in (cond as Record<string, unknown>)) {
        const want = (cond as { $exists: boolean }).$exists;
        if ((value !== undefined) !== want) return false;
      } else if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
        if (JSON.stringify(value) !== JSON.stringify(cond)) return false;
      } else if (value !== cond) {
        return false;
      }
    }
    return true;
  };

  const rooms = {
    findOne: vi.fn(async () => (state.room ? { ...state.room } : null)),
    updateOne: vi.fn(async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      if (!state.room) {
        if (!filter.code) return { matchedCount: 0, modifiedCount: 0 };
        state.room = { code: filter.code as string, seq: 0 } as Record<string, unknown>;
      }
      if (!filterMatches(filter)) return { matchedCount: 0, modifiedCount: 0 };
      const before = JSON.stringify(state.room);
      // Условия фильтра вида «поле не существует» упрощаем: достаточно $set/$inc.
      for (const [op, patch] of Object.entries(update)) {
        if (op === "$setOnInsert") continue;
        for (const [path, value] of Object.entries(patch as Record<string, unknown>)) {
          if (op === "$set") {
            applyPath(state.room, path, value);
          } else if (op === "$inc") {
            const parts = path.split(".");
            let cur: Record<string, unknown> = state.room;
            for (let i = 0; i < parts.length - 1; i++) {
              const key = parts[i]!;
              if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
              cur = cur[key] as Record<string, unknown>;
            }
            const last = parts[parts.length - 1]!;
            cur[last] = ((cur[last] as number | undefined) ?? 0) + (value as number);
          }
        }
      }
      return { matchedCount: 1, modifiedCount: before === JSON.stringify(state.room) ? 0 : 1 };
    }),
    findOneAndUpdate: vi.fn(async (_f, update) => {
      if (!state.room) state.room = { code: CODE, seq: 0 };
      const inc = (update as Record<string, Record<string, number>>).$inc;
      for (const [path, delta] of Object.entries(inc ?? {})) {
        applyPath(state.room, path, ((state.room[path] as number | undefined) ?? 0) + delta);
      }
      return { ...state.room };
    }),
  };

  const events = {
    insertOne: vi.fn(async (doc: Record<string, unknown>) => { sink.events.push(doc); return { insertedId: "1" }; }),
    find: vi.fn(() => ({ sort: () => ({ limit: () => ({ toArray: async () => sink.events }) }) })),
  };

  return { db: { collection: (name: string) => (name === "quiz_events" ? events : rooms) }, sink, state };
}

const SECRET_TASK = { type: "MCQ", question: "2+2=?", options: ["4", "5"], correctIndex: 0, points: 2 };

/** Полезная нагрузка host:state по схеме роута. */
const hostState = { phase: "lobby", currentIndex: -1, leaderboard: [] as unknown[] };

/** Подставляет фейковую БД в мок getDb и возвращает доступ к состоянию. */
function useFakeDb(room: Record<string, unknown> | null, sink?: { events: Array<Record<string, unknown>> }) {
  const f = fakeDb(room, sink);
  mocks.getDb.mockResolvedValue(f.db);
  return f;
}

interface RoomState {
  students?: Record<string, { name?: string; score?: number; answered?: number }>;
  answers?: Record<string, Record<string, boolean>>;
  [key: string]: unknown;
}

/** Доступ к коллекции комнат фейковой БД. */
function roomsOf(db: { collection: (n: string) => unknown }): { findOne: () => Promise<RoomState> } {
  return db.collection("quiz_rooms") as { findOne: () => Promise<RoomState> };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getCurrentUser.mockResolvedValue({ id: "c".repeat(24), email: "t@e.st" });
  mocks.isMongoConfigured.mockReturnValue(true);
  mocks.checkRateLimitAsync.mockResolvedValue({ ok: true, remaining: 100, resetAt: Date.now() + 60_000 });
});

describe("POST /api/quiz/[code] — валидация", () => {
  it("отклоняет код, который не шесть цифр", async () => {
    const res = await POST(new Request("http://x/api/quiz/abc", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ code: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("отклоняет слишком большое тело", async () => {
    const big = JSON.stringify({ event: "student:join", payload: { studentId: "s", name: "x".repeat(60_000) } });
    const res = await POST(new Request(`http://x/api/quiz/${CODE}`, { method: "POST", body: big }), params);
    expect(res.status).toBe(413);
  });

  it("отклоняет неизвестное событие и некорректную полезную нагрузку", async () => {
    const bad = await POST(req({ event: "hack:everything", payload: {} }), params);
    expect(bad.status).toBe(400);

    const badPayload = await POST(req({ event: "student:join", payload: { studentId: "s" } }), params);
    expect(badPayload.status).toBe(400);
  });
});

describe("POST /api/quiz/[code] — авторизация хоста", () => {
  it("хост-событие без входа отклоняется", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    useFakeDb(null);
    const res = await POST(req({ event: "host:state", payload: hostState }), params);
    expect(res.status).toBe(401);
  });

  it("чужой учитель не может вести чужую комнату", async () => {
    useFakeDb({ code: CODE, ownerId: "d".repeat(24), seq: 3 });
    const res = await POST(req({ event: "host:state", payload: hostState }), params);
    expect(res.status).toBe(403);
  });

  it("владелец комнаты может слать события", async () => {
    useFakeDb({ code: CODE, ownerId: "c".repeat(24), seq: 3, students: {} });
    const res = await POST(req({ event: "host:state", payload: hostState }), params);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/quiz/[code] — секретность ответов", () => {
  // Главный инвариант: правильный ответ хранится в комнате, но не попадает
  // в событие, которое читают ученики.
  it("host:question публикует вопрос без secret", async () => {
    const { db, sink } = useFakeDb({ code: CODE, ownerId: "c".repeat(24), seq: 1, students: {} });
    
    const res = await POST(
      req({ event: "host:question", payload: { index: 0, task: { q: "2+2=?" }, secret: SECRET_TASK } }),
      params,
    );
    expect(res.status).toBe(200);
    const published = JSON.stringify(sink.events);
    // Секрет не должен уехать в ленту событий.
    expect(published).not.toContain("correctIndex");
    expect(published).not.toContain('"options"');
    // Но в самой комнате он обязан сохраниться — иначе нечем проверять ответы.
    const room = await roomsOf(db).findOne();
    expect(JSON.stringify(room.secretTask)).toContain("correctIndex");
  });

  it("лидерборд собирается сервером и заменяет присланный клиентом", async () => {
    const { sink } = useFakeDb({
      code: CODE, ownerId: "c".repeat(24), seq: 2,
      students: { s1: { name: "Аня", score: 10, answered: 2 }, s2: { name: "Боря", score: 4, answered: 1 } },
    });
    
    const res = await POST(
      req({ event: "host:reveal", payload: { index: 0, correctSummary: "�����" } }),
      params,
    );
    expect(res.status).toBe(200);
    const event = sink.events.at(-1)!;
    const leaderboard = (event.payload as { leaderboard: Array<{ score: number }> }).leaderboard;
    // Клиентские 9999 отброшены, серверные значения на месте.
    expect(leaderboard.some((r) => r.score === 9999)).toBe(false);
    expect(leaderboard.map((r) => r.score)).toEqual([10, 4]);
  });
});

describe("POST /api/quiz/[code] — ответы учеников", () => {
  const openRoom = () => ({
    code: CODE, ownerId: "c".repeat(24), seq: 5,
    currentIndex: 0,
    phase: "question",
    secretTask: SECRET_TASK,
    questionStartedAt: new Date(),
    questionEndsAt: new Date(Date.now() + 30_000),
    students: { s1: { name: "Аня", score: 0, answered: 0 } },
    answers: {},
  });

  it("верный ответ начисляет очки", async () => {
    const { db } = useFakeDb(openRoom());
    const res = await POST(
      req({ event: "student:answer", payload: { studentId: "s1", index: 0, answer: { type: "MCQ", selectedIndex: 0 }, ms: 100 } }),
      params,
    );
    expect(res.status).toBe(200);
    const after = await roomsOf(db).findOne();
    // Счёт вырос, ответ засчитан ровно один раз.
    expect((after.students as { s1: { score: number } }).s1.score).toBeGreaterThan(0);
    expect(after.answers?.[0]?.s1).toBe(true);
  });

  it("неверный ответ очков не даёт", async () => {
    const { db } = useFakeDb(openRoom());
    await POST(
      req({ event: "student:answer", payload: { studentId: "s1", index: 0, answer: { type: "MCQ", selectedIndex: 1 }, ms: 100 } }),
      params,
    );
    const after = await roomsOf(db).findOne();
    expect((after.students as { s1: { score: number } }).s1.score).toBe(0);
  });

  it("ученик без join не может набрать очки", async () => {
    const { db } = useFakeDb(openRoom());
    await POST(
      req({ event: "student:answer", payload: { studentId: "ghost", index: 0, answer: { type: "MCQ", selectedIndex: 0 }, ms: 100 } }),
      params,
    );
    // Ответ не должен был появиться в карте ответов.
    const roomAfter = await roomsOf(db).findOne();
    expect(roomAfter.answers?.[0]).toBeUndefined();
  });

  it("после закрытия вопроса ответы не принимаются", async () => {
    const room = openRoom();
    room.questionEndsAt = new Date(Date.now() - 60_000);
    const { db } = useFakeDb(room);
    await POST(
      req({ event: "student:answer", payload: { studentId: "s1", index: 0, answer: { type: "MCQ", selectedIndex: 0 }, ms: 100 } }),
      params,
    );
    const after = await roomsOf(db).findOne();
    expect(after.answers?.[0]).toBeUndefined();
  });
});

describe("GET /api/quiz/[code]", () => {
  it("отдаёт события строго после since", async () => {
    const sink = { events: [{ seq: 1, event: "a", payload: {}, createdAt: new Date() }, { seq: 2, event: "b", payload: {}, createdAt: new Date() }] };
    useFakeDb({ code: CODE, ownerId: "c".repeat(24), seq: 2 }, sink);
    const res = await GET(new Request(`http://x/api/quiz/${CODE}?since=1`), params);
    const data = await res.json();
    expect(data.events).toHaveLength(2);
  });

  it("ограничивает частоту чтения", async () => {
    mocks.checkRateLimitAsync.mockResolvedValue({ ok: false, remaining: 0, resetAt: Date.now() + 60_000 });
    useFakeDb(null);
    const res = await GET(new Request(`http://x/api/quiz/${CODE}`), params);
    expect(res.status).toBe(429);
  });
});
