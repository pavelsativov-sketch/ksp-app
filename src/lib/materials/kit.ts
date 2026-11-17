import { z } from "zod";
import {
  MATERIAL_KINDS,
  type KspContent,
  type LessonActivity,
  type LessonKit,
  type MaterialKind,
  type MaterialSlot,
  type StageKey,
  type WorkForm,
} from "@/lib/types/ksp";

/**
 * Комплект урока (docs/lesson-kit-design.md, шаги 2–3): ответы учителя перед КСП
 * превращаются в места под материалы на этапах, в указания для ИИ и в ссылки
 * внутри готового КСП. Логика без ИИ: одинаковые ответы дают одинаковый комплект.
 */

export const OOP_NEEDS = ["vision", "hearing", "zpr", "speech", "other"] as const;
export type OopNeed = (typeof OOP_NEEDS)[number];

export const kitAnswersSchema = z.object({
  workForms: z.array(z.enum(["individual", "pair", "group"])).max(3).default(["individual"]),
  groups: z.number().int().min(2).max(4).default(3),
  oop: z.object({
    present: z.boolean().default(false),
    needs: z.array(z.enum(OOP_NEEDS)).max(5).default([]),
    notes: z.string().trim().max(300).optional(),
  }).default({ present: false, needs: [] }),
  value: z.string().trim().max(200).optional(),
  minutes: z.union([z.literal(40), z.literal(45)]).default(45),
  materials: z.array(z.enum(MATERIAL_KINDS)).max(MATERIAL_KINDS.length).default(["worksheet", "deck"]),
});
export type KitAnswers = z.infer<typeof kitAnswersSchema>;

/** Ценности программы «Адал азамат», из которых учитель выбирает ценность урока. */
export const LESSON_VALUES: Record<"ru" | "kz", string[]> = {
  ru: ["Независимость и патриотизм", "Единство и солидарность", "Справедливость и ответственность", "Закон и порядок", "Трудолюбие и профессионализм", "Созидание и новаторство"],
  kz: ["Тәуелсіздік және отаншылдық", "Бірлік және ынтымақ", "Әділдік және жауапкершілік", "Заң және тәртіп", "Еңбекқорлық және кәсіби біліктілік", "Жасампаздық және жаңашылдық"],
};

const OOP_LABELS: Record<"ru" | "kz", Record<OopNeed, string>> = {
  ru: { vision: "нарушение зрения", hearing: "нарушение слуха", zpr: "ЗПР", speech: "нарушение речи", other: "другие особенности" },
  kz: { vision: "көру қабілетінің бұзылуы", hearing: "есту қабілетінің бұзылуы", zpr: "ПДТ", speech: "сөйлеу тілінің бұзылуы", other: "басқа ерекшеліктер" },
};

/** Где материал работает на уроке и какой формой работы. Презентация идёт через весь урок. */
const PLACEMENT: Record<MaterialKind, { stage: StageKey; form: WorkForm | null }> = {
  crossword: { stage: "beginning", form: "individual" },
  pair_cards: { stage: "middle", form: "pair" },
  group_cards: { stage: "middle", form: "group" },
  worksheet: { stage: "middle", form: "individual" },
  oop_sheet: { stage: "middle", form: "individual" },
  interactive: { stage: "end", form: "individual" },
  flashcards: { stage: "end", form: "individual" },
  deck: { stage: "beginning", form: null },
};

/** Порядок на этапе: сначала пары и группы, потом самостоятельная работа. */
const ORDER: MaterialKind[] = ["deck", "crossword", "pair_cards", "group_cards", "worksheet", "oop_sheet", "interactive", "flashcards"];

function slotTitle(kind: MaterialKind, answers: KitAnswers, language: "ru" | "kz"): string {
  const n = answers.groups;
  const ru: Record<MaterialKind, string> = {
    worksheet: "Рабочий лист (индивидуальная работа, 10 баллов)",
    oop_sheet: "Лист для ученика с ООП",
    group_cards: `Карточки групповой работы (${n} группы)`,
    pair_cards: "Карточки парной работы",
    interactive: "Интерактивные задания",
    crossword: "Кроссворд по терминам урока",
    flashcards: "Карточки в тетрадь",
    deck: "Презентация к уроку",
  };
  const kz: Record<MaterialKind, string> = {
    worksheet: "Жұмыс парағы (жеке жұмыс, 10 балл)",
    oop_sheet: "ЕБҚ оқушысына арналған парақ",
    group_cards: `Топтық жұмыс карточкалары (${n} топ)`,
    pair_cards: "Жұптық жұмыс карточкалары",
    interactive: "Интерактивті тапсырмалар",
    crossword: "Сабақ терминдері бойынша сөзжұмбақ",
    flashcards: "Дәптерге арналған карточкалар",
    deck: "Сабаққа арналған презентация",
  };
  return (language === "kz" ? kz : ru)[kind];
}

/**
 * Какие материалы реально войдут в урок. Карточки групп и пар есть только при
 * выбранной форме работы, лист ООП — только при ученике с ООП и рабочем листе.
 */
export function kitMaterials(answers: KitAnswers): MaterialKind[] {
  const chosen = new Set(answers.materials);
  const forms = new Set(answers.workForms);
  if (!forms.has("group")) chosen.delete("group_cards");
  if (!forms.has("pair")) chosen.delete("pair_cards");
  if (!answers.oop.present || !chosen.has("worksheet")) chosen.delete("oop_sheet");
  return ORDER.filter((kind) => chosen.has(kind));
}

export function planKitSlots(answers: KitAnswers, language: "ru" | "kz"): MaterialSlot[] {
  return kitMaterials(answers).map((kind) => ({
    id: `slot_${kind}`,
    kind,
    stage: PLACEMENT[kind].stage,
    status: "planned",
    title: slotTitle(kind, answers, language),
  }));
}

export function oopSummary(answers: KitAnswers, language: "ru" | "kz"): string {
  const labels = answers.oop.needs.map((need) => OOP_LABELS[language][need]);
  return [...labels, answers.oop.notes?.trim()].filter(Boolean).join(", ");
}

/** Сохраняемый в КСП комплект: ответы учителя и места под материалы. */
export function toLessonKit(answers: KitAnswers, language: "ru" | "kz"): LessonKit {
  const forms: WorkForm[] = answers.workForms.length ? answers.workForms : ["individual"];
  const notes = answers.oop.present ? oopSummary(answers, language) : "";
  return {
    workForms: forms,
    ...(forms.includes("group") || forms.includes("pair") ? { groups: answers.groups } : {}),
    oop: { present: answers.oop.present, ...(notes ? { notes } : {}) },
    ...(answers.value ? { value: answers.value } : {}),
    minutes: answers.minutes,
    slots: planKitSlots(answers, language),
  };
}

const STAGE_NAME: Record<StageKey, string> = { beginning: "Начало урока (beginning)", middle: "Середина урока (middle)", end: "Конец урока (end)" };
const FORM_NAME: Record<WorkForm, string> = { individual: "индивидуальная", pair: "парная", group: "групповая", frontal: "фронтальная" };

/**
 * Указания для ИИ по комплекту. Добавляются к пользовательскому промпту КСП; без
 * комплекта промпт прежний. Текст по-русски: это инструкция модели, а не текст плана.
 */
export function kitPromptSection(kit: LessonKit): string {
  const lines: string[] = ["", "=== КОМПЛЕКТ УРОКА (выбор учителя, обязателен) ==="];
  const forms = kit.workForms.map((form) => FORM_NAME[form]).join(", ");
  lines.push(`- Формы работы на уроке: ${forms}. Других форм не добавляй.`);
  if (kit.workForms.includes("group")) lines.push(`- Групповая работа: ровно ${kit.groups ?? 3} группы, у каждой своя карточка с ситуацией и заданиями. Опиши в teacherActions, как делим класс на группы, сколько минут работают, как группы представляют результат и как их оценивают.`);
  if (kit.workForms.includes("pair")) lines.push("- Парная работа: опиши задание для пар, время, взаимопроверку по критериям.");
  if (kit.minutes === 40) {
    lines.push("- Урок длится 40 минут: время этапов «1–8 мин», «9–32 мин», «33–40 мин» вместо 45-минутной разбивки.");
  }
  if (kit.oop?.present) {
    lines.push(`- В классе есть ученик с ООП${kit.oop.notes ? ` (${kit.oop.notes})` : ""}. На КАЖДОМ этапе в studentActions добавь отдельную строку «Ученик с ООП: …» с конкретной адаптацией задания и помощи. В evaluation.differentiation — отдельный абзац про ученика с ООП.`);
    if (kit.slots.some((slot) => slot.kind === "oop_sheet")) lines.push("- Ученик с ООП работает по своему облегчённому листу: «Лист для ученика с ООП».");
  }
  if (kit.value) lines.push(`- Ценность урока: «${kit.value}». Раскрой её через действия учеников на этапах и в поле values.`);
  const byStage = (["beginning", "middle", "end"] as StageKey[])
    .map((stage) => ({ stage, slots: kit.slots.filter((slot) => slot.stage === stage && slot.kind !== "deck") }))
    .filter((entry) => entry.slots.length > 0);
  if (byStage.length > 0) {
    lines.push("- Материалы, которые учитель получит вместе с КСП. Назови каждый в resources и в действиях своего этапа, опиши, как с ним работают и сколько минут:");
    for (const entry of byStage) lines.push(`  • ${STAGE_NAME[entry.stage]}: ${entry.slots.map((slot) => `«${slot.title}»`).join("; ")}`);
  }
  if (kit.slots.some((slot) => slot.kind === "deck")) lines.push("- К уроку будет презентация: на каждом этапе укажи в resources «Презентация к уроку» и что показываем на слайдах.");
  if (!kit.slots.some((slot) => slot.kind === "worksheet")) lines.push("- Рабочего листа на этом уроке нет: не упоминай его, 10 баллов распредели по заданиям этапов.");
  return lines.join("\n");
}

function activityFor(slot: MaterialSlot): LessonActivity | null {
  const form = PLACEMENT[slot.kind].form;
  return form ? { form, title: slot.title, slotId: slot.id } : null;
}

function withResource(resources: string, title: string): string {
  if (resources.toLowerCase().includes(title.toLowerCase())) return resources;
  return resources.trim() ? `${resources.trim()}\n${title}` : title;
}

/**
 * Связывает готовый КСП с комплектом: этап получает действия со ссылками на места
 * под материалы, а колонка «Ресурсы» — названия этих материалов. Возвращает копию.
 */
export function applyKitToContent(content: KspContent, kit: LessonKit): KspContent {
  const stages = { ...content.stages };
  const deck = kit.slots.find((slot) => slot.kind === "deck");
  for (const stage of ["beginning", "middle", "end"] as StageKey[]) {
    const current = stages[stage];
    const own = kit.slots.filter((slot) => slot.stage === stage && slot.kind !== "deck");
    let resources = current.resources ?? "";
    if (deck) resources = withResource(resources, deck.title);
    for (const slot of own) resources = withResource(resources, slot.title);
    const activities = own.map(activityFor).filter((activity): activity is LessonActivity => activity !== null);
    stages[stage] = { ...current, resources, ...(activities.length ? { activities } : {}) };
  }
  return { ...content, stages, kit };
}
