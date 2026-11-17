"use client";

import { Check, FileText, Grid3x3, HeartHandshake, Layers, LayoutGrid, MonitorPlay, User, Users, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LESSON_VALUES, OOP_NEEDS, kitAnswersSchema, type KitAnswers, type OopNeed } from "@/lib/materials/kit";
import type { MaterialKind } from "@/lib/types/ksp";
import s from "./lesson-kit-picker.module.css";

type Locale = "ru" | "kz";
type Form = KitAnswers["workForms"][number];

const COPY = {
  ru: {
    title: "Что будет на уроке",
    forms: "Формы работы",
    // Мягкий перенос: на телефоне слово шире плитки.
    form: { individual: ["Индивиду­альная", "Каждый сам"], pair: ["Парная", "Работа в парах"], group: ["Групповая", "Работа в группах"] },
    groups: "Сколько групп",
    oop: "Ученики с ООП",
    oopNo: "Нет",
    oopYes: "Есть",
    oopNeeds: { vision: "Зрение", hearing: "Слух", zpr: "ЗПР", speech: "Речь", other: "Другое" },
    oopNotes: "Что важно учесть (необязательно)",
    oopNotesHint: "Например: быстро устаёт, нужен крупный шрифт",
    materials: "Материалы к уроку",
    material: {
      worksheet: ["Рабочий лист", "Задания на 10 баллов"],
      oop_sheet: ["Лист ООП", "Облегчённый вариант"],
      cards: ["Карточки", "Для пар и групп"],
      crossword: ["Кроссворд", "Термины урока"],
      flashcards: ["В тетрадь", "Карточки-памятки"],
      deck: ["Презентация", "Слайды к уроку"],
    },
    needOop: "Отметьте ученика с ООП",
    needForm: "Выберите пары или группы",
    value: "Ценность урока",
    valueAuto: "Подберёт ИИ по теме",
    minutes: "Длительность",
    min: "мин",
  },
  kz: {
    title: "Сабақта не болады",
    forms: "Жұмыс түрлері",
    form: { individual: ["Жеке", "Әркім өзі"], pair: ["Жұптық", "Жұпта жұмыс"], group: ["Топтық", "Топта жұмыс"] },
    groups: "Неше топ",
    oop: "ЕБҚ оқушылары",
    oopNo: "Жоқ",
    oopYes: "Бар",
    oopNeeds: { vision: "Көру", hearing: "Есту", zpr: "ПДТ", speech: "Сөйлеу", other: "Басқа" },
    oopNotes: "Нені ескеру керек (міндетті емес)",
    oopNotesHint: "Мысалы: тез шаршайды, ірі қаріп керек",
    materials: "Сабақ материалдары",
    material: {
      worksheet: ["Жұмыс парағы", "10 балдық тапсырмалар"],
      oop_sheet: ["ЕБҚ парағы", "Жеңілдетілген нұсқа"],
      cards: ["Карточкалар", "Жұп пен топқа"],
      crossword: ["Сөзжұмбақ", "Сабақ терминдері"],
      flashcards: ["Дәптерге", "Жадынама карточкалар"],
      deck: ["Презентация", "Сабақ слайдтары"],
    },
    needOop: "ЕБҚ оқушысын белгілеңіз",
    needForm: "Жұп немесе топты таңдаңыз",
    value: "Сабақ құндылығы",
    valueAuto: "Тақырып бойынша ЖИ таңдайды",
    minutes: "Ұзақтығы",
    min: "мин",
  },
} as const;

const FORMS: Array<{ id: Form; icon: LucideIcon; tone: string }> = [
  { id: "individual", icon: User, tone: "violet" },
  { id: "pair", icon: Users, tone: "blue" },
  { id: "group", icon: UsersRound, tone: "green" },
];

type MaterialTile = "worksheet" | "oop_sheet" | "cards" | "crossword" | "flashcards" | "deck";
const MATERIALS: Array<{ id: MaterialTile; icon: LucideIcon; tone: string }> = [
  { id: "worksheet", icon: FileText, tone: "violet" },
  { id: "oop_sheet", icon: HeartHandshake, tone: "pink" },
  { id: "cards", icon: LayoutGrid, tone: "green" },
  { id: "crossword", icon: Grid3x3, tone: "blue" },
  { id: "flashcards", icon: Layers, tone: "peach" },
  { id: "deck", icon: MonitorPlay, tone: "violet" },
];

/** Карточки для пар и групп — одна плитка: вид карточек зависит от выбранных форм работы. */
const CARD_KINDS: MaterialKind[] = ["group_cards", "pair_cards"];

export const DEFAULT_KIT: KitAnswers = kitAnswersSchema.parse({});
const LAST_KIT_KEY = "mekty:last-kit";

/** Прошлый выбор учителя: обычно уроки у одного учителя похожи. */
export function readLastKit(): KitAnswers {
  if (typeof window === "undefined") return DEFAULT_KIT;
  try {
    const parsed = kitAnswersSchema.safeParse(JSON.parse(localStorage.getItem(LAST_KIT_KEY) ?? "null") ?? {});
    // ООП зависит от класса, а не от учителя: каждый раз спрашиваем заново.
    return parsed.success ? { ...parsed.data, oop: DEFAULT_KIT.oop } : DEFAULT_KIT;
  } catch {
    return DEFAULT_KIT;
  }
}

export function rememberKit(kit: KitAnswers) {
  try {
    localStorage.setItem(LAST_KIT_KEY, JSON.stringify(kit));
  } catch {
    // Память о выборе необязательна.
  }
}

function toggle<T>(list: readonly T[], item: T, on: boolean): T[] {
  return on ? (list.includes(item) ? [...list] : [...list, item]) : list.filter((x) => x !== item);
}

function Tile({ icon: Icon, tone, title, hint, pressed, disabled, onClick }: { icon: LucideIcon; tone: string; title: string; hint: string; pressed: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={s.tile} data-tone={tone} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      <span className={s.gem} aria-hidden="true">
        <span className={s.gemBack} />
        <span className={s.gemFace}><Icon /><span className={s.check}><Check /></span></span>
      </span>
      <span className={s.tileText}>
        <b>{title}</b>
        <small>{hint}</small>
      </span>
    </button>
  );
}

function Segmented<T extends string | number>({ label, options, value, onChange }: { label: string; options: Array<{ value: T; text: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className={s.segmented} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>
          {option.text}
        </button>
      ))}
    </div>
  );
}

/**
 * Вопросы перед КСП: формы работы, ООП, материалы, ценность, длительность.
 * По умолчанию всё уже выбрано разумно, поэтому «Создать урок» можно нажать сразу.
 */
export function LessonKitPicker({ value, onChange, locale, lessonLanguage }: { value: KitAnswers; onChange: (next: KitAnswers) => void; locale: Locale; lessonLanguage: Locale }) {
  const t = COPY[locale];
  const forms = value.workForms;
  const hasCollab = forms.includes("pair") || forms.includes("group");
  const update = (patch: Partial<KitAnswers>) => onChange({ ...value, ...patch });

  function setForm(form: Form) {
    const adding = !forms.includes(form);
    const next = toggle(forms, form, adding);
    // Без формы работы урока не бывает: последнюю выключить нельзя.
    if (next.length === 0) return;
    // Пары и группы работают по карточкам: включаем их сразу, учитель может снять.
    const startsCollab = adding && form !== "individual" && !hasCollab;
    update({ workForms: next, ...(startsCollab ? { materials: CARD_KINDS.reduce((list, kind) => toggle(list, kind, true), value.materials) } : {}) });
  }

  function isOn(tile: MaterialTile): boolean {
    if (tile === "cards") return CARD_KINDS.some((kind) => value.materials.includes(kind));
    return value.materials.includes(tile);
  }

  function setMaterial(tile: MaterialTile) {
    const on = !isOn(tile);
    const kinds: MaterialKind[] = tile === "cards" ? CARD_KINDS : [tile];
    update({ materials: kinds.reduce<MaterialKind[]>((list, kind) => toggle(list, kind, on), value.materials) });
  }

  function setOop(present: boolean) {
    // Ученик с ООП сразу получает свой лист, если урок с рабочим листом.
    const materials = present && value.materials.includes("worksheet") ? toggle(value.materials, "oop_sheet", true) : value.materials;
    update({ oop: { ...value.oop, present }, materials });
  }

  const needs = value.oop.needs as OopNeed[];

  return (
    <section className={s.kit} aria-labelledby="kit-title">
      <h3 id="kit-title" className={s.kitTitle}>{t.title}</h3>

      <fieldset className={s.group}>
        <legend>{t.forms}</legend>
        <div className={s.tiles3}>
          {FORMS.map(({ id, icon, tone }) => (
            <Tile key={id} icon={icon} tone={tone} title={t.form[id][0]} hint={t.form[id][1]} pressed={forms.includes(id)} onClick={() => setForm(id)} />
          ))}
        </div>
        {forms.includes("group") && (
          <div className={s.inline}>
            <span>{t.groups}</span>
            <Segmented label={t.groups} value={value.groups} onChange={(groups) => update({ groups })} options={[2, 3, 4].map((n) => ({ value: n, text: String(n) }))} />
          </div>
        )}
      </fieldset>

      <fieldset className={s.group}>
        <legend>{t.oop}</legend>
        <Segmented label={t.oop} value={value.oop.present ? "yes" : "no"} onChange={(v) => setOop(v === "yes")} options={[{ value: "no", text: t.oopNo }, { value: "yes", text: t.oopYes }]} />
        {value.oop.present && (
          <div className={s.oop}>
            <div className={s.chips}>
              {OOP_NEEDS.map((need) => (
                <button key={need} type="button" className={s.chip} aria-pressed={needs.includes(need)} onClick={() => update({ oop: { ...value.oop, needs: toggle(needs, need, !needs.includes(need)) } })}>
                  {t.oopNeeds[need]}
                </button>
              ))}
            </div>
            <label className={s.notes}>
              <span>{t.oopNotes}</span>
              <input value={value.oop.notes ?? ""} maxLength={300} placeholder={t.oopNotesHint} onChange={(e) => update({ oop: { ...value.oop, notes: e.target.value } })} />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className={s.group}>
        <legend>{t.materials}</legend>
        <div className={s.tiles3}>
          {MATERIALS.map(({ id, icon, tone }) => {
            const blocked = (id === "oop_sheet" && !value.oop.present) || (id === "cards" && !hasCollab);
            return (
              <Tile
                key={id}
                icon={icon}
                tone={tone}
                title={t.material[id][0]}
                hint={blocked ? (id === "oop_sheet" ? t.needOop : t.needForm) : t.material[id][1]}
                pressed={!blocked && isOn(id)}
                disabled={blocked}
                onClick={() => setMaterial(id)}
              />
            );
          })}
        </div>
      </fieldset>

      <div className={s.row}>
        <label className={s.select}>
          <span>{t.value}</span>
          <select value={value.value ?? ""} onChange={(e) => update({ value: e.target.value || undefined })}>
            <option value="">{t.valueAuto}</option>
            {LESSON_VALUES[lessonLanguage].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className={s.select}>
          <span>{t.minutes}</span>
          <Segmented label={t.minutes} value={value.minutes} onChange={(minutes) => update({ minutes })} options={[45, 40].map((n) => ({ value: n as 40 | 45, text: `${n} ${t.min}` }))} />
        </div>
      </div>
    </section>
  );
}
