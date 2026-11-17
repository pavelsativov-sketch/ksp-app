export type Plan = "free" | "pro";

export interface PlanLimits {
  /** Полных КСП за месяц (дорогая операция — создание плана с нуля). */
  kspPerMonth: number | null;
  /**
   * Вспомогательных AI-операций за месяц: улучшение секций, генерация
   * заданий, рабочие листы, памятки, кроссворды.
   *
   * Отдельная от kspPerMonth квота: улучшить 5 секций одного КСП не должно
   * съедать лимит на 3 полных плана, но и не должно быть безлимитным.
   */
  assistPerMonth: number | null;
  handoutsWatermark: boolean;
  ktp: boolean;
  textbooks: number;
  images: number | null;
}

export interface PlanDocument {
  id: Plan;
  limits: Readonly<PlanLimits>;
  // Мягкий ориентир, не блокирующая квота.
  kspFairUsePerMonth: number | null;
}

export const PLANS: Readonly<Record<Plan, PlanDocument>> = {
  free: {
    id: "free",
    limits: {
      kspPerMonth: 3, assistPerMonth: 30, handoutsWatermark: true,
      ktp: false, textbooks: 0, images: 0,
    },
    kspFairUsePerMonth: null,
  },

  pro: {
    id: "pro",
    limits: {
      kspPerMonth: null, assistPerMonth: null, handoutsWatermark: false,
      ktp: true, textbooks: 3, images: 50,
    },
    kspFairUsePerMonth: 60,
  },
};

// Поля существующей users; отсутствие плана означает Free.
export interface UserBillingFields {
  plan?: Plan;
  plan_expires_at?: Date | null;
  /** Бонус администратора: +N КСП к месячному лимиту каждый месяц. */
  bonus_generations?: number;
  /** Бонус администратора только на указанный месяц UTC ("YYYY-MM"). */
  bonus_generations_month?: { month: string; count: number } | null;
}

const nonNegative = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** Сколько дополнительных КСП выдано администратором на месяц `now` (UTC). */
export function bonusGenerations(user: UserBillingFields | null, now = new Date()): number {
  const month = now.toISOString().slice(0, 7);
  const monthly = user?.bonus_generations_month?.month === month ? nonNegative(user.bonus_generations_month.count) : 0;
  return nonNegative(user?.bonus_generations) + monthly;
}

/** Лимиты тарифа с учётом бонуса администратора (безлимит остаётся безлимитом). */
export function effectiveLimits(user: UserBillingFields | null, now = new Date()): Readonly<PlanLimits> {
  const limits = PLANS[effectivePlan(user, now)].limits;
  const bonus = bonusGenerations(user, now);
  return bonus && limits.kspPerMonth !== null ? { ...limits, kspPerMonth: limits.kspPerMonth + bonus } : limits;
}

export function effectivePlan(user: UserBillingFields | null, now = new Date()): Plan {
  return user?.plan === "pro" &&
    (user.plan_expires_at == null || user.plan_expires_at.getTime() > now.getTime())
    ? "pro" : "free";
}
