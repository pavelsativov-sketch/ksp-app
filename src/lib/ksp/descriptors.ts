/**
 * Банк дескрипторов и ФО — генерация 3–4 дескрипторов под цель ГОСО
 * с дифференциацией по уровням A/B/C.
 *
 * Уровни:
 *  A — базовый (репродуктивный): узнавание, воспроизведение по образцу
 *  B — средний (продуктивный): применение алгоритма, объяснение
 *  C — продвинутый (творческий): перенос в новую ситуацию, обоснование
 */

import type { DifferentiationLevel } from "./tasks";

export type { DifferentiationLevel } from "./tasks";

export interface Descriptor {
  id: string;
  text: string;
  level: DifferentiationLevel;
  objectiveCode?: string;
  /** Рекомендуемый балл за дескриптор (в сумме по теме обычно 3–4 балла) */
  points?: number;
}

export interface GenerateDescriptorsInput {
  code: string;
  text: string;
  language?: "ru" | "kz";
  /** 3 или 4 дескриптора; по умолчанию 3 */
  count?: 3 | 4;
}

export const DESCRIPTOR_LEVELS: DifferentiationLevel[] = ["A", "B", "C"];

export const DESCRIPTOR_LEVEL_META: Record<
  DifferentiationLevel,
  { labelRu: string; labelKz: string; hintRu: string; hintKz: string; color: string }
> = {
  A: {
    labelRu: "Уровень A — базовый",
    labelKz: "А деңгейі — базалық",
    hintRu: "Узнавание и воспроизведение по образцу",
    hintKz: "Танып-білу және үлгі бойынша орындау",
    color: "emerald",
  },
  B: {
    labelRu: "Уровень B — средний",
    labelKz: "В деңгейі — орташа",
    hintRu: "Применение алгоритма и объяснение",
    hintKz: "Алгоритмді қолдану және түсіндіру",
    color: "amber",
  },
  C: {
    labelRu: "Уровень C — продвинутый",
    labelKz: "С деңгейі — жоғары",
    hintRu: "Перенос в новую ситуацию, обоснование",
    hintKz: "Жаңа жағдаятқа көшіру, негіздеу",
    color: "violet",
  },
};

export function descriptorLevelLabel(level: DifferentiationLevel, locale: "ru" | "kk" = "ru"): string {
  const meta = DESCRIPTOR_LEVEL_META[level];
  if (locale === "kk") return meta.labelKz;
  return meta.labelRu;
}

export function descriptorLevelHint(level: DifferentiationLevel, locale: "ru" | "kk" = "ru"): string {
  const meta = DESCRIPTOR_LEVEL_META[level];
  if (locale === "kk") return meta.hintKz;
  return meta.hintRu;
}

export function descriptorLevelBadgeClass(level: DifferentiationLevel): string {
  switch (level) {
    case "A":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "B":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "C":
      return "bg-violet-50 text-violet-700 border-violet-200";
  }
}

/* ---------- Вспомогательное: извлечение концепта из текста цели ---------- */

function extractConcept(objectiveText: string): string {
  // Текст цели обычно «5.1.2.1 — Выполнять сложение ...» или просто описание
  const cleaned = objectiveText
    .replace(/^\s*\d+(\.\d+)*\s*[-—–]\s*/, "")
    .trim();
  // Берём первые 4–5 слов как концепт, убираем точку в конце
  const words = cleaned.split(/\s+/).slice(0, 5).join(" ").replace(/\.$/, "");
  return words || cleaned.slice(0, 60);
}

function shortConceptForBlank(concept: string): string {
  // Для подстановки в шаблон — нижний регистр, без точки
  const s = concept.trim().replace(/\.$/, "");
  if (s.length <= 40) return s.toLowerCase();
  return s.slice(0, 40).toLowerCase().trim();
}

/* ---------- Шаблоны по языкам ---------- */

type Templates = Record<DifferentiationLevel, string[]>;

const RU_TEMPLATES: Templates = {
  A: [
    "Называет/распознаёт: {concept}",
    "Записывает {concept} по образцу",
    "Находит {concept} среди предложенных примеров",
    "Повторяет определение/правило: {concept}",
  ],
  B: [
    "Применяет {concept} по алгоритму (1–2 шага)",
    "Объясняет выбор приёма для {concept}",
    "Сравнивает примеры по признаку {concept}",
    "Решает типовую задачу на {concept} и проверяет ответ",
  ],
  C: [
    "Применяет {concept} в новой/контекстной ситуации и обосновывает решение",
    "Составляет собственный пример на {concept} и оценивает результат",
    "Анализирует ошибку в примере на {concept} и исправляет её",
    "Выбирает оптимальный способ применения {concept} и объясняет почему",
  ],
};

const KZ_TEMPLATES: Templates = {
  A: [
    "Атайды/танып-біледі: {concept}",
    "Үлгі бойынша жазады: {concept}",
    "Берілген мысалдардан {concept} табады",
    "Анықтаманы/ережені қайталайды: {concept}",
  ],
  B: [
    "{concept} алгоритм бойынша қолданады (1–2 қадам)",
    "{concept} үшін тәсіл таңдауын түсіндіреді",
    "{concept} белгісі бойынша мысалдарды салыстырады",
    "{concept} типтік есебін шығарып, жауабын тексереді",
  ],
  C: [
    "{concept} жаңа/контекстік жағдаятта қолданып, шешімін негіздейді",
    "{concept} өз мысалын құрастырып, нәтижесін бағалайды",
    "{concept} мысалындағы қатені талдап, түзетеді",
    "{concept} қолданудың оңтайлы тәсілін таңдап, себебін түсіндіреді",
  ],
};

function fillTemplates(
  templates: string[],
  needed: number,
  concept: string,
  seed: number,
): string[] {
  const short = shortConceptForBlank(concept);
  const out: string[] = [];
  for (let i = 0; i < needed; i++) {
    const tpl = templates[(seed + i) % templates.length]!;
    out.push(tpl.replace("{concept}", short));
  }
  return out;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ---------- Публичные функции ---------- */

/**
 * Генерирует 3–4 дескриптора под одну цель ГОСО.
 * Распределение: при count=3 → A/B/C по одному; при count=4 → A×1, B×1, C×2.
 */
export function generateDescriptorsForObjective(input: GenerateDescriptorsInput): Descriptor[] {
  const language = input.language === "kz" ? "kz" : "ru";
  const count = input.count === 4 ? 4 : 3;
  const concept = extractConcept(input.text);
  const seed = hashCode(`${input.code}::${input.text}::${language}`);
  const templates = language === "kz" ? KZ_TEMPLATES : RU_TEMPLATES;

  const levels: DifferentiationLevel[] = count === 3 ? ["A", "B", "C"] : ["A", "B", "C", "C"];

  // Для уровня C при 4 дескрипторах берём два разных шаблона
  const levelCounts: Record<DifferentiationLevel, number> = { A: 0, B: 0, C: 0 };
  levels.forEach((l) => (levelCounts[l] += 1));

  const result: Descriptor[] = [];
  let offset = seed;
  for (const level of levels) {
    const idxForLevel = result.filter((d) => d.level === level).length;
    const tplSet = templates[level];
    const text = fillTemplates(tplSet, 1, concept, offset + idxForLevel * 7)[0]!;
    // Капитализация первой буквы
    const finalText = text.charAt(0).toUpperCase() + text.slice(1);
    result.push({
      id: `d_${input.code || "obj"}_${level}_${idxForLevel}_${Math.random().toString(36).slice(2, 6)}`,
      text: finalText,
      level,
      objectiveCode: input.code || undefined,
      points: level === "A" ? 1 : level === "B" ? 1 : 2,
    });
    offset += 3;
  }

  return result;
}

/**
 * Банк: сгенерировать дескрипторы по списку целей ГОСО.
 */
export function generateDescriptorsBank(
  objectives: Array<{ code: string; text: string }>,
  opts?: { language?: "ru" | "kz"; countPerObjective?: 3 | 4 },
): Descriptor[] {
  const language = opts?.language === "kz" ? "kz" : "ru";
  const count = opts?.countPerObjective === 4 ? 4 : 3;
  return objectives.flatMap((o) =>
    generateDescriptorsForObjective({ code: o.code, text: o.text, language, count }),
  );
}

/** Алиас для совместимости */
export const generateDescriptors = generateDescriptorsForObjective;

export function groupDescriptorsByLevel(
  descriptors: Descriptor[],
): Record<DifferentiationLevel, Descriptor[]> {
  return {
    A: descriptors.filter((d) => d.level === "A"),
    B: descriptors.filter((d) => d.level === "B"),
    C: descriptors.filter((d) => d.level === "C"),
  };
}

export function filterDescriptorsByLevel(
  descriptors: Descriptor[],
  level: DifferentiationLevel,
): Descriptor[] {
  return descriptors.filter((d) => d.level === level);
}

export function sortDescriptorsByLevel(descriptors: Descriptor[]): Descriptor[] {
  const order: Record<DifferentiationLevel, number> = { A: 0, B: 1, C: 2 };
  return [...descriptors].sort((a, b) => order[a.level] - order[b.level]);
}
