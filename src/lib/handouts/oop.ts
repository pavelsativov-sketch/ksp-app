import type { Worksheet, WorksheetTask } from "./types";

/**
 * Лист для ученика с ООП, как на образцах владельца: та же страница, но легче.
 * Задания с письменным ответом становятся устными («запиши» → «расскажи»),
 * в пропуски даётся банк слов, вариантов и пар меньше, шрифт крупнее.
 * Строится из того же листа без ИИ, поэтому номера и баллы совпадают с КСП.
 */
const MAX_TASKS = 4;
const MAX_OPTIONS = 3;
const MAX_PAIRS = 4;
const MAX_ITEMS = 8;

/** Ответ пишется развёрнуто: такому ученику легче сказать его вслух. */
const WRITTEN_TYPES = new Set<WorksheetTask["type"]>(["open", "case_study", "creative", "compare", "table_fix", "scenario_fix"]);

const RU_VERBS: Array<[RegExp, string]> = [
  [/(^|[\s«(])запиши(те)?/giu, "$1расскажи$2"],
  [/(^|[\s«(])напиши(те)?/giu, "$1расскажи$2"],
  [/(^|[\s«(])объясни(те)? письменно/giu, "$1объясни$2 устно"],
];

/** Сохраняем заглавную букву глагола в начале задания. */
function capitalLike(source: string, replaced: string): string {
  return /^\p{Lu}/u.test(source) ? replaced.charAt(0).toUpperCase() + replaced.slice(1) : replaced;
}

export function oralPrompt(prompt: string, language: "ru" | "kz"): string {
  if (language === "kz") return prompt.startsWith("Ауызша") ? prompt : `Ауызша: ${prompt}`;
  let next = prompt;
  for (const [pattern, replacement] of RU_VERBS) next = next.replace(pattern, replacement);
  return next === prompt ? `Расскажи устно: ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}` : capitalLike(prompt, next);
}

/** Правильный вариант остаётся, лишние отрезаются: выбирать из трёх легче, чем из четырёх. */
function fewerOptions(task: WorksheetTask): WorksheetTask {
  const options = task.options ?? [];
  const correct = task.correctIndex;
  if (options.length <= MAX_OPTIONS || typeof correct !== "number" || options[correct] === undefined) return task;
  const wrong = options.map((_, i) => i).filter((i) => i !== correct).slice(0, MAX_OPTIONS - 1);
  const indices = [...wrong, correct].sort((a, b) => a - b);
  return { ...task, options: indices.map((i) => options[i]!), correctIndex: indices.indexOf(correct) };
}

/** Пропуски с банком слов: ответы уже на листе, ученику нужно только выбрать. */
function withWordBank(task: WorksheetTask): WorksheetTask {
  const answers = (task.expectedAnswer ?? "").split(/\s*[;,]\s*/).filter(Boolean);
  if (answers.length === 0) return task;
  return { ...task, type: "fill_bank", wordBank: [...answers].sort((a, b) => a.localeCompare(b, "ru")) };
}

function lighter(task: WorksheetTask, language: "ru" | "kz"): WorksheetTask {
  if (WRITTEN_TYPES.has(task.type)) return { ...task, prompt: oralPrompt(task.prompt, language), oral: true };
  switch (task.type) {
    case "fill": return withWordBank(task);
    case "multiple_choice": return fewerOptions(task);
    case "match": return { ...task, options: task.options?.slice(0, MAX_PAIRS), pairs: task.pairs?.slice(0, MAX_PAIRS) };
    case "sort": return { ...task, items: task.items?.slice(0, MAX_ITEMS) };
    case "categorize": return { ...task, categoryItems: task.categoryItems?.slice(0, MAX_ITEMS) };
    default: return task;
  }
}

export function toOopSheet(sheet: Worksheet): Worksheet {
  const language = sheet.language ?? "ru";
  const work = sheet.tasks.filter((task) => task.type !== "reflection").slice(0, MAX_TASKS);
  const reflection = sheet.tasks.find((task) => task.type === "reflection");
  return {
    ...sheet,
    oop: true,
    tasks: [...work.map((task) => lighter(task, language)), ...(reflection ? [reflection] : [])],
  };
}
