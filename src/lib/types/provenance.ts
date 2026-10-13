export type ReusableBlockKind = "stage" | "task" | "criterion";
export type ReusableStageKey = "beginning" | "middle" | "end";
export type PlanLanguage = "ru" | "kz";

/** Teacher-side provenance only; never include this object in learner projections. */
export interface ReusableBlockProvenance {
  sourcePlanId: string;
  sourcePlanTitle: string;
  sourceGrade: number;
  sourceLanguage: PlanLanguage;
  blockKind: ReusableBlockKind;
  sourceStage?: ReusableStageKey;
  copiedAt: string;
}

export interface ReusedCriterionSource {
  criterion: string;
  provenance: ReusableBlockProvenance;
}
