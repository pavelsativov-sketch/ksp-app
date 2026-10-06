import { describe, expect, it } from "vitest";
import { localTupObjectives } from "@/lib/goso/local";

describe("current Informatics TUP objectives", () => {
  it("uses the current TUP for grades 1-9", () => {
    const objectives = localTupObjectives({ subject: "Информатика", grade: 5 });
    expect(objectives?.length).toBeGreaterThan(0);
    expect(objectives?.some((objective) => objective.code === "5.1.1.1")).toBe(true);
  });

  it("keeps separate objectives for EMN and OGN in grade 10", () => {
    const emn = localTupObjectives({ subject: "Информатика", grade: 10, schoolProfile: "emn" });
    const ogn = localTupObjectives({ subject: "Информатика", grade: 10, schoolProfile: "ogn" });
    expect(emn?.length).toBeGreaterThan(0);
    expect(ogn?.length).toBeGreaterThan(0);
    expect(emn?.map((objective) => objective.text_ru)).not.toEqual(ogn?.map((objective) => objective.text_ru));
  });
});
