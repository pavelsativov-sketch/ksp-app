/**
 * Базовые команды без модели. Сменить язык или открыть раздел BilimClass — это
 * известная последовательность кликов: через модель она занимала минуты из-за
 * лимитов бесплатных провайдеров, готовым рецептом — секунды.
 */
const CABINET = "https://www.bilimclass.kz/2026";

export type RecipeStep =
  | { navigate: string }
  /** Нажать первую подпись из списка, которая есть на экране. */
  | { clickAny: string[]; optional?: boolean };

export interface Recipe {
  summary: string;
  steps: RecipeStep[];
}

const LANGUAGES: Array<{ label: string; pattern: RegExp }> = [
  { label: "Русский", pattern: /русск|орыс|russian/i },
  { label: "Қазақша", pattern: /казах|қазақ|kazakh/i },
  { label: "English", pattern: /англ|ағылшын|english/i },
];

const SECTIONS: Array<{ name: string; path: string; pattern: RegExp }> = [
  { name: "Журнал", path: "/control/journal/groups", pattern: /журнал/i },
  { name: "Дэшборд", path: "/frontoffice/dashboard", pattern: /д[эа]шборд|dashboard/i },
  { name: "Моё расписание", path: "/schedule", pattern: /расписани/i },
  { name: "Чат с учеником", path: "/control/chat", pattern: /(?<![а-яё])чат/i },
  { name: "Мои СОР/СОЧ", path: "/content/lessons", pattern: /(?<![а-яё])со[рч](?![а-яё])/i },
  { name: "Мои уроки", path: "/content/lectures", pattern: /мои уроки/i },
];

/** Закрывает приветственный тур, если он перекрыл страницу. */
const SKIP_TOUR: RecipeStep = { clickAny: ["Өткізіп жіберу", "Пропустить", "Skip"], optional: true };
/** Поручение из одного действия: «и потом…», «затем…» рецепт не покрывает. */
const MULTI_STEP = /,|(?<![а-яё])и(?![а-яё])|затем|потом|после/i;

export function matchRecipe(prompt: string): Recipe | null {
  const text = prompt.trim();
  if (text.length > 120 || !/bilim|билим/i.test(text)) return null;

  // Глагол обязателен: «переведи план на казахский язык» — не про язык интерфейса.
  if (/язык|тіл|language/i.test(text) && /переключ|смени|поменя|измени|постав|установ|сдела|ауыстыр|switch|change/i.test(text)) {
    const target = LANGUAGES.find((language) => language.pattern.test(text));
    if (!target) return null;
    // Подпись текущего языка открывает список; какая она сейчас — заранее неизвестно.
    const openers = [...LANGUAGES.map((language) => language.label).filter((label) => label !== target.label), target.label];
    return {
      summary: `Язык интерфейса BilimClass переключён на «${target.label}».`,
      steps: [{ navigate: `${CABINET}/schedule` }, SKIP_TOUR, { clickAny: openers }, { clickAny: [target.label] }],
    };
  }

  const opening = text.replace(/^.*?(открой|открыть|перейди|зайди|покажи)/i, "$1");
  if (!/^(открой|открыть|перейди|зайди|покажи)/i.test(opening)) return null;
  const rest = opening.replace(/bilimclass|билим\s?класс?е?/gi, "");
  if (MULTI_STEP.test(rest)) return null;
  const section = SECTIONS.find((candidate) => candidate.pattern.test(rest));
  if (!section) return null;
  return {
    summary: `Открыл раздел «${section.name}» в BilimClass.`,
    steps: [{ navigate: `${CABINET}${section.path}` }, SKIP_TOUR],
  };
}

type ToolCall = (name: string, args: Record<string, unknown>, optional: boolean) => Promise<{ success?: boolean; authBarrier?: unknown }>;

/** Выполняет рецепт; false — шаг не удался, задачу должен продолжить обычный агент. */
export async function runRecipe(recipe: Recipe, call: ToolCall): Promise<boolean> {
  for (const step of recipe.steps) {
    if ("navigate" in step) {
      const result = await call("browserNavigate", { url: step.navigate }, false);
      // Сессия BilimClass истекла: вход и подсказки учителю умеет только обычный агент.
      if (!result.success || result.authBarrier) return false;
      continue;
    }
    let clicked = false;
    for (const text of step.clickAny) {
      clicked = Boolean((await call("browserClickText", { text }, true)).success);
      if (clicked) break;
    }
    if (!clicked && !step.optional) return false;
  }
  return true;
}
