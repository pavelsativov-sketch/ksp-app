import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
const mock = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mock.auth, limitAdmin: mock.limit }));
vi.mock("@/lib/mongo", async (original) => ({ ...await original<typeof import("@/lib/mongo")>(), getDb: mock.db }));
import { getAdminDashboard, parseAdminQuery, userSearchFilter } from "@/lib/admin/queries";
const id = new ObjectId("111111111111111111111111");
const find = vi.fn();
const aggregate = vi.fn();
const skip = vi.fn();
const limit = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ id: id.toHexString() });
  mock.limit.mockResolvedValue(undefined);
  mock.db.mockResolvedValue({ collection: (name: string) => ({
    countDocuments: async () => 26,
    find: (filter: unknown, options: unknown) => {
      find(name, filter, options);
      const cursor = { sort: () => cursor, skip: (n: number) => { skip(n); return cursor; }, limit: (n: number) => { limit(n); return cursor; }, toArray: async () => name === "users" ? [{ _id: id, email: "test@example.invalid", full_name: "Test", created_at: new Date(), password_hash: "PASSWORD_SECRET" }] : [{ _id: id, type: "pro_1m", status: "active", created_at: new Date(), codeHash: "HASH_SECRET", plaintext: "PLAINTEXT_SECRET", note: "NOTE_SECRET" }] };
      return cursor;
    },
    aggregate: (pipeline: unknown) => { aggregate(name, pipeline); return { toArray: async () => [] }; },
  }) });
});
describe("admin dashboard data", () => {
  it("bounds pagination and search and escapes regex metacharacters", () => {
    expect(parseAdminQuery({ page: "-1", codePage: "99999", q: "x".repeat(200), status: "bad" })).toMatchObject({ page: 1, codePage: 10000, q: "x".repeat(100), status: "all" });
    expect(userSearchFilter(".*")).toEqual({ $or: [{ email: { $regex: "\\.\\*", $options: "i" } }, { full_name: { $regex: "\\.\\*", $options: "i" } }] });
    expect(userSearchFilter(id.toHexString()).$or).toContainEqual({ _id: id });
  });
  it("guards data access before querying", async () => {
    mock.auth.mockRejectedValue(new Error("denied"));
    await expect(getAdminDashboard({})).rejects.toThrow("denied");
    expect(mock.db).not.toHaveBeenCalled();
  });
  it("returns only whitelisted DTO fields and server-side pages", async () => {
    const result = await getAdminDashboard({ page: "2", codePage: "2" });
    expect(skip).toHaveBeenCalledWith(25);
    expect(limit).toHaveBeenCalledWith(25);
    expect(JSON.stringify(result)).not.toMatch(/PASSWORD_SECRET|HASH_SECRET|PLAINTEXT_SECRET|NOTE_SECRET|codeHash|password_hash/);
    expect(find).toHaveBeenCalledWith("billing_codes", {}, expect.objectContaining({ projection: expect.not.objectContaining({ codeHash: 1 }) }));
    expect(result.users[0]).toMatchObject({ plan: "free", generations: 0, images: 0 });
  });
  it("separates provider telemetry from quota and feedback events using UTC windows", async () => {
    await getAdminDashboard({});
    expect(aggregate).toHaveBeenCalledWith("ai_events", expect.arrayContaining([
      { $match: { createdAt: { $gte: expect.any(Date), $lt: expect.any(Date) }, provider: { $type: "string" }, ok: { $type: "bool" } } },
    ]));
    expect(aggregate).toHaveBeenCalledWith("ai_events", expect.arrayContaining([
      { $match: { createdAt: { $gte: expect.any(Date), $lt: expect.any(Date) }, user_id: { $type: "string" }, task: { $in: ["generation", "image"] } } },
    ]));
  });
});
