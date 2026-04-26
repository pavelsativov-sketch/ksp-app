import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

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
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      improved: fallbackImprove(section, current, context),
      isList,
      stub: true,
      note:
        "AI-улучшение в демо-режиме (OPENAI_API_KEY не задан). Добавьте ключ в .env для реальной AI-обработки.",
    });
  }

  try {
    const improved = await callOpenAi(section, current, context, apiKey);
    return NextResponse.json({ improved, isList, stub: false });
  } catch (e) {
    return NextResponse.json(
      {
        improved: fallbackImprove(section, current, context),
        isList,
        stub: true,
        note: e instanceof Error ? e.message : "AI error, показан демо-результат",
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

async function callOpenAi(
  section: Section,
  current: string | string[],
  ctx: { topic?: string; subject?: string; grade?: number; language?: "ru" | "kz" },
  apiKey: string,
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

  const system = `Ты методист, помогающий учителю казахстанской школы. Улучшай только запрошенный раздел КСП: делай формулировки конкретнее, измеримее, с опорой на тему и возраст. Отвечай ${
    isList ? "JSON-массивом строк" : "текстом (без markdown-списков)"
  } без пояснений.`;
  const user = `Раздел: ${sectionLabel[section]}
Предмет: ${ctx.subject || "—"}
Класс: ${ctx.grade ?? "—"}
Тема: ${ctx.topic || "—"}
Язык ответа: ${ctx.language === "kz" ? "казахский" : "русский"}

Текущее содержание:
${Array.isArray(current) ? current.map((x, i) => `${i + 1}. ${x}`).join("\n") : current || "(пусто)"}

Верни улучшенную версию ${isList ? "массивом JSON" : "одной строкой"}.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      response_format: isList ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: isList ? `${user}\n\nФормат: {"items": ["…", "…"]}` : user,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!isList) return raw;
  try {
    const parsed = JSON.parse(raw) as { items?: string[] };
    if (Array.isArray(parsed.items)) return parsed.items.filter((x) => typeof x === "string");
  } catch {
    // fall through
  }
  return raw
    .split("\n")
    .map((l) => l.replace(/^[\s•\-\d.)]+/, "").trim())
    .filter(Boolean);
}
