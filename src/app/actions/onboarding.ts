"use server";

import { z } from "zod";
import { getDb, COL, toObjectId } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";

const onboardingSchema = z.object({
  school: z.string().trim().max(200).default(""),
  subjects: z.array(z.string().trim().max(200)).max(30).default([]),
  grades: z.array(z.coerce.number().int().min(1).max(11)).max(11).default([]),
});

/** Сохранение профиля онбординга + отметка о прохождении. */
export async function completeOnboardingAction(input: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { error: "Некорректные данные" };
  const oid = toObjectId(user.id);
  if (!oid) return { error: "Требуется вход" };
  try {
    const db = await getDb();
    await db.collection(COL.users).updateOne(
      { _id: oid },
      {
        $set: {
          school: parsed.data.school || null,
          subjects_taught: parsed.data.subjects,
          grades_taught: parsed.data.grades,
          onboarded_at: new Date(),
        },
      },
    );
    return { ok: true };
  } catch {
    return { error: "Не удалось сохранить. Попробуйте позже." };
  }
}
