/**
 * L2: «уже состоите в школе» сравнивает school_id в том же виде, в каком он
 * хранится (строка), иначе повторный вход дублировал участника.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const schoolId = new ObjectId();
const mock = vi.hoisted(() => ({
  memberFindOne: vi.fn(),
  addSchoolMember: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "u".repeat(24), email: "t@example.invalid" }) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ ok: true }),
  clientIpFromHeaders: () => "203.0.113.1",
}));
vi.mock("@/lib/school", () => ({ createSchool: vi.fn(), addSchoolMember: mock.addSchoolMember }));
vi.mock("@/lib/mongo", () => ({
  COL: { schools: "schools", schoolMembers: "school_members" },
  getDb: async () => ({
    collection: (name: string) => name === "schools"
      ? { findOne: async () => ({ _id: schoolId, code: "SCHOOL1" }) }
      : { findOne: mock.memberFindOne },
  }),
}));

import { joinSchoolAction } from "@/app/actions/school";

beforeEach(() => vi.clearAllMocks());

describe("joinSchoolAction", () => {
  it("ищет участника по строковому school_id и не добавляет повторно", async () => {
    mock.memberFindOne.mockImplementation(async (filter: { school_id: unknown }) =>
      filter.school_id === schoolId.toString() ? { _id: new ObjectId() } : null);
    const result = await joinSchoolAction("SCHOOL1");
    expect(result).toEqual({ error: "Вы уже состоите в этой школе" });
    expect(mock.addSchoolMember).not.toHaveBeenCalled();
  });
});

describe("joinSchoolAction: код школы", () => {
  it("принимает код строкой (раньше схема-объект отвергала любой код)", async () => {
    mock.memberFindOne.mockResolvedValue(null);
    mock.addSchoolMember.mockResolvedValue(undefined);
    expect(await joinSchoolAction("SCHOOL1")).toEqual({ ok: true });
    expect(mock.addSchoolMember).toHaveBeenCalledWith(schoolId.toString(), expect.objectContaining({ role: "teacher" }));
  });
});
