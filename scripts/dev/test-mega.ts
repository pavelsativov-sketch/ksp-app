/**
 * Мега-тест: прогоняем генерацию КСП на ВСЕХ моделях ВСЕХ провайдеров.
 * Оцениваем: скорость, объём текста, качество JSON, полноту полей.
 */
import "dotenv/config";
import OpenAI from "openai";

const SYSTEM_PROMPT = `Ты помощник для учителей Казахстана, который составляет КСП (краткосрочный план урока) по стандарту обновлённого содержания образования РК.
КЛЮЧЕВОЕ ТРЕБОВАНИЕ: между этапами должна быть ЯВНАЯ ЛОГИЧЕСКАЯ СВЯЗЬ.
- Начало: организационный момент → кумулятивная беседа → формулировка темы и целей урока.
- Середина: объяснение нового → практика (задания, парная/групповая работа).
- Конец: итог урока → рефлексия → домашнее задание.
Отвечай строго в JSON.`;

const USER_PROMPT = `Составь КСП на русском языке для следующего урока:
- Класс: 5
- Предмет: Математика
- Тема урока: Сложение дробей

Заполни ВСЕ поля структуры:
- lessonObjectives (3–5 SMART-целей урока)
- assessmentCriteria (3–5 измеримых критериев)
- languageObjectives.terms (5–10 предметных терминов), languageObjectives.phrases (3–5 фраз)
- values, crossCurricularLinks, priorKnowledge
- stages.beginning / middle / end:
  • time, teacherActions (ПОДРОБНО, 4-5 предложений минимум), studentActions (ПОДРОБНО), resources
  • keyQuestions, descriptors, assessmentMethod
- stages.end: summary, reflectionQuestions, homework
- evaluation: formativeAssessment, differentiation, healthAndSafety, reflection`;

// ── Модели для тестирования ─────────────────────────────────

interface ModelDef {
  name: string;
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  format?: any;
}

function getModels(): ModelDef[] {
  const geminiKey = process.env.GEMINI_API_KEY || "";
  const groqKey = process.env.GROQ_API_KEY || "";
  const cerebrasKey = process.env.CEREBRAS_API_KEY || "";
  const openrouterKey = process.env.OPENROUTER_API_KEY || "";

  const models: ModelDef[] = [];

  // ── Gemini ──
  if (geminiKey) {
    models.push({
      name: "Gemini 3.8 Flash",
      provider: "Google",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: geminiKey,
      model: "gemini-3.8-flash",
    });
  }

  // ── Groq ──
  if (groqKey) {
    models.push({
      name: "GPT OSS 120B",
      provider: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      model: "openai/gpt-oss-120b",
      format: { type: "json_object" },
    });
    models.push({
      name: "GPT OSS 20B",
      provider: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      model: "openai/gpt-oss-20b",
      format: { type: "json_object" },
    });
    models.push({
      name: "Qwen 3.8 27B",
      provider: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      model: "qwen/qwen3.8-27b",
      format: { type: "json_object" },
    });
  }

  // ── Cerebras ──
  if (cerebrasKey) {
    models.push({
      name: "GPT OSS 120B",
      provider: "Cerebras",
      baseURL: "https://api.cerebras.ai/v1",
      apiKey: cerebrasKey,
      model: "gpt-oss-120b",
      format: { type: "json_object" },
    });
    models.push({
      name: "Qwen 3.8 27B",
      provider: "Cerebras",
      baseURL: "https://api.cerebras.ai/v1",
      apiKey: cerebrasKey,
      model: "qwen-3.8-27b",
      format: { type: "json_object" },
    });
  }

  // ── OpenRouter (бесплатные модели) ──
  if (openrouterKey) {
    const orModels = [
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "nvidia/nemotron-3.5-lightning:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "google/gemma-4-31b-it:free",
      "thinkingmachines/inkling:free",
      "dots-studio/dots-3-note-preview:free",
      "nex-agi/nex-n2.5-pro:free",
      "poolside/laguna-s-2.1:free",
    ];
    for (const m of orModels) {
      models.push({
        name: m.split("/")[1]!.replace(":free", ""),
        provider: "OpenRouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: openrouterKey,
        model: m,
      });
    }
  }

  return models;
}

// ── Запуск тестов ─────────────────────────────────

interface TestResult {
  name: string;
  provider: string;
  model: string;
  timeMs: number;
  rawLength: number;
  teacherActionsLength: number;
  fieldsPresent: number;
  fieldsTotal: number;
  error?: string;
}

const REQUIRED_FIELDS = [
  "lessonObjectives",
  "assessmentCriteria",
  "languageObjectives",
  "values",
  "crossCurricularLinks",
  "priorKnowledge",
  "stages",
  "evaluation",
];

function countFields(parsed: any): { present: number; total: number } {
  let present = 0;
  const total = REQUIRED_FIELDS.length + 8; // + sub-fields
  for (const f of REQUIRED_FIELDS) {
    if (parsed[f]) present++;
  }
  // Sub-fields
  if (parsed.stages?.beginning?.teacherActions) present++;
  if (parsed.stages?.middle?.teacherActions) present++;
  if (parsed.stages?.end?.teacherActions) present++;
  if (parsed.stages?.end?.homework) present++;
  if (parsed.stages?.end?.summary) present++;
  if (parsed.stages?.end?.reflectionQuestions) present++;
  if (parsed.evaluation?.formativeAssessment) present++;
  if (parsed.evaluation?.differentiation) present++;
  return { present, total };
}

async function testModel(def: ModelDef): Promise<TestResult> {
  const result: TestResult = {
    name: def.name,
    provider: def.provider,
    model: def.model,
    timeMs: 0,
    rawLength: 0,
    teacherActionsLength: 0,
    fieldsPresent: 0,
    fieldsTotal: 16,
  };

  const client = new OpenAI({ apiKey: def.apiKey, baseURL: def.baseURL });
  const t0 = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: def.model,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_PROMPT },
      ],
      response_format: def.format,
    }, { timeout: 15000 });

    result.timeMs = Date.now() - t0;
    const content = response.choices[0]?.message?.content || "";
    result.rawLength = content.length;

    // Попытка парсинга JSON
    // Извлекаем JSON из markdown если нужно
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1]!;

    const parsed = JSON.parse(jsonStr.trim());

    const ta =
      (parsed.stages?.beginning?.teacherActions || "").length +
      (parsed.stages?.middle?.teacherActions || "").length +
      (parsed.stages?.end?.teacherActions || "").length;
    result.teacherActionsLength = ta;

    const { present, total } = countFields(parsed);
    result.fieldsPresent = present;
    result.fieldsTotal = total;
  } catch (e: any) {
    result.timeMs = Date.now() - t0;
    result.error = e.message?.substring(0, 120);
  }

  return result;
}

async function main() {
  const models = getModels();
  console.log(`\n🚀 МЕГА-ТЕСТ: ${models.length} моделей на генерацию КСП\n`);
  console.log("═".repeat(100));

  const results: TestResult[] = [];

  for (const def of models) {
    const label = `${def.provider} / ${def.name}`;
    process.stdout.write(`🔄 ${label.padEnd(50)}... `);
    const r = await testModel(def);
    results.push(r);

    if (r.error) {
      console.log(`❌ ${(r.timeMs / 1000).toFixed(1)}с — ${r.error}`);
    } else {
      console.log(
        `✅ ${(r.timeMs / 1000).toFixed(1)}с | ` +
        `JSON: ${r.rawLength} символов | ` +
        `TeacherActions: ${r.teacherActionsLength} символов | ` +
        `Полнота: ${r.fieldsPresent}/${r.fieldsTotal}`
      );
    }
  }

  // ── Итоговая таблица ──
  console.log("\n" + "═".repeat(100));
  console.log("📊 ИТОГОВАЯ ТАБЛИЦА (отсортировано по полноте → объём текста → скорость)\n");

  const successful = results.filter((r) => !r.error);
  successful.sort((a, b) => {
    if (b.fieldsPresent !== a.fieldsPresent) return b.fieldsPresent - a.fieldsPresent;
    if (b.teacherActionsLength !== a.teacherActionsLength) return b.teacherActionsLength - a.teacherActionsLength;
    return a.timeMs - b.timeMs;
  });

  console.log(
    "Место".padEnd(6) +
    "Провайдер / Модель".padEnd(52) +
    "Время".padEnd(8) +
    "JSON".padEnd(10) +
    "TeachAct".padEnd(10) +
    "Поля".padEnd(8)
  );
  console.log("─".repeat(94));

  successful.forEach((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    console.log(
      `${medal}`.padEnd(6) +
      `${r.provider} / ${r.name}`.padEnd(52) +
      `${(r.timeMs / 1000).toFixed(1)}с`.padEnd(8) +
      `${r.rawLength}`.padEnd(10) +
      `${r.teacherActionsLength}`.padEnd(10) +
      `${r.fieldsPresent}/${r.fieldsTotal}`.padEnd(8)
    );
  });

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    console.log("\n❌ Не прошли тест:");
    failed.forEach((r) => {
      console.log(`   ${r.provider} / ${r.name}: ${r.error}`);
    });
  }

  // ── Рекомендации ──
  console.log("\n" + "═".repeat(100));
  console.log("💡 РЕКОМЕНДАЦИИ:");
  if (successful.length >= 1) {
    console.log(`   🏆 ГЕНЕРАЦИЯ КСП:      ${successful[0]!.provider} / ${successful[0]!.name} (${(successful[0]!.timeMs/1000).toFixed(1)}с, ${successful[0]!.teacherActionsLength} симв. teacherActions)`);
  }
  if (successful.length >= 2) {
    console.log(`   🔄 ФОЛЛБЭК 1:          ${successful[1]!.provider} / ${successful[1]!.name}`);
  }
  if (successful.length >= 3) {
    console.log(`   🔄 ФОЛЛБЭК 2:          ${successful[2]!.provider} / ${successful[2]!.name}`);
  }
}

main().catch(console.error);
