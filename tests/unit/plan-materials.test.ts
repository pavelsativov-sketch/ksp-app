import { beforeEach, describe, expect, it, vi } from "vitest";

const updateOne = vi.fn();
const getPlanById = vi.fn();

vi.mock("@/lib/mongo", () => ({
  COL: { planMaterials: "lesson_plan_materials" },
  getDb: async () => ({ collection: () => ({ updateOne }) }),
}));
vi.mock("@/lib/plans-repo", () => ({ getPlanById: (id: string) => getPlanById(id) }));

const { saveToOwnedPlan } = await import("@/lib/materials/plan-materials");

const PLAN = "64b7f0c2a1b2c3d4e5f60718";
const input = { planId: PLAN, ownerId: "u1", kind: "worksheet" as const, title: "Лист", payload: { a: 1 } };

describe("saveToOwnedPlan", () => {
  beforeEach(() => {
    updateOne.mockReset();
    getPlanById.mockReset();
  });

  it("saves the material into the owner's lesson, middle stage by default", async () => {
    getPlanById.mockResolvedValue({ owner_id: "u1" });
    await expect(saveToOwnedPlan(input)).resolves.toBe(true);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: `${PLAN}:worksheet`, owner_id: "u1" });
    expect(update.$set).toMatchObject({ plan_id: PLAN, kind: "worksheet", stage: "middle", payload: { a: 1 } });
  });

  it("does not save into someone else's lesson", async () => {
    getPlanById.mockResolvedValue({ owner_id: "other" });
    await expect(saveToOwnedPlan(input)).resolves.toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("skips a missing or malformed lesson id without a database call", async () => {
    await expect(saveToOwnedPlan({ ...input, planId: undefined })).resolves.toBe(false);
    await expect(saveToOwnedPlan({ ...input, planId: "draft" })).resolves.toBe(false);
    expect(getPlanById).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing when the database fails", async () => {
    getPlanById.mockResolvedValue({ owner_id: "u1" });
    updateOne.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(saveToOwnedPlan(input)).resolves.toBe(false);
  });
});
