import "server-only";
import { getUserSchools, type SchoolDoc } from "../school";

/**
 * Активная школа пользователя: пока у аккаунта одна школа — первая.
 * Все страницы /school/* опираются на этот хелпер; отсутствие школы
 * означает, что пользователю нужно показать экран создания/подключения.
 */
export async function getActiveSchool(userId: string): Promise<SchoolDoc | null> {
  const schools = await getUserSchools(userId);
  return schools[0] ?? null;
}

export function formatSchoolSubtitle(school: SchoolDoc): string {
  return `${school.region}, ${school.city} • ${school.academic_year} учебный год`;
}
