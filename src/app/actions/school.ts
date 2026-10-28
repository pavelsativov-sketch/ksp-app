"use server";

import { getCurrentUser } from '@/lib/auth';
import { createSchool, addSchoolMember } from '@/lib/school';
import { getDb, COL } from '@/lib/mongo';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { headers } from 'next/headers';
import { z } from 'zod';

/** IP клиента для rate-limit — единый разбор из rate-limit.ts. */
async function clientIp(): Promise<string> {
  const { clientIpFromHeaders } = await import('@/lib/rate-limit');
  return clientIpFromHeaders(await headers());
}

const createSchoolSchema = z.object({
  name: z.string().min(2),
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9-]+$/).transform(value => value.toUpperCase()),
  region: z.string().min(2),
  city: z.string().min(2),
  academic_year: z.string().trim().regex(/^\d{4}-\d{4}$/),
  settings: z.object({
    language: z.enum(['ru', 'kk']),
    shifts: z.number().min(1).max(2),
    grading_system: z.enum(['5-point', '10-point']),
  })
});

export async function createSchoolAction(formData: FormData): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  // Ограничение частоты создания школ — иначе можно спамить школьные записи.
  const ip = await clientIp();
  const byUser = await checkRateLimitAsync(`school:create:user:${user.id}`, 3, 3_600_000);
  if (!byUser.ok) return { error: 'Слишком много школ за час. Попробуйте позже.' };
  const byIp = await checkRateLimitAsync(`school:create:ip:${ip}`, 10, 3_600_000);
  if (!byIp.ok) return { error: 'Слишком много запросов с этого адреса. Попробуйте позже.' };

  try {
    const data = {
      name: String(formData.get('name') ?? ''),
      code: String(formData.get('code') ?? ''),
      region: String(formData.get('region') ?? ''),
      city: String(formData.get('city') ?? ''),
      academic_year: String(formData.get('academic_year') ?? ''),
      settings: {
        language: String(formData.get('language') ?? '') || 'ru',
        shifts: Number(formData.get('shifts')),
        grading_system: String(formData.get('grading_system') ?? '')
      }
    };

    const parseResult = createSchoolSchema.safeParse(data);
    if (!parseResult.success) {
      return { error: 'Проверьте название, код, регион и город' };
    }

    const schoolId = await createSchool(parseResult.data, user.id, user.fullName || user.email);
    return { id: schoolId };
  } catch (error) {
    // Определяем дубль кода по коду драйвера, а не по подстроке в тексте:
    // текст ошибки может измениться при обновлении драйвера, и тогда
    // дубликат кода молча превратился бы в «Не удалось создать школу».
    if (error instanceof Error && (error as { code?: number }).code === 11000) {
      return { error: 'Этот код школы уже занят' };
    }
    log.error('createSchool failed', {
      userId: user.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Не удалось создать школу' };
  }
}

/**
 * Код школы — единственный секрет, отделяющий «свой» от «чужой» тенанта.
 * Раньше его можно было перебирать без ограничений, а проверка длины в
 * схеме допускала 3 символа: любой залогиненный учитель получал роль
 * `teacher` в чужой школе вместе с персональными данными её учеников.
 */
const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "Код школы слишком короткий")
    .max(32, "Код школы слишком длинный")
    .regex(/^[A-Za-z0-9-]+$/, "Код школы содержит недопустимые символы"),
});

export async function joinSchoolAction(code: string): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = joinSchema.safeParse(code);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Некорректный код школы' };

  const ip = await clientIp();
  // Два независимых лимита: по аккаунту и по IP. Без IP-лимита один
  // злоумышленник с десятком аккаунтов обходил бы лимит по user_id.
  const byUser = await checkRateLimitAsync(`school:join:user:${user.id}`, 5, 3_600_000);
  if (!byUser.ok) return { error: 'Слишком много попыток. Попробуйте позже.' };
  const byIp = await checkRateLimitAsync(`school:join:ip:${ip}`, 20, 3_600_000);
  if (!byIp.ok) return { error: 'Слишком много попыток с этого адреса. Попробуйте позже.' };

  try {
    const db = await getDb();
    const school = await db
      .collection(COL.schools)
      .findOne({ code: { $regex: `^${parsed.data.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });

    // Одинаковый ответ для «нет такого кода» и «нет такого пользователя»,
    // чтобы по времени/тексту нельзя было перебирать существующие коды.
    if (!school) {
      return { error: 'Школа с таким кодом не найдена или код введён неверно' };
    }

    const member = await db.collection(COL.schoolMembers).findOne({
      school_id: school._id,
      user_id: user.id,
    });
    if (member) return { error: 'Вы уже состоите в этой школе' };

    await addSchoolMember(school._id.toString(), {
      user_id: user.id,
      role: 'teacher',
      full_name: user.fullName || user.email,
    });

    return { ok: true };
  } catch (error) {
    log.error('joinSchool failed', {
      userId: user.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    // Наружу — нейтральный текст: сообщения Mongo раскрывали бы структуру БД.
    return { error: 'Не удалось присоединиться к школе' };
  }
}
