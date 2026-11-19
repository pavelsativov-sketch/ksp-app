/**
 * Серверное обогащение целей обучения ГОСО казахскими формулировками (kk)
 * с постоянным кэшем в MongoDB (`COL.gosoTranslations`).
 *
 * Если цели уже переведены в MongoDB, ответ мгновенный без ИИ-запросов.
 * Недостающие формулировки (до 40 за раз) переводятся в официальном
 * педагогическом стиле МП РК и сохраняются в кэш для всех учителей.
 */

import { COL, getDb, isMongoConfigured } from "@/lib/mongo";
import { executeWithFallback } from "@/lib/ai/providers";
import { extractJson } from "@/lib/ai/extract-json";
import type { LocalObjective } from "./local";
import { localizeSectionKz, resolveRussianSubjectName, subjectNameKz } from "./kazakh";

const MAX_TRANSLATE_BATCH = 40;

interface TranslationDoc {
  subject: string;
  code: string;
  text_kz: string;
  updated_at: Date;
}

export async function enrichObjectivesWithKazakh(
  objectives: LocalObjective[],
  subjectInput: string,
): Promise<LocalObjective[]> {
  if (objectives.length === 0) return objectives;
  const canonicalSubject = resolveRussianSubjectName(subjectInput) ?? subjectInput.trim();
  const cachedMap = new Map<string, string>();
  const codes = [...new Set(objectives.map((o) => o.code))];

  if (isMongoConfigured()) {
    try {
      const db = await getDb();
      const rows = await db
        .collection<TranslationDoc>(COL.gosoTranslations)
        .find({ subject: canonicalSubject, code: { $in: codes } })
        .project<{ code: string; text_kz: string }>({ code: 1, text_kz: 1, _id: 0 })
        .toArray();
      for (const row of rows) {
        if (row.code && row.text_kz) cachedMap.set(row.code, row.text_kz);
      }
    } catch {
      // Mongo может быть временно недоступна — возвращаем цели без падения.
    }
  }

  const missing = objectives
    .filter((o) => !o.text_kz && !cachedMap.has(o.code))
    .slice(0, MAX_TRANSLATE_BATCH);

  const isTestEnv = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
  if (missing.length > 0 && !isTestEnv) {
    try {
      const subjectKz = subjectNameKz(canonicalSubject);
      const payload = missing.map((o) => ({ code: o.code, text_ru: o.text_ru }));
      const raw = await executeWithFallback(
        "enhance",
        async (client, model, config, signal) => {
          const completion = await client.chat.completions.create(
            {
              model,
              temperature: 0.15,
              max_tokens: Math.min(3500, Math.max(1000, missing.length * 80)),
              messages: [
                {
                  role: "system",
                  content:
                    "Сен ҚР Оқу-ағарту министрлігінің МЖМБС (ГОСО) және үлгілік оқу бағдарламалары (ТОБ) бойынша сарапшы аудармашысың. Берілген оқу мақсаттарын ресми қазақ педагогикалық тіліне дәл аудар. Тек JSON қайтар: {\"translations\":{\"код\":\"қазақша мәтін\"}}.",
                },
                {
                  role: "user",
                  content: `Пән: ${subjectKz} (${canonicalSubject}). Мына оқу мақсаттарын қазақ тіліне аударып, дәл сол кодтармен JSON қайтар:\n${JSON.stringify(payload)}`,
                },
              ],
              ...(config.supportsJsonSchema ? { response_format: { type: "json_object" as const } } : {}),
            },
            signal ? { signal } : undefined,
          );
          return completion.choices[0]?.message?.content ?? "";
        },
        { budgetMs: 12_000, timeoutMs: 10_000 },
      );

      const parsed = extractJson<{ translations?: Record<string, unknown> }>(raw);
      const translations = parsed?.translations ?? {};
      const ops: Array<{
        updateOne: {
          filter: { subject: string; code: string };
          update: { $set: TranslationDoc };
          upsert: true;
        };
      }> = [];
      const now = new Date();
      for (const item of missing) {
        const translated = translations[item.code];
        if (typeof translated === "string" && translated.trim().length > 2) {
          const clean = translated.trim();
          cachedMap.set(item.code, clean);
          ops.push({
            updateOne: {
              filter: { subject: canonicalSubject, code: item.code },
              update: {
                $set: {
                  subject: canonicalSubject,
                  code: item.code,
                  text_kz: clean,
                  updated_at: now,
                },
              },
              upsert: true,
            },
          });
        }
      }
      if (ops.length > 0 && isMongoConfigured()) {
        const db = await getDb();
        await db.collection<TranslationDoc>(COL.gosoTranslations).bulkWrite(ops, { ordered: false }).catch(() => {});
      }
    } catch {
      // При сбое ИИ отдаём хотя бы кэшированные переводы и исходные формулировки.
    }
  }

  return objectives.map((o) => ({
    ...o,
    text_kz: o.text_kz || cachedMap.get(o.code) || null,
    section: localizeSectionKz(o.section),
  }));
}
