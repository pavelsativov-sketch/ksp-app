/**
 * AI critique of a КСП.
 *
 * Sends the current plan content to the AI (Gemini → OpenAI fallback)
 * and asks it to return a structured array of issues. Each issue points to
 * a specific section of the plan (`section` matches a top-level / nested
 * field name in `KspContent`), classifies the severity, and optionally
 * proposes a concrete fix.
 *
 * The prompt is opinionated — it tries to apply the same standards Kazakh
 * methodologists check against (SMART objectives, stage-to-stage links,
 * differentiation for SEN + gifted, age-appropriate language, presence of
 * the 1–10 rubric, balance of task types, etc.).
 */
import type { KspContent } from "@/lib/types/ksp";
import { completeJson } from "./client";

export type CritiqueSeverity = "info" | "warn" | "error";

export interface CritiqueIssue {
  /** Where the issue lives in the plan: e.g. "topic", "stages.middle", "evaluation.differentiation". */
  section: string;
  severity: CritiqueSeverity;
  /** Short, plain-language description of the problem. */
  message: string;
  /** Optional concrete suggestion the teacher can apply. */
  suggestion?: string;
}

export interface CritiqueResult {
  issues: CritiqueIssue[];
  /** One-sentence overall verdict, shown above the list. */
  summary: string;
}

const SCHEMA = {
  type: "object",
  required: ["issues", "summary"],
  properties: {
    summary: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["section", "severity", "message"],
        properties: {
          section: { type: "string" },
          severity: { type: "string", enum: ["info", "warn", "error"] },
          message: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM_RU = `Ты — методист, который проверяет КСП учителя по стандарту обновлённого содержания РК.
Твоя задача — найти конкретные слабые места и вернуть СТРУКТУРИРОВАННЫЙ список замечаний (массив issues).

Что проверять:
1. Цели урока (lessonObjectives) — должны быть SMART (наблюдаемые, проверяемые: «Учащиеся смогут …»). Если расплывчатые — error.
2. Связки этапов (stages.beginning → middle → end) — каждый следующий этап должен ОПИРАТЬСЯ на предыдущий. Если этапы изолированы — warn.
3. Дескрипторы (descriptors) на этапах — короткие проверяемые критерии («Записывает …», «Объясняет …»). Если их нет в середине — warn.
4. Дифференциация (evaluation.differentiation) — должны быть И поддержка для слабых учеников, И вызов для сильных. Только одно — warn. Ничего — error.
5. Здоровье и ТБ (evaluation.healthAndSafety) — обязательно для предметов с риском (ИКТ, физкультура, химия). Если пусто — warn.
6. Общий дескриптор 1–10 (overallRubric) — если отсутствует или меньше 10 строк — warn.
7. Шкала оценивания (pointsScale) — сумма баллов должна быть 10. Если не 10 — error.
8. Возрастная адекватность языка — слишком сложные слова для 5 класса или слишком простые для 11 — warn.
9. Баланс заданий по типам — если у этапов tasks все одного типа (только MCQ) — info.
10. Рефлексия учителя (evaluation.reflection) — должны быть конкретные вопросы себе. Если общие фразы — info.
11. Ключевые вопросы (stages.*.keyQuestions) — должны быть открытыми, провоцирующими мышление. Если их нет в начале урока — warn.
12. Языковые цели (languageObjectives) — для предметных уроков должны быть термины + фразы. Если пусто — info.

Возвращай:
- summary: одно предложение, общая оценка плана («План соответствует требованиям, но …» / «Есть критичные проблемы: …»)
- issues: массив. Если всё хорошо — пустой массив, summary хвалит план. Никогда не возвращай больше 12 issues — выбирай самые важные.

Поле section — точный путь к проблемному месту: "topic" / "lessonObjectives" / "stages.middle" / "stages.middle.descriptors" / "evaluation.differentiation" / "overallRubric" и т.п.

Возвращай СТРОГО JSON по схеме. Без преамбул.`;

const SYSTEM_KZ = `Сен — әдіскерсің, мұғалімнің ҚМЖ-сын Қазақстанның жаңартылған білім мазмұны стандартына сай тексересің.
Сенің міндетің — нақты әлсіз жерлерді табу және СТРУКТУРАЛЫҚ ескертулер тізімін қайтару (issues массиві).

Не тексерілуі керек:
1. Сабақ мақсаттары SMART болуы тиіс — нақты, бағаланатын. Бұлдыр болса — error.
2. Сабақ кезеңдерінің байланысы — әр кезең алдыңғыға СҮЙЕНУ керек. Оқшауланса — warn.
3. Әр кезеңнің дескрипторлары — қысқа, тексерілетін. Жоқ болса — warn.
4. Сараланған тапсырмалар (differentiation) — әлсіз оқушыға қолдау + күшті оқушыға күрделі тапсырма болуы керек. Біреуі ғана — warn. Мүлдем жоқ — error.
5. Денсаулық пен ҚТ — қажет жерде болуы керек. Жоқ болса — warn.
6. 1–10 жалпы дескриптор — болмаса немесе 10-нан аз — warn.
7. Балл шкаласы — қосындысы 10 болуы тиіс. 10 емес — error.
8. Жасқа сай тіл — тым күрделі сөздер немесе тым жеңіл — warn.
9. Тапсырмалар әртүрлі типте болуы керек — бәрі бір типте — info.
10. Мұғалім рефлексиясы — нақты сұрақтар. Жалпы сөздер — info.
11. Кілт сұрақтар — ашық, ойлантатын. Басталу кезеңінде жоқ — warn.
12. Тілдік мақсаттар — пәндік сабақтарда терминдер + фразалар. Жоқ — info.

Қайтаратын:
- summary: бір сөйлем — жалпы баға.
- issues: массив. Бәрі жақсы болса — бос массив. 12-ден көп қайтарма.

section өрісі — нақты жол: "topic" / "lessonObjectives" / "stages.middle" / "evaluation.differentiation" және т.б.

JSON форматында ғана қайтар, кіріспесіз.`;

export async function critiquePlan(
  content: KspContent,
  language: "ru" | "kz" = "ru",
): Promise<CritiqueResult> {
  const system = language === "kz" ? SYSTEM_KZ : SYSTEM_RU;
  const userText =
    language === "kz"
      ? `Тексеретін ҚМЖ (JSON):\n${JSON.stringify(content, null, 2)}`
      : `КСП для проверки (JSON):\n${JSON.stringify(content, null, 2)}`;
  const result = await completeJson<CritiqueResult>({
    system,
    user: userText,
    schema: SCHEMA,
    schemaName: "ksp_critique",
    temperature: 0.3,
    timeoutMs: 60_000,
    maxRetries: 1,
    geminiModel: "gemini-2.5-flash",
  });
  // Defensive: clamp to 12 issues if the model goes overboard.
  return {
    summary: result.summary || "",
    issues: (result.issues ?? []).slice(0, 12),
  };
}
