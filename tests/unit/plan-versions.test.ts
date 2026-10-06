import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { PlanDoc } from "@/lib/plans-repo";
import type { PlanVersionDoc } from "@/lib/plan-versions";
import { emptyKsp } from "@/lib/types/ksp";

const mock = vi.hoisted(() => ({ db: vi.fn(), auth: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/mongo", async original => ({ ...await original<typeof import("@/lib/mongo")>(), getDb: mock.db }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mock.refresh }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
import { COL } from "@/lib/mongo";
import { deletePlanWithVersions, getPlanHistory, PLAN_CONFLICT, updatePlanWithVersion, planState } from "@/lib/plan-versions";
import { duplicatePlanAction, restorePlanVersionAction, saveDraftAction, savePlanAction } from "@/app/actions/plans";

const id = "111111111111111111111111";
const other = "222222222222222222222222";
const owner = "owner";
const time = new Date("2026-09-17T12:00:00.000Z");
let plans: PlanDoc[];
let versions: PlanVersionDoc[];
let fail: "update" | "cleanup" | "snapshot" | undefined;
const endSession = vi.fn();
const session = { endSession, withTransaction: async (fn: () => Promise<unknown>) => {
  const beforePlans = plans.map(p => ({ ...p }));
  const beforeVersions = versions.map(v => ({ ...v }));
  try { return await fn(); } catch (e) { plans = beforePlans; versions = beforeVersions; throw e; }
} };
function same(a: unknown, b: unknown) { return String(a) === String(b); }
function matches(doc: object, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return (value as Record<string, unknown>[]).some(f => matches(doc, f));
    const actual = (doc as Record<string, unknown>)[key];
    if (value && typeof value === "object" && "$in" in value) return (value.$in as unknown[]).some(v => same(actual, v));
    return same(actual, value);
  });
}
function collection(name: string) {
  const data = () => name === COL.plans ? plans : versions;
  return {
    findOne: async (filter: Record<string, unknown>) => data().find(d => matches(d, filter)) ?? null,
    insertOne: async (doc: PlanDoc | PlanVersionDoc, options?: { session?: unknown }) => {
      if (name === COL.planVersions) { expect(options?.session).toBe(session); if (fail === "snapshot") throw new Error("snapshot unavailable"); }
      const _id = new ObjectId();
      if (name === COL.plans) plans.push({ ...doc, _id } as PlanDoc);
      else versions.push({ ...doc, _id } as PlanVersionDoc);
      return { insertedId: _id };
    },
    updateOne: async (filter: Record<string, unknown>, update: { $set: Partial<PlanDoc> }, options: { session?: unknown }) => {
      expect(options.session).toBe(session);
      if (fail === "update") throw new Error("update unavailable");
      const p = plans.find(p => matches(p, filter));
      if (!p) return { matchedCount: 0 };
      Object.assign(p, update.$set);
      return { matchedCount: 1 };
    },
    deleteOne: async (filter: Record<string, unknown>, options: { session?: unknown }) => {
      expect(options.session).toBe(session);
      const count = plans.length; plans = plans.filter(p => !matches(p, filter));
      return { deletedCount: count - plans.length };
    },
    deleteMany: async (filter: Record<string, unknown>, options: { session?: unknown }) => {
      expect(options.session).toBe(session);
      if (fail === "cleanup") throw new Error("cleanup unavailable");
      versions = versions.filter(v => !matches(v, filter));
    },
    find: (filter: Record<string, unknown>) => {
      let rows = data().filter(d => matches(d, filter));
      const cursor = {
        sort: () => { rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || String(b._id).localeCompare(String(a._id))); return cursor; },
        skip: (n: number) => { rows = rows.slice(n); return cursor; },
        limit: (n: number) => { rows = rows.slice(0, n); return cursor; },
        toArray: async () => rows,
      }; return cursor;
    },
  };
}
function plan(): PlanDoc {
  return { _id: new ObjectId(id), owner_id: owner, title: "Original", subject_id: null, grade: 5, quarter: null,
    section: null, content: { ...emptyKsp(), topic: "Fractions" }, visibility: "private", language: "ru", created_at: time, updated_at: time };
}
function addVersion(overrides: Partial<PlanVersionDoc> = {}) {
  const v: PlanVersionDoc = { _id: new ObjectId(), plan_id: id, owner_id: owner, created_at: time, reason: "save", snapshot: { ...planState(plan()), title: "Old", visibility: "public", is_draft: true, updated_at: time }, ...overrides };
  versions.push(v); return v;
}
beforeEach(() => {
  vi.clearAllMocks(); plans = [plan()]; versions = []; fail = undefined;
  mock.auth.mockResolvedValue({ id: owner });
  mock.db.mockResolvedValue({ client: { startSession: () => session }, collection });
});

describe("transactional plan history (mock Mongo only)", () => {
  it("snapshots previous state on full and incomplete draft saves", async () => {
    const full = await savePlanAction({ ...planState(plan()), title: "New", id, expected_updated_at: time.toISOString() });
    expect(full).toHaveProperty("updated_at"); expect(versions[0].snapshot.title).toBe("Original");
    const draft = await saveDraftAction({ ...planState(plan()), title: "", content: emptyKsp(), id, expected_updated_at: plans[0].updated_at.toISOString() });
    expect(draft).toHaveProperty("id", id); expect(versions[1].snapshot.title).toBe("New");
    // Черновик существующего плана не меняет статус публикации (ни видимость,
    // ни флаг черновика) — это делает только явное «Сохранить».
    expect(plans[0]).toMatchObject({ is_draft: false, visibility: "private", title: "(без названия)" });
    expect(endSession).toHaveBeenCalledTimes(2);
  });
  it("isolates owner and snapshot plan IDs, even for public plans", async () => {
    plans[0].visibility = "public";
    expect(await getPlanHistory(id, "stranger")).toBeNull();
    await expect(updatePlanWithVersion(id, "stranger", time.toISOString(), { state: planState(plan()), reason: "save" })).rejects.toThrow("План не найден");
    for (const v of [addVersion({ plan_id: other }), addVersion({ owner_id: "stranger" })]) {
      const res = await restorePlanVersionAction({ plan_id: id, version_id: String(v._id), expected_updated_at: time.toISOString() });
      expect(res).toEqual({ error: "Версия не найдена" });
    }
    expect((await getPlanHistory(id, owner))?.versions).toHaveLength(0);
    expect(plans[0].title).toBe("Original");
  });
  it("restores fields/draft flag, preserves current visibility and snapshots current state", async () => {
    const v = addVersion();
    const res = await restorePlanVersionAction({ plan_id: id, version_id: String(v._id), expected_updated_at: time.toISOString() });
    expect(res).toHaveProperty("id", id);
    expect(plans[0]).toMatchObject({ title: "Old", is_draft: true, visibility: "private", owner_id: owner, created_at: time });
    expect(versions[1]).toMatchObject({ reason: "restore", snapshot: { title: "Original", visibility: "private" } });
    expect(plans[0].updated_at > time).toBe(true);
  });
  it.each([undefined, "bad", "2026-09-17", "2026-09-17T11:00:00.000Z"])("rejects missing, malformed or stale revision %s", async revision => {
    await expect(updatePlanWithVersion(id, owner, revision, { state: planState(plan()), reason: "save" })).rejects.toThrow(PLAN_CONFLICT);
    expect(versions).toHaveLength(0);
  });
  it.each(["snapshot", "update", "cleanup"] as const)("rolls back plan/snapshot/retention on %s failure", async failure => {
    for (let i = 0; i < 30; i++) addVersion();
    const beforeIds = versions.map(v => String(v._id));
    fail = failure;
    const res = await savePlanAction({ ...planState(plan()), id, title: "Changed", expected_updated_at: time.toISOString() });
    expect(res).toHaveProperty("error"); expect(plans[0].title).toBe("Original");
    expect(versions.map(v => String(v._id))).toEqual(beforeIds); expect(endSession).toHaveBeenCalled();
  });
  it("retains last 30 snapshots atomically without affecting other plans or owners", async () => {
    const foreign = addVersion({ plan_id: other }); const foreignOwner = addVersion({ owner_id: "stranger" });
    for (let i = 0; i < 35; i++) await updatePlanWithVersion(id, owner, plans[0].updated_at.toISOString(), { state: { ...planState(plan()), title: `Edit ${i}` }, reason: "draft" });
    expect(versions.filter(v => v.plan_id === id && v.owner_id === owner)).toHaveLength(30);
    expect(versions).toContain(foreign); expect(versions).toContain(foreignOwner);
    expect((await getPlanHistory(id, owner))?.versions[0].plan.title).toBe("Edit 33");
  });
  it("deletes only owned plan history and rolls back deletion if cleanup fails", async () => {
    addVersion(); const foreign = addVersion({ plan_id: other });
    await expect(deletePlanWithVersions(id, "stranger")).rejects.toThrow("План не найден");
    fail = "cleanup";
    await expect(deletePlanWithVersions(id, owner)).rejects.toThrow();
    expect(plans).toHaveLength(1); expect(versions).toHaveLength(2);
    fail = undefined; await deletePlanWithVersions(id, owner);
    expect(plans).toHaveLength(0); expect(versions).toEqual([foreign]);
  });
  it("returns auth and database errors instead of throwing to restore UI", async () => {
    mock.auth.mockResolvedValue(null);
    expect(await restorePlanVersionAction({ plan_id: id, version_id: id })).toEqual({ error: "Требуется вход" });
    expect(mock.db).not.toHaveBeenCalled();
    mock.auth.mockRejectedValue(new Error("secret database error"));
    expect(await restorePlanVersionAction({ plan_id: id, version_id: id })).toEqual({ error: "Не удалось восстановить версию: база данных недоступна" });
  });
  it("bounds UTF-8 draft bytes before writes", async () => {
    const result = await saveDraftAction({ ...planState(plan()), content: { ...emptyKsp(), topic: "я".repeat(140000) } });
    expect(result).toEqual({ error: "Черновик слишком большой" }); expect(mock.db).not.toHaveBeenCalled();
  });
  it("duplicates privately, keeps draft flag and a valid title suffix, without copying history", async () => {
    plans[0].title = "x".repeat(5000); plans[0].is_draft = true; plans[0].visibility = "public";
    addVersion();
    await expect(duplicatePlanAction(id)).rejects.toThrow("NEXT_REDIRECT");
    expect(plans[1]).toMatchObject({ owner_id: owner, is_draft: true, visibility: "private" });
    expect(plans[1].title).toHaveLength(5000); expect(plans[1].title.endsWith(" (копия)")).toBe(true);
    expect(versions).toHaveLength(1);
  });
});
