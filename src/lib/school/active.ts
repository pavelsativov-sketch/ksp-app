import "server-only";
import { cookies } from "next/headers";
import { getUserSchools, type SchoolDoc } from "../school";

export const ACTIVE_SCHOOL_COOKIE = "ksp_active_school";

/**
 * Активная школа пользователя: пока у аккаунта одна школа — первая.
 * Все страницы /school/* опираются на этот хелпер; отсутствие школы
 * означает, что пользователю нужно показать экран создания/подключения.
 */
export async function getActiveSchool(userId: string): Promise<SchoolDoc | null> {
  const schools = await getUserSchools(userId);
  if (!schools.length) return null;
  const selectedId = (await cookies()).get(ACTIVE_SCHOOL_COOKIE)?.value;
  return schools.find((school) => school._id?.toString() === selectedId)
    ?? [...schools].sort((a, b) => a.name.localeCompare(b.name, "ru"))[0]
    ?? null;
}

export function formatSchoolSubtitle(school: SchoolDoc): string {
  return `${school.region}, ${school.city} • ${school.academic_year} учебный год`;
}
