export type SchoolRole = "teacher" | "deputy" | "director" | "admin";

export const SCHOOL_PERMISSIONS = [
  "school:members:list",
  "school:members:manage",
  "school:classes:manage",
  "school:students:read_all",
  "school:students:write_all",
  "school:students:read_assigned",
  "school:students:write_assigned",
  "school:reports:read",
  "school:reports:export",
  "school:plans:read_all",
  "school:plans:review",
  "school:plans:approve",
  "school:plans:comment_assigned",
  "school:vsk:read_all",
  "school:vsk:manage",
] as const;

export type SchoolPermission = (typeof SCHOOL_PERMISSIONS)[number];

export const SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS: readonly SchoolPermission[] = [
  "school:plans:review",
  "school:plans:approve",
  "school:plans:comment_assigned",
];

/**
 * Default least-privilege policy approved for KSP App. Admin receives no
 * automatic school-data or pedagogical capabilities; a director may grant
 * narrowly-scoped SchoolPermission values explicitly.
 */
export const SCHOOL_ROLE_MATRIX: Record<SchoolRole, readonly SchoolPermission[]> = {
  teacher: [
    "school:students:read_assigned",
    "school:students:write_assigned",
    "school:plans:comment_assigned",
  ],
  deputy: [
    "school:members:list",
    "school:classes:manage",
    "school:students:read_all",
    "school:students:write_all",
    "school:reports:read",
    "school:plans:read_all",
    "school:plans:review",
    "school:plans:approve",
    "school:plans:comment_assigned",
    "school:vsk:read_all",
  ],
  director: [
    "school:members:list",
    "school:members:manage",
    "school:classes:manage",
    "school:students:read_all",
    "school:students:write_all",
    "school:reports:read",
    "school:reports:export",
    "school:plans:read_all",
    "school:plans:review",
    "school:plans:approve",
    "school:plans:comment_assigned",
    "school:vsk:read_all",
    "school:vsk:manage",
  ],
  admin: [],
};

export function hasSchoolPermission(
  role: SchoolRole,
  grantedPermissions: readonly SchoolPermission[] | undefined,
  permission: SchoolPermission,
): boolean {
  if (role === "admin") {
    if (SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS.includes(permission)) return false;
    return grantedPermissions?.includes(permission) ?? false;
  }
  return SCHOOL_ROLE_MATRIX[role].includes(permission);
}
