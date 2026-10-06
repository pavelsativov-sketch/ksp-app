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
}

export function effectivePlan(user: UserBillingFields | null, now = new Date()): Plan {
  return user?.plan === "pro" &&
    (user.plan_expires_at == null || user.plan_expires_at.getTime() > now.getTime())
    ? "pro" : "free";
}
