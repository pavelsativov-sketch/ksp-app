import { bilimClassInstructions, isBilimClassContext } from "./bilimclass";
import { isKundelikContext, kundelikInstructions } from "./kundelik";
import { isNobdContext, nobdInstructions } from "./nobd";

export {
  bilimClassInstructions,
  isBilimClassContext,
  kundelikInstructions,
  isKundelikContext,
  nobdInstructions,
  isNobdContext,
};

export type DomainSkillId = "bilimclass" | "kundelik" | "nobd";

export function detectDomainSkills(goal: string, url: string): DomainSkillId[] {
  const active: DomainSkillId[] = [];
  if (isBilimClassContext(goal, url)) active.push("bilimclass");
  if (isKundelikContext(goal, url)) active.push("kundelik");
  if (isNobdContext(goal, url)) active.push("nobd");
  return active;
}

export function isEducationalPortalContext(goal: string, url: string): boolean {
  return detectDomainSkills(goal, url).length > 0;
}

export function getDomainSkillInstructions(id: DomainSkillId, goal?: string): string {
  switch (id) {
    case "bilimclass":
      return bilimClassInstructions(goal);
    case "kundelik":
      return kundelikInstructions();
    case "nobd":
      return nobdInstructions();
  }
}

export function combinedDomainInstructions(goal: string, url: string): string {
  const ids = detectDomainSkills(goal, url);
  if (ids.length === 0) return "";
  return ids.map((id) => getDomainSkillInstructions(id, goal)).join("\n\n");
}
