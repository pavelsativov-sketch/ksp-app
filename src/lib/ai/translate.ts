/**
 * AI translation of an entire КСП between RU ↔ KZ.
 *
 * The plan is sent as JSON; the AI is asked to translate **only the natural
 * language fields** (topic, lessonObjectives, descriptors, teacherActions,
 * etc.) while leaving structural fields (codes, ids, numbers, enum values
 * like task `type`) untouched. The output is then validated against
 * `kspContentSchema` so any drift is caught before it reaches the editor.
 */
import type { KspContent } from "@/lib/types/ksp";
import { kspContentSchema } from "@/lib/validation/ksp";
import { completeJson } from "./client";

const SYSTEM_TO_KZ = `Сен — қазақ тіліне аударатын кәсіби педагогикалық аудармашысың. Кіріс — КСП (короткосрочный план урока) JSON форматында, орыс тілінде. Шығыс — сол JSON, бірақ табиғи тілдегі мәтіндер қазақ тіліне аударылған.

ҚАТАҢ ЕРЕЖЕЛЕР:
1. Тек мәтіндік мазмұнды аудар — header.school, header.teacherName, topic, lessonObjectives, assessmentCriteria, descriptors, teacherActions, studentActions, resources, summary, homework, keyQuestions, reflectionQuestions, language objectives terms+phrases, values, priorKnowledge, evaluation барлық өрістері, learningObjectives.text, pointsScale.label, overallRubric.descriptor.
2. Аудармаға тиіспе:
   - learningObjectives[].code (мысалы "7.1.2.1")
   - tasks[].id, tasks[].type, tasks[].correctIndex, tasks[].correct, tasks[].points, tasks[].correctOrder, tasks[].pairs, tasks[].leftIndex, tasks[].rightIndex
   - сандар (studentsPresent, points, time)
   - күн (header.date)
3. КСП құрылымы дәл сондай қалуы тиіс — өрістерді алып тастама, қоспа, ретін өзгертпе.
4. Жауап толық JSON болуы тиіс, мәтін қоспа, JSON ғана.`;

const SYSTEM_TO_RU = `Ты — профессиональный педагогический переводчик с казахского на русский. На входе — КСП (краткосрочный план урока) в JSON-формате на казахском. На выходе — тот же JSON, но текстовые поля переведены на русский.

СТРОГИЕ ПРАВИЛА:
1. Переводи только текстовое содержимое — header.school, header.teacherName, topic, lessonObjectives, assessmentCriteria, descriptors, teacherActions, studentActions, resources, summary, homework, keyQuestions, reflectionQuestions, languageObjectives terms+phrases, values, priorKnowledge, все поля evaluation, learningObjectives.text, pointsScale.label, overallRubric.descriptor.
2. НЕ ТРОГАЙ:
   - learningObjectives[].code (например "7.1.2.1")
   - tasks[].id, tasks[].type, tasks[].correctIndex, tasks[].correct, tasks[].points, tasks[].correctOrder, tasks[].pairs, tasks[].leftIndex, tasks[].rightIndex
   - числа (studentsPresent, points, time)
   - даты (header.date)
3. Структура КСП должна быть в точности такой же — не убирай и не добавляй поля, не меняй их порядок.
4. Возвращай только полный JSON, без преамбулы.`;

export async function translatePlan(
  content: KspContent,
  targetLanguage: "ru" | "kz",
): Promise<KspContent> {
  const system = targetLanguage === "kz" ? SYSTEM_TO_KZ : SYSTEM_TO_RU;
  const user = JSON.stringify(content);
  // We don't pass a strict responseSchema here — the schema is huge (KspContent
  // has 7 task variants × all stage fields × evaluation × header). Validation
  // happens after the call. The AI is told to return the same shape.
  const raw = await completeJson<unknown>({
    system,
    user,
    schema: { type: "object" },
    schemaName: "ksp_translation",
    temperature: 0.2,
    timeoutMs: 90_000,
    maxRetries: 1,
    geminiModel: "gemini-2.5-flash",
  });
  const parsed = kspContentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Перевод не прошёл валидацию: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data as KspContent;
}
