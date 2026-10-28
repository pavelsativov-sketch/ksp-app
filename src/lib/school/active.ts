import "server-only";
import { cookies } from "next/headers";
import { getUserSchools, type SchoolDoc } from "../school";
import { getLocale } from "@/lib/i18n/server";

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
  // Сортировка «школы по умолчанию» использует локаль интерфейса
  // пользователя (kk/ru), а не жёстко русский алфавит: казахские названия
  // сортируются по-казахски, русские — по-русски.
  const locale = await getLocale().catch(() => "ru" as const);
  const sortLocale = locale === "kk" ? "kk" : "ru";
  return schools.find((school) => school._id?.toString() === selectedId)
    ?? [...schools].sort((a, b) => a.name.localeCompare(b.name, sortLocale, { numeric: true, sensitivity: "base" }))[0]
    ?? null;
}

export function formatSchoolSubtitle(school: SchoolDoc): string {
  return `${school.region}, ${school.city} • ${school.academic_year} учебный год`;
}
