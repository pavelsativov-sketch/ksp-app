export const PLAN_VERSION_SECTIONS = ["metadata", "objectives", "context", "beginning", "middle", "end", "evaluation"] as const;
export type PlanSection = (typeof PLAN_VERSION_SECTIONS)[number];
