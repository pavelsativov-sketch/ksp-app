import { describe, expect, it } from "vitest";
import { bonusGenerations, effectiveLimits, PLANS } from "@/lib/billing/plans";

const now = new Date("2026-11-17T10:00:00.000Z");

describe("bonusGenerations / effectiveLimits", () => {
  it("sums permanent and current-month bonus, ignores other months and junk", () => {
    expect(bonusGenerations({ bonus_generations: 2, bonus_generations_month: { month: "2026-11", count: 3 } }, now)).toBe(5);
    expect(bonusGenerations({ bonus_generations_month: { month: "2026-10", count: 3 } }, now)).toBe(0);
    expect(bonusGenerations({ bonus_generations: -4 }, now)).toBe(0);
    expect(bonusGenerations(null, now)).toBe(0);
  });

  it("keeps Pro unlimited and does not mutate the shared plan table", () => {
    expect(effectiveLimits({ plan: "pro", plan_expires_at: null, bonus_generations: 5 }, now).kspPerMonth).toBeNull();
    expect(effectiveLimits({ bonus_generations: 5 }, now).kspPerMonth).toBe(8);
    expect(PLANS.free.limits.kspPerMonth).toBe(3);
  });
});
