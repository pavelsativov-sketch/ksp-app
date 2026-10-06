"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClass, deleteClass, renameClass } from "@/lib/classes";
import { log } from "@/lib/logger";

export interface ClassFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  info?: string;
}

const empty: ClassFormState = {};

export async function addClassAction(_: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const gradeRaw = String(formData.get("grade") ?? "").trim();
  const result = await createClass(user.id, {
    name: String(formData.get("name") ?? ""),
    // Пустая строка = кружок/секция, а не класс.
    grade: gradeRaw ? Number(gradeRaw) : null,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/plans/new");
  return { info: `Класс «${result.class.name}» добавлен.` };
}

export async function renameClassAction(_: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const result = await renameClass(
    user.id,
    String(formData.get("classId") ?? ""),
    String(formData.get("name") ?? ""),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/plans/new");
  return empty;
}

export async function deleteClassAction(_: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const classId = String(formData.get("classId") ?? "");
  const result = await deleteClass(user.id, classId);
  if (!result.ok) return { error: result.error };
  log.info("Класс удалён, планы оставлены без привязки", { userId: user.id, classId });
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/plans/new");
  return { info: "Класс удалён. Планы остались, но больше не привязаны к нему." };
}

/** Быстрое добавление набора параллелей «1…11» одним действием. */
export async function addAllGradesAction(_: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const letterRaw = String(formData.get("letter") ?? "").trim();
  const letter = letterRaw ? z.string().max(3).parse(letterRaw) : "";
  const grades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const created: string[] = [];
  // Часть может не создаться (уже существует) — это не ошибка для набора.
  for (const grade of grades) {
    const result = await createClass(user.id, { name: `${grade}${letter}`, grade });
    if (result.ok) created.push(result.class.name);
  }
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/plans/new");
  if (created.length === 0) return { error: "Все такие классы уже заведены." };
  return { info: `Добавлено: ${created.join(", ")}` };
}
