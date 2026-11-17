"use client";

import { useCallback, useRef, useState } from "react";
import { Download, Image as ImageIcon, Printer, Settings, X } from "lucide-react";
import type { Crossword, FlashcardSet, Handout, Worksheet, WorksheetTask } from "@/lib/handouts/types";
import { optionLetter, worksheetAnswerLines } from "@/lib/handouts/answers";
import { resolveErrorsCount, resolveTableRows } from "@/lib/handouts/layout";
// Сетка поиска слов берётся из того же модуля, что и печать: иначе на
// экране и на листе были бы разные головоломки.
import { buildWordSearchGrid } from "@/lib/handouts/word-search";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CardsSheet, WorksheetSheet } from "@/components/ksp/print-sheet";
import { downloadSheetImages } from "@/lib/handouts/sheet-export";
import { toOopSheet } from "@/lib/handouts/oop";
import { docTitle, docTopic, SaveKitButton } from "@/components/kits/save-kit-button";

/** Цветовая схема эталона РК (как в docx.ts): синие баннеры, персиковое облако, золото. */
const NAVY = "text-ink";


/**
 * Настройки предпросмотра.
 *
 * Перенесены из удалённого дубля `components/handouts/preview.tsx`: там была
 * панель, которой не было в работающем компоненте, и файл числился
 * мёртвым. Учителю нужен размер шрифта — лист с плотной вёрсткой плохо
 * читается первокласснику, а растянуть его в Word после скачивания нельзя.
 *
 * Настройки влияют только на предпросмотр и печать с экрана. Скачанный
 * .docx не меняется: его размеры задаёт Word. Это указано в подписи, иначе
 * учитель решит, что ползунок «сломал» скачанный файл.
 */
export interface PreviewSettings {
  fontSize: number;
  spacing: number;
  showAnswers: boolean;
  showDescriptors: boolean;
  showImages: boolean;
}

export const DEFAULT_SETTINGS: PreviewSettings = {
  fontSize: 14,
  spacing: 1,
  showAnswers: true,
  showDescriptors: true,
  showImages: true,
};

const SETTINGS_COPY = {
  ru: {
    title: "Настройки",
    fontSize: "Размер шрифта",
    spacing: "Отступы между заданиями",
    answers: "Ответы",
    descriptors: "Дескрипторы",
    images: "Картинки",
    show: "Показать",
    hide: "Скрыть",
    hint: "Влияет на предпросмотр и печать с экрана. Скачанный Word-файл не меняется.",
  },
  kz: {
    title: "Параметрлер",
    fontSize: "Қаріп өлшемі",
    spacing: "Тапсырмалар аралығы",
    answers: "Жауаптар",
    descriptors: "Дескрипторлар",
    images: "Суреттер",
    show: "Көрсету",
    hide: "Жасыру",
    hint: "Тек алдын ала қарау мен экраннан басып шығаруға әсер етеді. Жүктелген Word файлы өзгермейді.",
  },
} as const;

function SettingsPanel({
  settings,
  onChange,
  language,
}: {
  settings: PreviewSettings;
  onChange: (next: PreviewSettings) => void;
  language: "ru" | "kz";
}) {
  const copy = SETTINGS_COPY[language];
  // Отдельная функция вместо возврата JSX из стрелки: без имени у элемента
  // теряется имя компонента в стеке и в отладке React DevTools.
  function ToggleButton({ settingKey, label }: { settingKey: keyof PreviewSettings; label: string }) {
    return (
    <button
      type="button"
      onClick={() => onChange({ ...settings, [settingKey]: !settings[settingKey] } as PreviewSettings)}
      className={`print:hidden rounded px-2 py-1 text-xs ${
        settings[settingKey] ? "bg-ink text-white" : "bg-primary-soft text-foreground"
      }`}
    >
      {settings[settingKey] ? copy.show : copy.hide}
      <span className="sr-only"> — {label}</span>
    </button>
    );
  }
  const toggle = (key: keyof PreviewSettings, label: string) => (
    <ToggleButton settingKey={key} label={label} />
  );
  return (
    <div className="border-b border-border bg-muted px-4 py-3 print:hidden">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="preview-font-size">{copy.fontSize}</label>
          <input
            id="preview-font-size"
            type="range"
            min="11"
            max="20"
            value={settings.fontSize}
            onChange={(e) => onChange({ ...settings, fontSize: Number(e.target.value) })}
            className="w-full"
          />
          <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="preview-spacing">{copy.spacing}</label>
          <input
            id="preview-spacing"
            type="range"
            min="0.5"
            max="3"
            step="0.5"
            value={settings.spacing}
            onChange={(e) => onChange({ ...settings, spacing: Number(e.target.value) })}
            className="w-full"
          />
          <span className="text-xs text-muted-foreground">{settings.spacing}×</span>
        </div>
        <div>
          <span className="mb-1 block text-xs text-muted-foreground">{copy.answers}</span>
          {toggle("showAnswers", copy.answers)}
        </div>
        <div>
          <span className="mb-1 block text-xs text-muted-foreground">{copy.descriptors}</span>
          {toggle("showDescriptors", copy.descriptors)}
        </div>
        <div>
          <span className="mb-1 block text-xs text-muted-foreground">{copy.images}</span>
          {toggle("showImages", copy.images)}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{copy.hint}</p>
    </div>
  );
}

/**
 * Тело задания с выбранным учителем размером шрифта.
 *
 * Размер применяется обёрткой, а не в каждом из 19 типов заданий: иначе
 * ползунок настроек не влиял бы на текст внутри заданий, потому что там
 * жёстко заданы классы `text-sm`. Учитель двигал ползунок и ничего не
 * происходило.
 */
function TaskBody({ task, language, onLinkChange, fontSize }: {
  task: WorksheetTask;
  language: "ru" | "kz";
  onLinkChange?: (link: string) => void;
  fontSize?: number;
}) {
  return (
    <div style={fontSize ? { fontSize: `${fontSize}px` } : undefined}>
      <TaskBodyContent task={task} language={language} onLinkChange={onLinkChange} />
    </div>
  );
}

function TaskBodyContent({ task, language, onLinkChange }: {
  task: WorksheetTask;
  language: "ru" | "kz";
  onLinkChange?: (link: string) => void;
}) {
  const { t } = useUiLocale();
  const h = t.handouts;
  const label = language === "kz"
    ? { trueLabel: "Дұрыс", falseLabel: "Бұрыс", wordBank: "Сөздер банкі: ", sortWords: "Таратылатын сөздер: ", ownExample: "Өз мысалыңызды жазыңыз", caseLabel: "Жағдаят: ", problem: "Мәселе:", solution: "Шешімі:", why: "Неліктен іске асады:", qrSuffix: "әзірге жоқ", link: "Сілтеме:", linkPlaceholder: "https://…", linkEmpty: "Мұғалім сілтемені қосады", result: "Менің нәтижем:", workField: "Жауабыңызды осы жерге жазыңыз немесе суретін салыңыз" }
    : { trueLabel: h.trueLabel, falseLabel: h.falseLabel, wordBank: h.wordBank, sortWords: h.sortWords, ownExample: h.ownExample, caseLabel: h.caseLabel, problem: h.problemL, solution: h.solutionL, why: h.whyL, qrSuffix: h.qrSuffix, link: h.linkLabel, linkPlaceholder: h.linkPlaceholder, linkEmpty: h.linkEmpty, result: h.myResult, workField: h.workField };
  switch (task.type) {
    case "multiple_choice":
      return (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {(task.options ?? []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2 border border-border rounded px-2 py-1 text-sm bg-white">
              <span className={`font-bold ${NAVY}`}>{optionLetter(i)})</span>
              <span>{opt}</span>
            </div>
          ))}
        </div>
      );
    case "true_false":
      return (
        <div className="mt-2 flex gap-4 text-sm">
          <span className="border border-border rounded px-3 py-1">☐ {label.trueLabel}</span>
          <span className="border border-border rounded px-3 py-1">☐ {label.falseLabel}</span>
        </div>
      );
    case "match": {
      const options = task.options ?? [];
      const pairs = task.pairs ?? [];
      return (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {options.map((opt, i) => (
            <div key={i} className="contents">
              <div className="border border-border rounded px-2 py-1 bg-white">
                <b className={NAVY}>{i + 1}.</b> {opt}
              </div>
              <div className="border border-border rounded px-2 py-1 bg-white">
                <b className={NAVY}>{optionLetter(i)})</b> {pairs[i] ?? ""}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "fill_bank":
      return (
        <>
          <div className="mt-2 rounded border border-border bg-primary-soft px-3 py-2 text-sm">
            <b className={NAVY}>{label.wordBank}</b>
            {(task.wordBank ?? []).join("  ·  ")}
          </div>
          <div className="mt-2 space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="border-b-2 border-dashed border-border h-6" />
            ))}
          </div>
        </>
      );
    case "sort": {
      const items = task.items ?? [];
      const groups = task.groups ?? (language === "kz" ? ["1-топ", "2-топ"] : ["Группа 1", "Группа 2"]);
      return (
        <>
          <div className="mt-2 rounded border border-border bg-primary-soft px-3 py-2 text-sm">
            <b className={NAVY}>{label.sortWords}</b>
            {items.map((w, i) => `${i + 1}. ${w}`).join("  •  ")}
          </div>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-2 border-ink bg-ink text-white px-2 py-1 text-left">{groups[0]}</th>
                <th className="border-2 border-ink bg-ink text-white px-2 py-1 text-left">{groups[1]}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(3, Math.ceil(items.length / 2)) }).map((_, i) => (
                <tr key={i}>
                  <td className="border-2 border-ink px-2 py-1 h-7 text-muted-foreground text-xs">&nbsp;</td>
                  <td className="border-2 border-ink px-2 py-1 h-7 text-muted-foreground text-xs">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    }
    case "checklist":
      return (
        <>
          <div className="mt-2 space-y-1.5">
            {(task.options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2 border border-border rounded px-2 py-1 text-sm bg-white">
                <span className={`font-bold ${NAVY}`}>☐</span>
                <span>{opt}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-b-2 border-dashed border-border h-6 text-xs text-muted-foreground">{label.ownExample}</div>
        </>
      );
    case "case_study":
      return (
        <>
          <div className="mt-2 rounded-2xl border-2 border-border bg-warning-soft px-4 py-3 text-sm leading-relaxed">
          <b className="text-warning">{label.caseLabel}</b>
            {task.situation}
          </div>
          <div className="mt-2 space-y-2 text-sm">
            <div className="border-b-2 border-dashed border-border h-6 text-xs text-muted-foreground">{label.problem}</div>
            <div className="border-b-2 border-dashed border-border h-6 text-xs text-muted-foreground">{label.solution}</div>
            <div className="border-b-2 border-dashed border-border h-6 text-xs text-muted-foreground">{label.why}</div>
          </div>
        </>
      );
    case "compare":
      return null;
    case "table_fix":
      return (
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-2 border-ink bg-muted px-2 py-1 text-left">{task.tableHeaders?.[0] ?? (language === "kz" ? "Қате" : "Что сделано неправильно?")}</th>
              <th className="border-2 border-ink bg-muted px-2 py-1 text-left">{task.tableHeaders?.[1] ?? (language === "kz" ? "Түзету" : "Как исправить?")}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: resolveTableRows(task.tableRows) }).map((_, i) => (
              <tr key={i}>
                <td className="border-2 border-ink px-2 py-1 h-7">&nbsp;</td>
                <td className="border-2 border-ink px-2 py-1 h-7">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "scenario_fix":
      return (
        <>
          <div className="mt-2 rounded-2xl border-2 border-border bg-warning-soft px-4 py-3 text-sm leading-relaxed">
            {task.situation}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{language === "kz" ? `${resolveErrorsCount(task.errorsCount)} қатені тауып, «Қате → Түзету» жолдарын толтыр.` : `Ошибок найти: ${resolveErrorsCount(task.errorsCount)} — заполни строки «Ошибка → Исправление».`}</p>
          <table className="mt-1 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-2 border-ink bg-muted px-2 py-1 text-left">{language === "kz" ? "Қате" : "Ошибка"}</th>
                <th className="border-2 border-ink bg-muted px-2 py-1 text-left">{language === "kz" ? "Түзету" : "Исправление"}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: resolveErrorsCount(task.errorsCount) }).map((_, i) => (
                <tr key={i}>
                  <td className="border-2 border-ink px-2 py-1 h-7">&nbsp;</td>
                  <td className="border-2 border-ink px-2 py-1 h-7">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    case "choice_buttons":
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {(task.choices ?? []).map((c, i) => (
            <span key={i} className="px-3 py-1 rounded-lg bg-ink text-white text-sm font-medium shadow-sm">
              ☐ {c}
            </span>
          ))}
        </div>
      );
    case "reflection":
      return (
        <div className="mt-2 flex flex-wrap gap-6 justify-center">
          {["😊", "😐", "🙁"].map((smile, i) => (
            <div key={i} className="text-center">
              <div className="text-3xl">{smile}</div>
              <div className="text-xs mt-1 border border-border rounded px-2 py-0.5 bg-white">
                ☐ {task.reflectionOptions?.[i] ?? (language === "kz" ? ["Барлығын түсіндім", "Сұрағым бар", "Көмек керек"][i] : ["Всё понял(а)", "Есть сомнения", "Нужна помощь"][i])}
              </div>
            </div>
          ))}
        </div>
      );
    case "interactive":
      return (
        <div className="mt-2 flex items-start gap-3">
          {/* Рамка под QR-код: печатается, ученик сканирует с листа */}
          <div className="w-20 h-20 shrink-0 border-2 border-dashed border-ink rounded flex items-center justify-center text-[10px] text-center text-muted-foreground bg-white">
            QR-код{task.link ? "" : ` ${label.qrSuffix}`}
          </div>
          <div className="text-sm flex-1">
            {onLinkChange ? (
              <label className="mt-1 block text-xs">
                <b className={NAVY}>{label.link}</b>
                <input
                  type="url"
                  value={task.link ?? ""}
                  onChange={(e) => onLinkChange(e.target.value)}
                  placeholder={label.linkPlaceholder}
                  className="mt-1 w-full rounded border border-border px-2 py-1 text-xs print:hidden"
                />
                <span className="mt-1 hidden break-all print:block">
                  {task.link || label.linkEmpty}
                </span>
              </label>
            ) : (
              <p className="mt-1 text-xs break-all">
                <b className={NAVY}>{label.link}</b> {task.link ?? label.linkEmpty}
              </p>
            )}
            <div className="mt-1 border-b-2 border-dashed border-border h-6 text-xs text-muted-foreground">{label.result}</div>
          </div>
        </div>
      );
    case "creative":
      return (
        <div className="mt-2 h-36 rounded border-2 border-dashed border-ink bg-white flex items-center justify-center text-xs text-muted-foreground">
          {label.workField}
        </div>
      );
    // Дальше типы, которые печатаются в .docx, но в предпросмотре раньше
    // ничего не показывались: учитель видел заголовок задания с пустым
    // телом и решал, что материал не сгенерировался.
    case "word_search": {
      // Та же сетка, что и на печати: предпросмотр обязан совпадать с листом.
      const grid = buildWordSearchGrid(task.searchWords ?? []);
      return (
        <>
          <div className="mt-2 inline-block border border-ink">
            <table className="border-collapse">
              <tbody>
                {grid.cells.map((row, r) => (
                  <tr key={r}>
                    {row.map((letter, c) => (
                      <td
                        key={c}
                        className="w-7 h-7 border border-border text-center align-middle text-sm font-medium"
                      >
                        {letter}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {language === "kz" ? "Табылатын сөздер:" : "Найдите слова:"}{" "}
            {grid.placed.join(" · ")}
          </p>
          {grid.dropped.length > 0 && (
            <p className="mt-1 text-xs text-warning">
              {language === "kz"
                ? `Келесі сөздер торға сыймады: ${grid.dropped.join(", ")}`
                : `Следующие слова не поместились в сетку: ${grid.dropped.join(", ")}`}
            </p>
          )}
        </>
      );
    }
    case "ordering": {
      const items = task.orderItems ?? [];
      return (
        <>
          <div className="mt-2 rounded border border-border bg-primary-soft px-3 py-2 text-sm">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 py-0.5">
                <span className="w-6 shrink-0 rounded border border-border bg-white text-center text-xs leading-5">
                  {i + 1}
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1">
            {Array.from({ length: Math.max(4, items.length) }).map((_, i) => (
              <div key={i} className="border-b-2 border-dashed border-border h-6 text-xs text-muted-foreground">
                {i + 1}.
              </div>
            ))}
          </div>
        </>
      );
    }
    case "odd_one_out": {
      const items = task.oddItems ?? [];
      return (
        <>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-sm">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 border border-border rounded px-2 py-1 bg-white">
                <span className={`font-bold ${NAVY}`}>☐</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {language === "kz" ? "Қай элемент артық? Неліктен?" : "Какой элемент лишний? Почему?"}
          </p>
          <div className="border-b-2 border-dashed border-border h-6" />
        </>
      );
    }
    case "categorize": {
      const categories = task.categories ?? [];
      const items = task.categoryItems ?? [];
      return (
        <>
          <div className="mt-2 rounded border border-border bg-primary-soft px-3 py-2 text-sm">
            <b className={NAVY}>{language === "kz" ? "Сипаттамалар:" : "Элементы:"}</b>{" "}
            {items.join("  ·  ")}
          </div>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>
                {categories.map((category) => (
                  <th key={category} className="border-2 border-ink bg-ink text-white px-2 py-1 text-left">
                    {category}
                  </th>
                ))}
                {categories.length === 0 && (
                  <th className="border-2 border-ink bg-ink text-white px-2 py-1 text-left">
                    {language === "kz" ? "Категория" : "Категория"}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(3, Math.ceil(items.length / Math.max(1, categories.length))) }).map((_, i) => (
                <tr key={i}>
                  {(categories.length > 0 ? categories : [""]).map((category, c) => (
                    <td key={`${category}-${c}`} className="border-2 border-ink px-2 py-1 h-7">&nbsp;</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    }
    default:
      return null;
  }
}

function WorksheetView({
  sheet,
  onRegenerate,
  regenBusyIndex,
  onLinkChange,
  settings = DEFAULT_SETTINGS,
  meta,
  withKey = false,
}: {
  meta?: { grade: number; subject: string; footer?: string };
  withKey?: boolean;
  sheet: Worksheet;
  /** Точечная замена задания (тот же тип/этап/баллы). */
  onRegenerate?: (index: number) => void;
  regenBusyIndex?: number | null;
  onLinkChange?: (index: number, link: string) => void;
  settings?: PreviewSettings;
}) {
  const { locale, t } = useUiLocale();
  const h = t.handouts;
  const contentLanguage = sheet.language ?? (locale === "kk" ? "kz" : "ru");
  const kazakh = contentLanguage === "kz";
  const copy = kazakh
    ? { task: "Тапсырма", criterion: "Бағалау критерийі", descriptor: "Дескриптор", student: "Оқушының аты-жөні: ____", classDate: `Сынып: ____ Күні: ____`, answers: "Мұғалімге жауаптар", groups: ["1-топ", "2-топ"] as [string, string], taskN: "Тапсырма №", descriptors: "Бағалау дескрипторлары", answerDetails: "Жауаптар мен бағалау дескрипторларын көрсету" }
    : { task: "Задание", criterion: "Критерий оценивания", descriptor: "Дескриптор", student: "ФИО ученика: ____", classDate: "Класс: ____ Дата: ____", answers: "Ответы", groups: ["Группа 1", "Группа 2"] as [string, string], taskN: "Задание №", descriptors: h.descriptorsH, answerDetails: h.answersDetails };
  return (
    <div>
      {sheet.degraded && (
        <p className="mb-3 text-xs text-warning bg-warning-soft border border-warning/40 rounded px-3 py-2">
          {kazakh
            ? "AI қолжетімсіз болғандықтан, парақ жергілікті әдістемелік құрылыммен жасалды. Басып шығармас бұрын тапсырмаларды оқулық пен сабақ мақсаттарына сәйкестендіріңіз."
            : "ИИ сейчас недоступен, поэтому лист собран по локальной методической структуре. Перед печатью сверьте задания с учебником и целями урока."}
        </p>
      )}
      {sheet.imagesFailed && <DegradedNote text={IMAGES_FAILED_NOTE} />}
      <WorksheetSheet
        sheet={sheet}
        grade={meta?.grade}
        subject={meta?.subject}
        footer={meta?.footer}
        withKey={withKey}
        onRegenerate={onRegenerate}
        regeneratingIndex={regenBusyIndex}
        onLinkChange={onLinkChange}
        fallback={(task) => <TaskBody task={task} language={contentLanguage} fontSize={settings.fontSize} />}
      />

      {(settings.showAnswers || settings.showDescriptors) && (
      <details className="mt-8 border border-border rounded-lg overflow-hidden group print:hidden">
        <summary className="bg-muted text-foreground px-4 py-2 font-bold text-sm cursor-pointer hover:bg-muted">
          {copy.answerDetails}
        </summary>
        <div className="p-4 bg-white space-y-4">
          {settings.showAnswers && (
          <div>
          <h4 className="font-bold text-sm mb-2 text-ink">{copy.answers}</h4>
            <div className="text-sm space-y-1">
              {worksheetAnswerLines(sheet.tasks, contentLanguage).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
          )}
          {settings.showDescriptors && (
          <div>
            <h4 className="font-bold text-sm mb-2 text-ink">{copy.descriptors}</h4>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="p-2 font-bold border-r border-border">{kazakh ? "Тапсырма" : h.thTask}</th>
                  <th className="p-2 font-bold border-r border-border">{kazakh ? "Критерий" : h.thCriterion}</th>
                  <th className="p-2 font-bold">{kazakh ? "Дескриптор" : h.thDescriptor}</th>
                </tr>
              </thead>
              <tbody>
                {sheet.tasks.map((task, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="p-2 border-r border-border">{copy.taskN}{i + 1} ({task.points}б)</td>
                    <td className="p-2 border-r border-border">{task.criterion}</td>
                    <td className="p-2">{task.descriptor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </details>
      )}
    </div>
  );
}

/**
 * Пометка о материале, собранном без AI.
 *
 * Формулировки таких карточек и кроссворда — заготовки по словам темы, а не
 * готовый ответ. Учитель должен видеть это до печати, иначе он раздаёт
 * ученикам непроверенный текст.
 */
const IMAGES_FAILED_NOTE = "Сервис картинок сейчас не ответил, поэтому материал собран без иллюстраций. Его можно печатать и так или создать заново позже.";

function DegradedNote({ text }: { text: string }) {
  return (
    <p className="mb-3 print:hidden text-xs text-warning bg-warning-soft border border-warning/40 rounded px-3 py-2">
      {text}
    </p>
  );
}

function FlashcardsView({ set }: { set: FlashcardSet }) {
  return (
    <div>
      {set.degraded && (
        <DegradedNote text={set.language === "kz"
          ? "ЖИ қолжетімсіз болғандықтық, карточкалар тақырыптағы сөздерден құрастырылды. Мәтіндерді оқулық бойынша тексеріп, нақтылаңыз."
          : "ИИ сейчас недоступен, поэтому карточки собраны из слов темы. Проверьте формулировки по учебнику и дополните их перед печатью."} />
      )}
      {set.imagesFailed && <DegradedNote text={IMAGES_FAILED_NOTE} />}
      <CardsSheet set={set} />
    </div>
  );
}

function CrosswordView({ puzzle }: { puzzle: Crossword }) {
  const { t } = useUiLocale();
  const h = t.handouts;
  const label = puzzle.language === "kz"
    ? { across: "Көлденеңінен", down: "Тігінен", answers: "Мұғалімге жауаптар (көрсету үшін басыңыз)", unplaced: "Торға сыймады:", letters: "әріп" }
    : { across: h.across, down: h.down, answers: h.crosswordAnswers, unplaced: h.unplaced, letters: h.letters };
  // Ученическая сетка: клетки пустые, буквы — только в ответах для учителя.
  const filled = new Set(puzzle.numbers.map((n) => `${n.row},${n.col}`));
  return (
    <div>
      {puzzle.degraded && (
        <DegradedNote text={puzzle.language === "kz"
          ? "ЖИ қолжетімсіз болғандықтық, сөздер тақырыптан алынды. Оқулықтағы терминдермен алмастырыңыз."
          : "ИИ сейчас недоступен, поэтому слова взяты из темы урока. Замените их на термины из учебника, если это нужно."} />
      )}
      <h3 className="text-lg font-bold text-center">{puzzle.title}</h3>
      {puzzle.intro && <p className="mt-1 text-sm text-center text-muted-foreground">{puzzle.intro}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="border-collapse mx-auto">
          <tbody>
            {puzzle.grid.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`w-7 h-7 border text-center text-sm font-bold ${cell ? "border-ink bg-white" : "border-transparent"}`}
                  >
                    {cell && filled.has(`${r},${c}`) ? (
                      <span className="text-[10px] text-muted-foreground">{puzzle.numbers.find((n) => n.row === r && n.col === c)?.number}</span>
                    ) : (
                      ""
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <div className="font-bold mb-1 text-ink">{label.across}</div>
          <ol className="list-decimal list-inside space-y-1">
            {puzzle.placed.filter((w) => w.direction === "across").map((w) => (
              <li key={`a${w.number}`}>
                <b>{w.number}.</b> {w.clue} ({w.word.length} {label.letters})
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="font-bold mb-1 text-ink">{label.down}</div>
          <ol className="list-decimal list-inside space-y-1">
            {puzzle.placed.filter((w) => w.direction === "down").map((w) => (
              <li key={`d${w.number}`}>
                <b>{w.number}.</b> {w.clue} ({w.word.length} {label.letters})
              </li>
            ))}
          </ol>
        </div>
      </div>
      {puzzle.unplaced.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {label.unplaced} {puzzle.unplaced.map((w) => w.word).join(", ")}
        </p>
      )}
      <details className="mt-4 border border-border rounded-lg overflow-hidden print:hidden">
        <summary className="bg-muted text-foreground px-4 py-2 font-bold text-sm cursor-pointer hover:bg-muted">
          {label.answers}
        </summary>
        <div className="p-4 bg-white text-sm space-y-1">
          {puzzle.placed.map((w) => (
            <div key={`${w.direction}${w.number}`}>
              <b>{w.number}.</b> {w.word} — {w.clue}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export function HandoutPreview({
  handout,
  extra,
  title,
  fileName,
  docxBase64,
  onClose,
  meta,
  initialVariant = "student",
}: {
  /** С какого вида открыть лист: ученику, с ответами или для ученика с ООП. */
  initialVariant?: "student" | "key" | "oop";
  handout: Handout;
  /** Второй материал комплекта (памятки после листа) — показывается ниже с разделителем. */
  extra?: Handout;
  title?: string;
  fileName?: string;
  docxBase64?: string;
  onClose: () => void;
  /** Контекст для точечной перегенерации заданий. */
  meta?: { topic: string; subject: string; grade: number; language: "ru" | "kz"; footer?: string };
}) {
  const { t } = useUiLocale();
  const h = t.handouts;
  const [doc, setDoc] = useState<Handout>(handout);
  const [extraDoc, setExtraDoc] = useState<Handout | null>(extra ?? null);
  const [regenBusy, setRegenBusy] = useState<{ part: "main" | "extra"; index: number } | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PreviewSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  // Один лист в трёх видах, как в папке учителя: ученику, с ответами красным, для ученика с ООП.
  const [variant, setVariant] = useState<"student" | "key" | "oop">(initialVariant);
  const withKey = variant === "key";
  const shown = useCallback((sheet: Worksheet) => (variant === "oop" ? toOopSheet(sheet) : sheet), [variant]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  async function saveImages() {
    if (!sheetRef.current) return;
    setSaving(true);
    setPrintError(null);
    try {
      await downloadSheetImages(sheetRef.current, (fileName ?? "Лист").replace(/\.docx$/i, ""));
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : h.downloadFailed);
    } finally {
      setSaving(false);
    }
  }

  // Новый сгенерированный материал — сбрасываем правки (корректировка
  // состояния при рендере: новый объект handout означает новую генерацию).
  const [prevHandout, setPrevHandout] = useState(handout);
  const [prevExtra, setPrevExtra] = useState(extra);
  if (prevHandout !== handout || prevExtra !== extra) {
    setPrevHandout(handout);
    setPrevExtra(extra);
    setDoc(handout);
    setExtraDoc(extra ?? null);
    setRegenBusy(null);
    setRegenError(null);
  }

  function patchTask(part: "main" | "extra", index: number, patch: Partial<WorksheetTask>) {
    const apply = (h: Handout): Handout => {
      if (h.kind !== "worksheet") return h;
      return { ...h, tasks: h.tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)) };
    };
    if (part === "main") setDoc((d) => apply(d));
    else setExtraDoc((d) => (d ? apply(d) : d));
  }

  /** Точечная замена задания: тот же тип/этап/баллы, остальное не трогаем. */
  async function regenerateTask(part: "main" | "extra", index: number) {
    const source = part === "main" ? doc : extraDoc;
    if (!source || source.kind !== "worksheet") return;
    const current = source.tasks[index];
    if (!current) return;
    setRegenBusy({ part, index });
    setRegenError(null);
    try {
      const res = await fetch("/api/handouts/regenerate-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: meta?.topic ?? source.title.replace(/^Рабочий лист:\s*/, ""),
          subject: meta?.subject ?? "",
          grade: meta?.grade ?? 5,
          language: meta?.language ?? "ru",
          type: current.type,
          stage: current.stage ?? "middle",
          points: current.points,
          avoidPrompts: source.tasks.filter((_, i) => i !== index).map((t) => t.prompt),
          kspContext: source.learningObjectives?.length
            ? { learningObjectives: source.learningObjectives, assessmentCriteria: [], stages: [] }
            : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.task) throw new Error(data?.error || h.regenFailed);
      patchTask(part, index, data.task as WorksheetTask);
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : h.regenFailed);
    } finally {
      setRegenBusy(null);
    }
  }

  /** Скачивание актуального состояния (с учётом правок) через print-роут. */
  const downloadDoc = useCallback(async (includeAnswers: boolean) => {
    setPrinting(true);
    setPrintError(null);
    try {
      const res = await fetch("/api/handouts/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handout: doc.kind === "worksheet" ? shown(doc) : doc,
          extra: extraDoc?.kind === "worksheet" ? shown(extraDoc) : extraDoc ?? undefined,
          includeAnswers,
          fileName:
            (fileName ?? "handout.docx").replace(/\.docx$/i, "") +
            (variant === "oop" ? " — ООП.docx" : includeAnswers ? ".docx" : " — ученикам.docx"),
        }),
      });
      if (!res.ok) throw new Error("Не удалось собрать документ");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (fileName ?? "handout.docx").replace(/\.docx$/i, "") +
        (variant === "oop" ? " — ООП.docx" : includeAnswers ? ".docx" : " — ученикам.docx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: исходный файл генерации (без правок), если он есть.
      if (includeAnswers && docxBase64) {
        const bytes = Uint8Array.from(atob(docxBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName ?? "handout.docx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        setPrintError(h.downloadFailed);
      }
    } finally {
      setPrinting(false);
    }
  }, [doc, extraDoc, fileName, docxBase64, h.downloadFailed, variant, shown]);

  const showStudentButton = doc.kind !== "flashcards" || (extraDoc != null && extraDoc.kind !== "flashcards");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-[880px] rounded-xl bg-white shadow-2xl print:shadow-none"
        overlayClassName="overflow-y-auto p-4"
        aria-label={h.previewTitle}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border bg-[#6d3bea] text-white rounded-t-xl print:hidden">
          <DialogTitle className="font-bold text-sm sm:text-base">{title ?? h.previewTitle}</DialogTitle>
          <div className="flex flex-wrap items-center justify-end gap-2 [&>*]:whitespace-nowrap">
            <button
              type="button"
              onClick={() => setShowSettings((open) => !open)}
              aria-expanded={showSettings}
              aria-controls="preview-settings"
              title={(doc.language ?? "ru") === "kz" ? "Параметрлер" : "Настройки"}
              className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1.5 text-sm hover:bg-white/25 print:hidden"
            >
              <Settings className="w-4 h-4" />
              <span className="sr-only">{(doc.language ?? "ru") === "kz" ? "Параметрлер" : "Настройки"}</span>
            </button>
            {doc.kind !== "crossword" && (
              <button
                type="button"
                onClick={saveImages}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-white text-[#5a2cd0] px-3 py-1.5 text-sm font-bold hover:bg-violet-100 disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4" />
                {saving ? "Сохраняем…" : "Картинка PNG"}
              </button>
            )}
            {doc.kind === "worksheet" && (
              <div role="radiogroup" aria-label="Вид листа" className="inline-flex rounded-md bg-white/15 p-0.5 text-sm font-medium">
                {([["student", "Ученику"], ["key", "С ответами"], ["oop", "ООП"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={variant === value}
                    onClick={() => setVariant(value)}
                    className={`rounded px-2.5 py-1 ${variant === value ? "bg-white text-[#5a2cd0]" : "text-white hover:bg-white/10"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => downloadDoc(true)}
              disabled={printing}
              className="inline-flex items-center gap-1.5 rounded-md bg-white text-ink px-3 py-1.5 text-sm font-medium hover:bg-violet-100 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {printing ? h.building : h.teacherBtn}
            </button>
            {showStudentButton && (
              <button
                type="button"
                onClick={() => downloadDoc(false)}
                disabled={printing}
                title={h.studentBtnHint}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 text-white px-3 py-1.5 text-sm font-medium hover:bg-white/25 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {printing ? h.building : h.studentBtn}
              </button>
            )}
            {/* Печать с экрана. Раньше кнопки не было: учитель открывал
                предпросмотр в браузере, печатал его и получал страницу
                с рамками диалога и обрезанными карточками. */}
            <button
              type="button"
              onClick={() => window.print()}
              title={h.printBtn}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 text-white px-3 py-1.5 text-sm font-medium hover:bg-white/25 print:hidden"
            >
              <Printer className="w-4 h-4" />
              {h.printBtn}
            </button>
            <SaveKitButton
              handout={doc}
              extra={extraDoc}
              title={title ?? docTitle(doc)}
              topic={docTopic(doc)}
            />
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1.5 text-sm hover:bg-white/25"
              aria-label={h.close}
            >
              <X className="w-4 h-4" />
              {h.close}
            </button>
          </div>
        </div>
        {printError && (
          <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{printError}</p>
        )}
        {regenError && (
          <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{regenError}</p>
        )}
        {showSettings && (
          <div id="preview-settings">
            <SettingsPanel
              settings={settings}
              onChange={setSettings}
              language={doc.language ?? "ru"}
            />
          </div>
        )}
        <div ref={sheetRef} className="p-4 sm:p-6 print:p-0">
          {doc.kind === "worksheet" && (
            <WorksheetView
              sheet={shown(doc)}
              onRegenerate={variant === "oop" ? undefined : (index) => regenerateTask("main", index)}
              regenBusyIndex={regenBusy?.part === "main" ? regenBusy.index : null}
              onLinkChange={variant === "oop" ? undefined : (index, link) => patchTask("main", index, { link })}
              settings={settings}
              meta={meta}
              withKey={withKey}
            />
          )}
          {doc.kind === "flashcards" && <FlashcardsView set={doc} />}
          {doc.kind === "crossword" && <CrosswordView puzzle={doc} />}
          {extraDoc && (
            <div className="mt-8 border-t-2 border-dashed border-border pt-6">
              {extraDoc.kind === "worksheet" && (
                <WorksheetView
                  sheet={shown(extraDoc)}
                  onRegenerate={variant === "oop" ? undefined : (index) => regenerateTask("extra", index)}
                  regenBusyIndex={regenBusy?.part === "extra" ? regenBusy.index : null}
                  onLinkChange={variant === "oop" ? undefined : (index, link) => patchTask("extra", index, { link })}
                  settings={settings}
                  meta={meta}
                  withKey={withKey}
                />
              )}
              {extraDoc.kind === "flashcards" && <FlashcardsView set={extraDoc} />}
              {extraDoc.kind === "crossword" && <CrosswordView puzzle={extraDoc} />}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
