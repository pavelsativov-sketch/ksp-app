import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { executeWithFallback, getResponseFormat, isAnyProviderConfigured } from "@/lib/ai/providers";
import { OPENAI_JSON_SCHEMA, type AiKspPayload } from "@/lib/ai/prompt";
import { normalizeTextFields } from "@/lib/ai/generate";
import { extractJson } from "@/lib/ai/extract-json";
import { kspContentSchema } from "@/lib/validation/ksp";
import { localObjectives, localTupObjectives } from "@/lib/goso/local";
import { isMongoConfigured } from "@/lib/mongo";
import { findObjectives, getSubjectByName } from "@/lib/plans-repo";

export const runtime = "nodejs";
export const maxDuration = 90;

const translateSchema = z.object({
  targetLanguage: z.enum(["ru", "kz"]),
  grade: z.coerce.number().int().min(1).max(11),
  subject: z.string().trim().min(1).max(200),
  title: z.string().max(500).optional(),
  section: z.string().max(500).optional(),
  content: z.object({
    topic: z.string().min(1).max(500),
    stages: z.any().optional(),
    lessonObjectives: z.any().optional(),
    evaluation: z.any().optional(),
  }),
});

/**
 * Подбирает официальные формулировки целей обучения ГОСО РК по их коду (напр. 7.1.2.1),
 * чтобы при зеркальном переводе КСП ↔ ҚМЖ не переводить коды целей машинно.
 */
async function resolveOfficialObjectivesByCode(opts: {
  subject: string;
  grade: number;
  targetLanguage: "ru" | "kz";
  objectives: Array<{ code: string; text: string }>;
}): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const codes = opts.objectives.map((o) => o.code.trim()).filter(Boolean);
  if (codes.length === 0) return map;

  // 1. Локальный справочник ГОСО и ТУП (для русского языка всегда полон)
  if (opts.targetLanguage === "ru") {
    const tup = localTupObjectives({ subject: opts.subject, grade: opts.grade }) ?? [];
    for (const o of tup) {
      if (codes.includes(o.code) && o.text_ru) map.set(o.code, o.text_ru);
    }
    const loc = localObjectives({ subject: opts.subject, grade: opts.grade, limit: 1000 });
    for (const o of loc) {
      if (codes.includes(o.code) && o.text_ru && !map.has(o.code)) {
        map.set(o.code, o.text_ru);
      }
    }
  }

  // 2. Проверяем MongoDB (там могут быть и text_kz, и text_ru)
  if (isMongoConfigured()) {
    try {
      const subj = await getSubjectByName(opts.subject);
      if (subj) {
        const dbRows = await findObjectives({ subjectId: subj.id, grade: opts.grade, limit: 1000 });
        for (const row of dbRows) {
          if (!codes.includes(row.code)) continue;
          const text = opts.targetLanguage === "kz" ? row.text_kz : row.text_ru;
          if (text && text.trim()) {
            map.set(row.code, text.trim());
          }
        }
      }
    } catch {
      // Игнорируем ошибку БД — переведём оставшиеся через ИИ с сохранением кода
    }
  }

  return map;
}

/**
 * POST /api/ai/translate-ksp — зеркальный перевод готового плана урока
 * между русским (КСП) и казахским (ҚМЖ) языками с сохранением кодов ГОСО,
 * структуры всех интерактивных заданий и 10-балльной шкалы дескрипторов.
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`translate:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Превышен лимит запросов перевода. Попробуйте позже." },
      { status: 429 },
    );
  }

  if (!isAnyProviderConfigured()) {
    return NextResponse.json(
      { error: "Не настроен ни один AI-провайдер для перевода КСП." },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = translateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const { targetLanguage, grade, subject, title, section, content } = parsed.data;
  const rawObjectives = Array.isArray(content.learningObjectives)
    ? (content.learningObjectives as Array<{ code?: string; text?: string }>).map((o) => ({
        code: String(o?.code ?? "").trim(),
        text: String(o?.text ?? "").trim(),
      }))
    : [];

  const officialMap = await resolveOfficialObjectivesByCode({
    subject,
    grade,
    targetLanguage,
    objectives: rawObjectives,
  });

  const targetLangLabel =
    targetLanguage === "kz"
      ? "казахский язык (ҚМЖ — қысқа мерзімді жоспар, сауатты педагогикалық қазақ тілінде)"
      : "русский язык (КСП — краткосрочный план урока по стандарту ГОСО РК)";

  const systemPrompt =
    targetLanguage === "kz"
      ? `Сен Қазақстан Республикасының білім беру стандарты бойынша тәжірибелі әдіскер-аудармашысың.
Берілген сабақ жоспарын (КСП) орыс тілінен табиғи, сауатты педагогикалық ҚАЗАҚ ТІЛІНЕ (ҚМЖ) толық аудар.
ҚАТАҢ ЕРЕЖЕЛЕР:
1. JSON құрылымын, барлық кілттерді, тапсырма түрлерін (MCQ, TRUE_FALSE, SHORT_ANSWER, FILL_BLANK, MATCHING, NUMERIC, ORDERING), балл сандарын (points), correctIndex, correct, pairs, correctOrder, answer және objectiveCode мәндерін ДӘЛ СОЛ КҮЙІНДЕ сақта!
2. "Мұғалім сөзі:" ("Слова педагога:") және "Оқушылардың болжамды жауаптары:" ("Предполагаемые ответы учащихся:") репликаларын толық, қысқартпай қазақшаға аудар.
3. Уақыт белгілерін ("1–10 мин", "11–35 мин", "36–45 мин") және бағалау әдістерін ("Мадақтау", "ҚБ", "Өзара бағалау", "Өзін-өзі бағалау") қазақша стандартқа сай жаз.
4. FILL_BLANK тапсырмасындағы "___" санын өзгертпе.`
      : `Ты опытный методист-переводчик системы образования Республики Казахстан.
Переведи данный план урока (ҚМЖ) с казахского языка на грамотный педагогический РУССКИЙ ЯЗЫК (КСП).
СТРОГИЕ ПРАВИЛА:
1. Сохрани в точности всю JSON-структуру, типы интерактивных заданий (MCQ, TRUE_FALSE, SHORT_ANSWER, FILL_BLANK, MATCHING, NUMERIC, ORDERING), баллы (points), индексы ответов (correctIndex, correct, pairs, correctOrder, answer) и коды целей обучения (objectiveCode)!
2. Полностью, без сокращений переведи реплики педагога («Слова педагога:») и ответы учеников («Предполагаемые ответы учащихся:»).
3. В FILL_BLANK сохрани точное количество пропусков «___».`;

  try {
    const translatedBody = await executeWithFallback("generation", async (client, model, config) => {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.3,
        max_completion_tokens: config.maxTokens ?? 8192,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Переведи этот план урока (${grade} класс, предмет «${subject}») на ${targetLangLabel}.\n\nИсходный JSON плана:\n${JSON.stringify(
              {
                topic: content.topic,
                lessonObjectives: content.lessonObjectives,
                assessmentCriteria: content.assessmentCriteria,
                languageObjectives: content.languageObjectives,
                values: content.values,
                crossCurricularLinks: content.crossCurricularLinks,
                priorKnowledge: content.priorKnowledge,
                stages: content.stages,
                evaluation: content.evaluation,
              },
              null,
              2,
            )}\n\nВерни строго JSON по схеме ksp_content.`,
          },
        ],
        response_format: getResponseFormat(config, OPENAI_JSON_SCHEMA),
      });

      const raw = response.choices[0]?.message?.content;
      if (!raw || !raw.trim()) throw new Error("AI вернул пустой ответ при переводе");
      const extracted = extractJson<AiKspPayload>(raw);
      const normalized = normalizeTextFields({
        header: content.header ?? {
          longTermPlanSection: "",
          school: "",
          date: "",
          teacherName: "",
          grade: "",
          studentsPresent: null,
          studentsAbsent: null,
        },
        learningObjectives: rawObjectives,
        ...extracted,
        evaluation: extracted.evaluation ?? {
          formativeAssessment: "",
          differentiation: "",
          healthAndSafety: "",
          reflection: "",
        },
      });
      for (const stageKey of ["beginning", "middle", "end"] as const) {
        const stageObj = normalized.stages?.[stageKey];
        if (stageObj && Array.isArray(stageObj.tasks)) {
          stageObj.tasks = stageObj.tasks.map((t, idx) => ({
            ...t,
            id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `task-${stageKey}-${idx + 1}`,
          }));
        }
      }
      const checked = kspContentSchema.safeParse(normalized);
      if (!checked.success) {
        throw new Error(
          `Ошибка проверки переведённого КСП: ${checked.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .slice(0, 3)
            .join("; ")}`,
        );
      }
      return checked.data;
    });

    // Переводим цели обучения, для которых не нашлось готовой строки в локальном справочнике ГОСО,
    // а также заголовок плана и название раздела КТП одним лёгким вызовом.
    const unmappedObjectives = rawObjectives.filter((o) => !officialMap.has(o.code));
    let translatedMeta = {
      title: title ?? "",
      section: section ?? "",
      objectives: unmappedObjectives,
    };

    if (unmappedObjectives.length > 0 || (title && title.trim()) || (section && section.trim())) {
      try {
        translatedMeta = await executeWithFallback("enhance", async (client, model) => {
          const resp = await client.chat.completions.create({
            model,
            temperature: 0.2,
            max_completion_tokens: 1500,
            messages: [
              {
                role: "system",
                content:
                  targetLanguage === "kz"
                    ? "Аудармашы-әдіскер: берілген тақырыпты, бөлімді және оқу мақсаттарының мәтінін ресми ГОСО РК стилінде қазақ тіліне аудар. Кодтарды (code) өзгертпе. Тек JSON қайтар."
                    : "Методист-переводчик: переведи название плана, раздел и формулировки целей обучения на русский язык в официальном стиле ГОСО РК. Коды (code) не меняй. Верни только JSON.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  title: title || translatedBody.topic,
                  section: section || "",
                  objectives: unmappedObjectives,
                }),
              },
            ],
          });
          const rawMeta = resp.choices[0]?.message?.content ?? "";
          const parsedMeta = extractJson<{
            title?: string;
            section?: string;
            objectives?: Array<{ code: string; text: string }>;
          }>(rawMeta);
          return {
            title: parsedMeta.title?.trim() || translatedBody.topic || title || "",
            section: parsedMeta.section?.trim() ?? section ?? "",
            objectives: Array.isArray(parsedMeta.objectives) ? parsedMeta.objectives : unmappedObjectives,
          };
        });
      } catch {
        translatedMeta = {
          title: translatedBody.topic || title || "",
          section: section ?? "",
          objectives: unmappedObjectives,
        };
      }
    }

    const aiObjMap = new Map(
      translatedMeta.objectives.map((o) => [String(o.code ?? "").trim(), String(o.text ?? "").trim()]),
    );

    const finalObjectives = rawObjectives.map((o) => ({
      code: o.code,
      text: officialMap.get(o.code) || aiObjMap.get(o.code) || o.text,
    }));

    return NextResponse.json({
      language: targetLanguage,
      title: translatedMeta.title || translatedBody.topic,
      section: translatedMeta.section,
      content: {
        ...translatedBody,
        learningObjectives: finalObjectives,
      },
    });
  } catch (e) {
    console.error("translate-ksp failed:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Не удалось выполнить зеркальный перевод плана. Попробуйте ещё раз.",
      },
      { status: 503 },
    );
  }
}
