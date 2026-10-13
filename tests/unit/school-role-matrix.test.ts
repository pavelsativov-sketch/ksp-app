import { describe, expect, it } from "vitest";
import { hasSchoolPermission } from "@/lib/school/role-matrix";

describe("approved school role matrix", () => {
  it("allows teachers only assigned student data, not school-wide student records", () => {
    expect(hasSchoolPermission("teacher", undefined, "school:students:read_assigned")).toBe(true);
    expect(hasSchoolPermission("teacher", undefined, "school:students:read_all")).toBe(false);
    expect(hasSchoolPermission("teacher", undefined, "school:reports:export")).toBe(false);
    expect(hasSchoolPermission("teacher", undefined, "school:plans:approve")).toBe(false);
    expect(hasSchoolPermission("teacher", undefined, "school:plans:review")).toBe(false);
  });

  it("lets deputies review school data without managing membership or exporting", () => {
    expect(hasSchoolPermission("deputy", undefined, "school:plans:review")).toBe(true);
    expect(hasSchoolPermission("deputy", undefined, "school:plans:approve")).toBe(true);
    expect(hasSchoolPermission("deputy", undefined, "school:members:manage")).toBe(false);
    expect(hasSchoolPermission("deputy", undefined, "school:reports:export")).toBe(false);
  });

  it("lets directors manage roles and export but keeps explicit admin grants separate", () => {
    expect(hasSchoolPermission("director", undefined, "school:members:manage")).toBe(true);
    expect(hasSchoolPermission("director", undefined, "school:reports:export")).toBe(true);
    expect(hasSchoolPermission("admin", undefined, "school:reports:read")).toBe(false);
    expect(hasSchoolPermission("admin", ["school:reports:read"], "school:reports:read")).toBe(true);
    expect(hasSchoolPermission("admin", ["school:reports:read"], "school:reports:export")).toBe(false);
    expect(hasSchoolPermission("admin", ["school:plans:review"], "school:plans:review")).toBe(false);
    expect(hasSchoolPermission("admin", ["school:plans:comment_assigned"], "school:plans:comment_assigned")).toBe(false);
    expect(hasSchoolPermission("admin", ["school:plans:approve"], "school:plans:approve")).toBe(false);
  });
});
