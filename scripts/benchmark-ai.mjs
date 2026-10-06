/**
 * Benchmark configured AI providers on real KSP app tasks.
 *
 * It loads keys from .env.local, tests lesson-plan generation, task generation,
 * and section enhancement, then writes a JSON report to .devin/ai-benchmark/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";

loadEnv(".env.local");

const BASE_URLS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const PROVIDERS = [
  {
    provider: "Groq",
    key: process.env.GROQ_API_KEY,
    baseURL: BASE_URLS.groq,
    models: [
      { model: "openai/gpt-oss-120b", jsonMode: true, use: ["plan", "enhance"] },
      { model: "openai/gpt-oss-20b", jsonMode: true, use: ["tasks"] },
      { model: "qwen/qwen3.8-27b", jsonMode: true, use: ["tasks", "enhance"] },
    ],
  },
  {
    provider: "Google Gemini",
    key: process.env.GEMINI_API_KEY,
    baseURL: BASE_URLS.gemini,
    models: [
      { model: "gemini-3.8-flash", jsonMode: false, use: ["plan", "tasks", "enhance"] },
      { model: "gemini-3.7-flash", jsonMode: false, use: ["plan", "tasks"] },
      { model: "gemini-2.5-flash", jsonMode: false, use: ["plan", "tasks", "enhance"] },
      { model: "gemini-2.5-flash-lite", jsonMode: false, use: ["tasks", "enhance"] },
    ],
  },
  {
    provider: "Cerebras",
    key: process.env.CEREBRAS_API_KEY,
    baseURL: BASE_URLS.cerebras,
    models: [
      { model: "gpt-oss-120b", jsonMode: true, use: ["plan", "enhance"] },
      { model: "qwen-3.8-27b", jsonMode: true, use: ["tasks", "enhance"] },
      { model: "gemma-4-31b", jsonMode: true, use: ["tasks"] },
    ],
  },
  {
    provider: "OpenRouter",
    key: process.env.OPENROUTER_API_KEY,
    baseURL: BASE_URLS.openrouter,
    models: [
      { model: "nvidia/nemotron-3.5-lightning:free", jsonMode: false, use: ["plan", "enhance"] },
      { model: "nex-agi/nex-n2.5-pro:free", jsonMode: false, use: ["plan", "tasks"] },
      { model: "nex-agi/nex-n2.5-mini:free", jsonMode: false, use: ["tasks", "enhance"] },
      { model: "inclusionai/ling-3.0-flash-vl:free", jsonMode: false, use: ["tasks"] },
    ],
  },
];

const includeOpenRouterFree = process.argv.includes("--include-openrouter-free");

const KSP_SYSTEM = `Ты помощник для учителей Казахстана, который составляет КСП по стандарту обновленного содержания образования РК.
Между этапами должна быть явная логическая связь: начало актуализирует знания, середина вводит и тренирует новый материал, конец подводит итог и задает рефлексию.
Отвечай строго JSON без markdown.`;

const PLAN_PROMPT = `Составь КСП на русском языке:
- Класс: 5
- Предмет: Математика
- Тема урока: Сложение дробей с одинаковыми знаменателями
- Цели обучения: 5.1.2.1 выполнять сложение и вычитание обыкновенных дробей с одинаковыми знаменателями

Верни JSON со всеми полями:
topic, lessonObjectives, assessmentCriteria, languageObjectives.terms, languageObjectives.phrases,
values, crossCurricularLinks, priorKnowledge,
stages.beginning/middle/end: time, teacherActions, studentActions, resources, keyQuestions, descriptors, assessmentMethod,
stages.end: summary, reflectionQuestions, homework,
evaluation.formativeAssessment, evaluation.differentiation, evaluation.healthAndSafety, evaluation.reflection.`;

const TASKS_PROMPT = `Тема урока: "Сложение дробей с одинаковыми знаменателями"
Предмет: Математика
Класс: 5
Этап: середина урока
Количество заданий: 4

Верни JSON {"tasks":[...]}.
Разрешенные типы: MCQ, TRUE_FALSE, SHORT_ANSWER, FILL_BLANK, ORDERING, NUMERIC.
Для каждого задания: type, question, hint, points, payload.`;

const ENHANCE_PROMPT = `Улучши фрагмент КСП.
Раздел: Действия учителя
Этап: Середина урока
Предмет: Математика
Класс: 5
Тема: Сложение дробей с одинаковыми знаменателями
Текущее содержание: "Объясняет тему и дает задания."

Верни JSON {"improved":"..."}: 4-6 конкретных предложений, с инструкциями учителя, практикой, дифференциацией и формативным оцениванием.`;

const JOBS = [
  { kind: "plan", prompt: PLAN_PROMPT, system: KSP_SYSTEM, score: scorePlan },
  { kind: "tasks", prompt: TASKS_PROMPT, system: "Ты составляешь интерактивные задания для школьного урока. Отвечай JSON без markdown.", score: scoreTasks },
  { kind: "enhance", prompt: ENHANCE_PROMPT, system: "Ты опытный методист РК. Улучшаешь только запрошенный фрагмент КСП. Отвечай JSON без markdown.", score: scoreEnhance },
];

function loadEnv(file) {
  try {
    const text = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // Optional file.
  }
}

function configuredCandidates() {
  return PROVIDERS.flatMap((provider) => {
    if (!provider.key) return [];
    return provider.models.map((model) => ({ ...model, provider: provider.provider, apiKey: provider.key, baseURL: provider.baseURL }));
  }).filter((candidate) => {
    if (includeOpenRouterFree) return true;
    return !(candidate.provider === "OpenRouter" && candidate.model.endsWith(":free"));
  });
}

function extractJson(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = Math.min(...["{", "["].map((char) => {
      const index = text.indexOf(char);
      return index === -1 ? Number.POSITIVE_INFINITY : index;
    }));
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (Number.isFinite(start) && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Response is not parseable JSON");
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function textLength(value) {
  return typeof value === "string" ? value.trim().length : 0;
}

function scorePlan(parsed) {
  let score = 0;
  const notes = [];
  const requiredTop = ["topic", "lessonObjectives", "assessmentCriteria", "languageObjectives", "values", "crossCurricularLinks", "priorKnowledge", "stages", "evaluation"];
  for (const field of requiredTop) {
    if (parsed?.[field]) score += 4;
    else notes.push(`missing ${field}`);
  }

  score += Math.min(asArray(parsed.lessonObjectives).length, 5) * 2;
  score += Math.min(asArray(parsed.assessmentCriteria).length, 5) * 2;
  score += Math.min(asArray(parsed.languageObjectives?.terms).length, 8);
  score += Math.min(asArray(parsed.languageObjectives?.phrases).length, 5);

  for (const stageName of ["beginning", "middle", "end"]) {
    const stage = parsed.stages?.[stageName];
    if (!stage) {
      notes.push(`missing stage ${stageName}`);
      continue;
    }
    for (const field of ["time", "teacherActions", "studentActions", "resources", "assessmentMethod"]) {
      if (stage[field]) score += 2;
      else notes.push(`missing ${stageName}.${field}`);
    }
    score += Math.min(Math.floor(textLength(stage.teacherActions) / 180), 8);
    score += Math.min(Math.floor(textLength(stage.studentActions) / 120), 5);
    score += Math.min(asArray(stage.keyQuestions).length, 3) * 2;
    score += Math.min(asArray(stage.descriptors).length, 4) * 2;
  }

  const end = parsed.stages?.end;
  if (textLength(end?.summary) > 80) score += 4;
  if (textLength(end?.homework) > 50) score += 4;
  score += Math.min(asArray(end?.reflectionQuestions).length, 3) * 2;

  for (const field of ["formativeAssessment", "differentiation", "healthAndSafety", "reflection"]) {
    if (textLength(parsed.evaluation?.[field]) > 50) score += 4;
    else notes.push(`weak evaluation.${field}`);
  }

  return { score, maxScore: 140, notes };
}

function scoreTasks(parsed) {
  const tasks = Array.isArray(parsed) ? parsed : asArray(parsed.tasks);
  const notes = [];
  let score = Math.min(tasks.length, 4) * 10;
  const types = new Set();
  for (const [index, task] of tasks.entries()) {
    if (task?.type) types.add(task.type);
    if (textLength(task?.question) > 20) score += 5;
    else notes.push(`task ${index + 1} weak question`);
    if (textLength(task?.hint) > 10) score += 2;
    if (typeof task?.points === "number") score += 2;
    if (task?.payload && typeof task.payload === "object") score += 6;
    else notes.push(`task ${index + 1} missing payload`);
  }
  score += Math.min(types.size, 4) * 5;
  return { score, maxScore: 100, notes };
}

function scoreEnhance(parsed) {
  const improved = typeof parsed?.improved === "string" ? parsed.improved : "";
  const notes = [];
  let score = 0;
  const length = textLength(improved);
  score += Math.min(Math.floor(length / 80), 8) * 8;
  for (const word of ["учитель", "учащ", "задани", "критери", "оцен", "пар"]) {
    if (improved.toLowerCase().includes(word)) score += 6;
    else notes.push(`no "${word}" marker`);
  }
  return { score, maxScore: 100, notes };
}

async function runOne(candidate, job) {
  const client = new OpenAI({ apiKey: candidate.apiKey, baseURL: candidate.baseURL });
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await client.chat.completions.create(
      {
        model: candidate.model,
        temperature: 0.55,
        messages: [
          { role: "system", content: job.system },
          { role: "user", content: job.prompt },
        ],
        response_format: candidate.jsonMode ? { type: "json_object" } : undefined,
      },
      { signal: controller.signal },
    );
    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = extractJson(raw);
    const quality = job.score(parsed);
    return {
      ok: true,
      provider: candidate.provider,
      model: candidate.model,
      kind: job.kind,
      timeMs: Date.now() - start,
      chars: raw.length,
      ...quality,
    };
  } catch (error) {
    return {
      ok: false,
      provider: candidate.provider,
      model: candidate.model,
      kind: job.kind,
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      score: 0,
      maxScore: 100,
      notes: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function rank(results) {
  return [...results].sort((a, b) => {
    const aRate = Math.min(a.score / a.maxScore, 1);
    const bRate = Math.min(b.score / b.maxScore, 1);
    if (bRate !== aRate) return bRate - aRate;
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    return a.timeMs - b.timeMs;
  });
}

async function main() {
  const candidates = configuredCandidates();
  if (candidates.length === 0) {
    throw new Error("No AI provider keys found in .env.local");
  }

  const selected = candidates.filter((candidate) => JOBS.some((job) => candidate.use.includes(job.kind)));
  console.log(`AI benchmark: ${selected.length} model candidates, ${JOBS.length} tasks`);
  if (!includeOpenRouterFree) {
    console.log("OpenRouter :free models are skipped. Run with --include-openrouter-free or npm run test:ai:free to include them.");
  }
  console.log("");

  const results = [];
  for (const job of JOBS) {
    console.log(`=== ${job.kind.toUpperCase()} ===`);
    for (const candidate of selected.filter((item) => item.use.includes(job.kind))) {
      process.stdout.write(`${candidate.provider} / ${candidate.model} ... `);
      const result = await runOne(candidate, job);
      results.push(result);
      if (result.ok) {
        const percent = Math.round(Math.min(result.score / result.maxScore, 1) * 100);
        console.log(`${percent}% in ${(result.timeMs / 1000).toFixed(1)}s (${result.chars} chars)`);
      } else {
        console.log(`FAIL in ${(result.timeMs / 1000).toFixed(1)}s: ${result.error}`);
      }
    }
    console.log("");
  }

  const byKind = Object.fromEntries(JOBS.map((job) => [job.kind, rank(results.filter((r) => r.kind === job.kind))]));
  console.log("Recommended winners:");
  for (const job of JOBS) {
    const winner = byKind[job.kind].find((r) => r.ok);
    if (!winner) {
      console.log(`- ${job.kind}: no successful model`);
      continue;
    }
    console.log(`- ${job.kind}: ${winner.provider} / ${winner.model} (${Math.round(Math.min(winner.score / winner.maxScore, 1) * 100)}%, ${(winner.timeMs / 1000).toFixed(1)}s)`);
  }

  const outDir = resolve(process.cwd(), ".devin", "ai-benchmark");
  mkdirSync(outDir, { recursive: true });
  const reportPath = resolve(outDir, `report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(reportPath, JSON.stringify({ createdAt: new Date().toISOString(), results, byKind }, null, 2));
  console.log(`\nReport written: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
