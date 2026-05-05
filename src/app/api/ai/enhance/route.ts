import { NextResponse } from "next/server";
import { z } from "zod";
import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { guardAiRoute } from "@/lib/server/ai-guard";
import { elapsedMs, logError, logEvent } from "@/lib/server/log";

const bodySchema = z.object({
  section: z.enum([
    "lessonObjectives",
    "assessmentCriteria",
    "languageObjectivesTerms",
    "languageObjectivesPhrases",
    "values",
    "priorKnowledge",
    "healthAndSafety",
    "reflection",
    "differentiation",
  ]),
  current: z.union([z.string(), z.array(z.string())]),
  context: z
    .object({
      topic: z.string().optional(),
      subject: z.string().optional(),
      grade: z.coerce.number().int().optional(),
      language: z.enum(["ru", "kz"]).default("ru"),
    })
    .partial()
    .default({}),
});

type Section = z.infer<typeof bodySchema>["section"];

export const runtime = "nodejs";

export async function POST(request: Request) {
  const started = Date.now();
  const guard = await guardAiRoute("ai/enhance");
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const { section, current, context } = parsed.data;
  const isList = Array.isArray(current);

  if (!isAiConfigured()) {
    return NextResponse.json({
      improved: fallbackImprove(section, current, context),
      isList,
      stub: true,
      note:
        "AI-улучшение в демо-режиме (не задан GEMINI_API_KEY или OPENAI_API_KEY).",
    });
  }

  try {
    const improved = await callAi(section, current, context);
    logEvent("ai.enhance.ok", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      section,
      isList,
    });
    return NextResponse.json({ improved, isList, stub: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    logError("ai.enhance.error", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      section,
      errorMessage: msg,
    });
    return NextResponse.json(
      {
        improved: fallbackImprove(section, current, context),
        isList,
        stub: true,
        note: msg,
      },
      { status: 200 },
    );
  }
}

function fallbackImprove(
  section: Section,
  current: string | string[],
  ctx: { topic?: string; subject?: string; grade?: number; language?: "ru" | "kz" },
): string | string[] {
  const topic = ctx.topic || "темы урока";
  switch (section) {
    case "lessonObjectives":
      return mergeList(current, [
        `Учащиеся смогут объяснить основные понятия по теме «${topic}»`,
        `Учащиеся применят изученный материал при решении практических задач`,
        `Учащиеся проведут самооценку по предложенным критериям`,
      ]);
    case "assessmentCriteria":
      return mergeList(current, [
        "Использует корректную терминологию",
        "Аргументирует свой выбор / решение",
        "Выполняет задание согласно инструкции",
      ]);
    case "languageObjectivesTerms":
      return mergeList(current, [
        "Ключевые термины темы",
        "Академическая лексика урока",
      ]);
    case "languageObjectivesPhrases":
      return mergeList(current, [
        "Я считаю, что …, потому что …",
        "Сравнивая …, можно сделать вывод, что …",
        "Мое решение основано на …",
      ]);
    case "values":
      return appendText(
        current,
        "Уважение к мнению одноклассников, ответственность за учебный результат, академическая честность.",
      );
    case "priorKnowledge":
      return appendText(
        current,
        `Учащиеся знакомы с базовыми понятиями, предшествующими теме «${topic}».`,
      );
    case "healthAndSafety":
      return appendText(
        current,
        "Проводится физкультминутка в середине урока; соблюдение норм освещения, осанки и работы с ИКТ.",
      );
    case "reflection":
      return appendText(
        current,
        "Проанализировать, какие приёмы сработали, какие цели достигнуты и что скорректировать в следующем уроке.",
      );
    case "differentiation":
      return appendText(
        current,
        "Поддержка: карточки-опоры для менее способных. Вызов: задания повышенной сложности / кейс для более способных.",
      );
  }
}

function mergeList(current: string | string[], extras: string[]): string[] {
  const items = Array.isArray(current) ? current : current.split("\n").filter((x) => x.trim());
  const set = new Set(items.map((x) => x.trim().toLowerCase()));
  for (const x of extras) {
    if (!set.has(x.trim().toLowerCase())) items.push(x);
  }
  return items;
}

function appendText(current: string | string[], extra: string): string {
  const cur = Array.isArray(current) ? current.join("\n") : current;
  const trimmed = (cur || "").trim();
  if (!trimmed) return extra;
  if (trimmed.toLowerCase().includes(extra.slice(0, 24).toLowerCase())) return trimmed;
  return `${trimmed}\n\n${extra}`;
}

async function callAi(
  section: Section,
  current: string | string[],
  ctx: { topic?: string; subject?: string; grade?: number; language?: "ru" | "kz" },
): Promise<string | string[]> {
  const isList = Array.isArray(current);
  const sectionLabel: Record<Section, string> = {
    lessonObjectives: "Цели урока (SMART)",
    assessmentCriteria: "Критерии оценивания",
    languageObjectivesTerms: "Языковые цели — термины",
    languageObjectivesPhrases: "Языковые цели — ключевые фразы",
    values: "Привитие ценностей",
    priorKnowledge: "Предшествующие знания",
    healthAndSafety: "Здоровье и ТБ",
    reflection: "Рефлексия учителя",
    differentiation: "Дифференциация",
  };

  const system = `Ты методист, помогающий учителю казахстанской школы. Улучшай только запрошенный раздел КСП: делай формулировки конкретнее, измеримее, с опорой на тему и возраст.`;
  const user = `Раздел: ${sectionLabel[section]}
Предмет: ${ctx.subject || "—"}
Класс: ${ctx.grade ?? "—"}
Тема: ${ctx.topic || "—"}
Язык ответа: ${ctx.language === "kz" ? "казахский" : "русский"}

Текущее содержание:
${Array.isArray(current) ? current.map((x, i) => `${i + 1}. ${x}`).join("\n") : current || "(пусто)"}

Верни улучшенную версию в виде JSON: ${
    isList
      ? '{ "items": ["…", "…"] }'
      : '{ "text": "…" }'
  }.`;

  const schema: Record<string, unknown> = isList
    ? {
        type: "object",
        required: ["items"],
        properties: {
          items: { type: "array", items: { type: "string" } },
        },
      }
    : {
        type: "object",
        required: ["text"],
        properties: { text: { type: "string" } },
      };

  const parsed = await completeJson<{ items?: string[]; text?: string }>({
    system,
    user,
    schema,
    schemaName: isList ? "enhanced_list" : "enhanced_text",
    temperature: 0.6,
  });
  if (isList) {
    return Array.isArray(parsed.items)
      ? parsed.items.filter((x) => typeof x === "string")
      : [];
  }
  return typeof parsed.text === "string" ? parsed.text.trim() : "";
}
