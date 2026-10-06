"use client";

import { useCallback, useState } from "react";
import { Download, X } from "lucide-react";
import type { Crossword, FlashcardSet, Handout, Worksheet, WorksheetTask } from "@/lib/handouts/types";
import { optionLetter, worksheetAnswerLines, worksheetTypeLabel } from "@/lib/handouts/answers";
import { resolveErrorsCount, resolveTableRows } from "@/lib/handouts/layout";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { docTitle, docTopic, SaveKitButton } from "@/components/kits/save-kit-button";

/** Цветовая схема эталона РК (как в docx.ts): синие баннеры, персиковое облако, золото. */
const NAVY = "text-[#2B2D83]";
const FLASHCARD_ACCENTS = [
  { top: "bg-[#2B2D83]", soft: "bg-[#EEF4FF]", line: "border-[#9FC5FF]", badge: "bg-[#F6A92D]" },
  { top: "bg-[#13795B]", soft: "bg-[#EDFAF4]", line: "border-[#8DDBBF]", badge: "bg-[#E8568B]" },
  { top: "bg-[#7C3F98]", soft: "bg-[#F8F0FF]", line: "border-[#D7AAEF]", badge: "bg-[#F29B38]" },
  { top: "bg-[#A54A16]", soft: "bg-[#FFF5ED]", line: "border-[#F0BE96]", badge: "bg-[#277DA1]" },
] as const;

function imageUrl(base64: string, mime?: string): string {
  return `data:${mime || "image/jpeg"};base64,${base64}`;
}

function TaskBody({ task, language, onLinkChange }: { task: WorksheetTask; language: "ru" | "kz"; onLinkChange?: (link: string) => void }) {
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
            <div key={i} className="flex items-center gap-2 border border-slate-300 rounded px-2 py-1 text-sm bg-white">
              <span className={`font-bold ${NAVY}`}>{optionLetter(i)})</span>
              <span>{opt}</span>
            </div>
          ))}
        </div>
      );
    case "true_false":
      return (
        <div className="mt-2 flex gap-4 text-sm">
          <span className="border border-slate-300 rounded px-3 py-1">☐ {label.trueLabel}</span>
          <span className="border border-slate-300 rounded px-3 py-1">☐ {label.falseLabel}</span>
        </div>
      );
    case "match": {
      const options = task.options ?? [];
      const pairs = task.pairs ?? [];
      return (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {options.map((opt, i) => (
            <div key={i} className="contents">
              <div className="border border-slate-300 rounded px-2 py-1 bg-white">
                <b className={NAVY}>{i + 1}.</b> {opt}
              </div>
              <div className="border border-slate-300 rounded px-2 py-1 bg-white">
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
          <div className="mt-2 rounded border border-[#C77F42] bg-[#FFF2CC] px-3 py-2 text-sm">
            <b className={NAVY}>{label.wordBank}</b>
            {(task.wordBank ?? []).join("  ·  ")}
          </div>
          <div className="mt-2 space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="border-b-2 border-dashed border-slate-400 h-6" />
            ))}
          </div>
        </>
      );
    case "sort": {
      const items = task.items ?? [];
      const groups = task.groups ?? (language === "kz" ? ["1-топ", "2-топ"] : ["Группа 1", "Группа 2"]);
      return (
        <>
          <div className="mt-2 rounded border border-[#C77F42] bg-[#FFF2CC] px-3 py-2 text-sm">
            <b className={NAVY}>{label.sortWords}</b>
            {items.map((w, i) => `${i + 1}. ${w}`).join("  •  ")}
          </div>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-2 border-[#2B2D83] bg-[#3D6DB5] text-white px-2 py-1 text-left">{groups[0]}</th>
                <th className="border-2 border-[#2B2D83] bg-[#3D6DB5] text-white px-2 py-1 text-left">{groups[1]}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(3, Math.ceil(items.length / 2)) }).map((_, i) => (
                <tr key={i}>
                  <td className="border-2 border-[#2B2D83] px-2 py-1 h-7 text-slate-400 text-xs">&nbsp;</td>
                  <td className="border-2 border-[#2B2D83] px-2 py-1 h-7 text-slate-400 text-xs">&nbsp;</td>
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
              <div key={i} className="flex items-center gap-2 border border-slate-300 rounded px-2 py-1 text-sm bg-white">
                <span className={`font-bold ${NAVY}`}>☐</span>
                <span>{opt}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{label.ownExample}</div>
        </>
      );
    case "case_study":
      return (
        <>
          <div className="mt-2 rounded-2xl border-2 border-[#C77F42] bg-[#F6C89F] px-4 py-3 text-sm leading-relaxed">
          <b className="text-[#7A3E12]">{label.caseLabel}</b>
            {task.situation}
          </div>
          <div className="mt-2 space-y-2 text-sm">
            <div className="border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{label.problem}</div>
            <div className="border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{label.solution}</div>
            <div className="border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{label.why}</div>
          </div>
        </>
      );
    case "table_fix":
      return (
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-2 border-[#2B2D83] bg-[#D9D9D9] px-2 py-1 text-left">{task.tableHeaders?.[0] ?? (language === "kz" ? "Қате" : "Что сделано неправильно?")}</th>
              <th className="border-2 border-[#2B2D83] bg-[#D9D9D9] px-2 py-1 text-left">{task.tableHeaders?.[1] ?? (language === "kz" ? "Түзету" : "Как исправить?")}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: resolveTableRows(task.tableRows) }).map((_, i) => (
              <tr key={i}>
                <td className="border-2 border-[#2B2D83] px-2 py-1 h-7">&nbsp;</td>
                <td className="border-2 border-[#2B2D83] px-2 py-1 h-7">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "scenario_fix":
      return (
        <>
          <div className="mt-2 rounded-2xl border-2 border-[#C77F42] bg-[#F6C89F] px-4 py-3 text-sm leading-relaxed">
            {task.situation}
          </div>
          <p className="mt-2 text-xs text-slate-600">{language === "kz" ? `${resolveErrorsCount(task.errorsCount)} қатені тауып, «Қате → Түзету» жолдарын толтыр.` : `Ошибок найти: ${resolveErrorsCount(task.errorsCount)} — заполни строки «Ошибка → Исправление».`}</p>
          <table className="mt-1 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-2 border-[#2B2D83] bg-[#D9D9D9] px-2 py-1 text-left">{language === "kz" ? "Қате" : "Ошибка"}</th>
                <th className="border-2 border-[#2B2D83] bg-[#D9D9D9] px-2 py-1 text-left">{language === "kz" ? "Түзету" : "Исправление"}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: resolveErrorsCount(task.errorsCount) }).map((_, i) => (
                <tr key={i}>
                  <td className="border-2 border-[#2B2D83] px-2 py-1 h-7">&nbsp;</td>
                  <td className="border-2 border-[#2B2D83] px-2 py-1 h-7">&nbsp;</td>
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
            <span key={i} className="px-3 py-1 rounded-lg bg-[#3D6DB5] text-white text-sm font-medium shadow-sm">
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
              <div className="text-xs mt-1 border border-slate-300 rounded px-2 py-0.5 bg-white">
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
          <div className="w-20 h-20 shrink-0 border-2 border-dashed border-[#2B2D83] rounded flex items-center justify-center text-[10px] text-center text-slate-500 bg-white">
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
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs print:hidden"
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
            <div className="mt-1 border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{label.result}</div>
          </div>
        </div>
      );
    case "creative":
      return (
        <div className="mt-2 h-36 rounded border-2 border-dashed border-[#2B2D83] bg-white flex items-center justify-center text-xs text-slate-400">
          {label.workField}
        </div>
      );
    default:
      return null;
  }
}

function WorksheetView({
  sheet,
  onRegenerate,
  regenBusyIndex,
  onLinkChange,
}: {
  sheet: Worksheet;
  /** Точечная замена задания (тот же тип/этап/баллы). */
  onRegenerate?: (index: number) => void;
  regenBusyIndex?: number | null;
  onLinkChange?: (index: number, link: string) => void;
}) {
  const { locale, t } = useUiLocale();
  const h = t.handouts;
  const contentLanguage = sheet.language ?? (locale === "kk" ? "kz" : "ru");
  const kazakh = contentLanguage === "kz";
  const copy = kazakh
    ? { task: "Тапсырма", criterion: "Бағалау критерийі", descriptor: "Дескриптор", student: "Оқушының аты-жөні: ____", classDate: `Сынып: ____ Күні: ____`, answers: "Мұғалімге жауаптар", groups: ["1-топ", "2-топ"] as [string, string], taskN: "Тапсырма №", descriptors: "Бағалау дескрипторлары", demo: "Көрсетілім нұсқасы. Нақты тапсырмалар AI қызметі қосылғанда жасалады.", answerDetails: "Жауаптар мен бағалау дескрипторларын көрсету" }
    : { task: "Задание", criterion: "Критерий оценивания", descriptor: "Дескриптор", student: "ФИО ученика: ____", classDate: "Класс: ____ Дата: ____", answers: "Ответы", groups: ["Группа 1", "Группа 2"] as [string, string], taskN: "Задание №", descriptors: h.descriptorsH, demo: h.demoWorksheet, answerDetails: h.answersDetails };
  return (
    <div>
      {sheet.degraded && (
        <p className="mb-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          AI сейчас недоступен, поэтому лист собран по методическому шаблону.
          Проверьте формулировки и дополните их перед печатью — или попробуйте
          «Создать заново» через минуту.
        </p>
      )}
      {sheet.stub && (
        <p className="mb-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2">
          {copy.demo}
        </p>
      )}
      <div className="flex justify-between text-sm font-bold border-b border-black pb-1 mb-4">
        <span>{sheet.metaLine?.trim() || `${copy.student} ${copy.classDate}`}</span>
      </div>
      <h3 className="text-xl font-bold text-center mb-1 text-[#2B2D83]">{sheet.title}</h3>
      {sheet.intro && <p className="mt-1 text-sm text-center text-slate-600 mb-4 italic">{sheet.intro}</p>}
      
      {sheet.learningObjectives && sheet.learningObjectives.length > 0 && (
        <div className="mb-6 p-3 bg-blue-50/50 border border-blue-100 rounded text-sm text-blue-900">
          <strong className="block mb-1">{kazakh ? "Оқу мақсаттары:" : "Цели обучения:"}</strong>
          <ul className="list-disc pl-5">
            {sheet.learningObjectives.map((obj, i) => (
              <li key={i}>{obj}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-5">
        {sheet.tasks.map((task, i) => {
          return (
          <div key={i} className="overflow-hidden rounded-xl border border-[#B9C6E4] bg-white shadow-sm print:shadow-none print:mb-6">
            <div className="flex items-center justify-between gap-2 border-b border-[#B9C6E4] bg-gradient-to-r from-sky-100 to-indigo-100 px-4 py-2 font-bold text-sm text-[#2B2D83]">
              <span>
                {copy.task} {i + 1}. {worksheetTypeLabel(task.type, contentLanguage)} <span className="font-normal text-slate-600">({task.points} б.)</span>
              </span>
              {onRegenerate && (
                <button
                  type="button"
                  onClick={() => onRegenerate(i)}
                  disabled={regenBusyIndex === i}
                  title={h.replaceTitle}
                  className="print:hidden shrink-0 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-[#2B2D83] hover:bg-white disabled:opacity-50"
                >
                  {regenBusyIndex === i ? "…" : h.replace}
                </button>
              )}
            </div>
            <div className="px-4 py-3">
              <div className="font-bold text-base mb-1">{task.prompt}</div>

            <div className={`flex flex-col sm:flex-row gap-4 ${task.imageBase64 ? 'items-start' : ''}`}>
              <div className="flex-1">
                <TaskBody task={task} language={contentLanguage} onLinkChange={onLinkChange ? (link) => onLinkChange(i, link) : undefined} />
              </div>
              
              {task.imageBase64 && (
                <div className="sm:w-1/3 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl(task.imageBase64, task.imageMime)}
                    alt={task.imageAlt || `Иллюстрация к заданию ${i + 1}`}
                    className="max-h-48 rounded object-contain mx-auto"
                  />
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] italic text-slate-500">{copy.criterion}: {task.criterion}</p>
            <p className="text-[11px] italic text-slate-500">{copy.descriptor}: {task.descriptor}</p>
            </div>
          </div>
          );
        })}
      </div>

      <details className="mt-8 border border-slate-300 rounded-lg overflow-hidden group print:hidden">
        <summary className="bg-slate-50 text-slate-800 px-4 py-2 font-bold text-sm cursor-pointer hover:bg-slate-100">
          {copy.answerDetails}
        </summary>
        <div className="p-4 bg-white space-y-4">
          <div>
          <h4 className="font-bold text-sm mb-2 text-[#2B2D83]">{copy.answers}</h4>
            <div className="text-sm space-y-1">
              {worksheetAnswerLines(sheet.tasks, contentLanguage).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-2 text-[#2B2D83]">{copy.descriptors}</h4>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 font-bold border-r border-slate-300">{kazakh ? "Тапсырма" : h.thTask}</th>
                  <th className="p-2 font-bold border-r border-slate-300">{kazakh ? "Критерий" : h.thCriterion}</th>
                  <th className="p-2 font-bold">{kazakh ? "Дескриптор" : h.thDescriptor}</th>
                </tr>
              </thead>
              <tbody>
                {sheet.tasks.map((task, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="p-2 border-r border-slate-300">{copy.taskN}{i + 1} ({task.points}б)</td>
                    <td className="p-2 border-r border-slate-300">{task.criterion}</td>
                    <td className="p-2">{task.descriptor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}

function FlashcardTile({ card, index, language }: { card: FlashcardSet["cards"][number]; index: number; language: "ru" | "kz" }) {
  const accent = FLASHCARD_ACCENTS[index % FLASHCARD_ACCENTS.length];
  const copy = language === "kz"
    ? { title: "ЖАДНАМА", example: "Мысал", check: "Өзіңді тексер" }
    : { title: "ПАМЯТКА", example: "Пример", check: "Проверь себя" };
  return (
    <article className={`group overflow-hidden rounded-2xl border-2 ${accent.line} bg-white shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md print:break-inside-avoid print:shadow-none`}>
      <div className={`${accent.top} flex items-center justify-between px-3 py-2 text-white`}>
        <span className="text-[10px] font-bold tracking-[0.18em]">{copy.title}</span>
        <span className={`${accent.badge} inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-black text-slate-900`}>{index + 1}</span>
      </div>
      {card.imageBase64 && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl(card.imageBase64, card.imageMime)}
          alt={card.imageAlt || card.front}
          className="h-32 w-full object-cover"
        />
      )}
      <div className="p-3">
        <h4 className="text-base font-extrabold leading-tight text-[#20216B]">{card.front}</h4>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{card.back}</p>
        {card.example && (
          <div className={`mt-3 rounded-xl border ${accent.line} ${accent.soft} px-2.5 py-2 text-xs leading-relaxed text-slate-700`}>
            <b className="text-[#20216B]">{copy.example}: </b>{card.example}
          </div>
        )}
        {card.checkQuestion && (
          <div className="mt-3 border-t border-dashed border-slate-300 pt-2 text-xs leading-relaxed text-slate-600">
            <b className="text-[#20216B]">✦ {copy.check}: </b>{card.checkQuestion}
          </div>
        )}
      </div>
    </article>
  );
}

function FlashcardsView({ set }: { set: FlashcardSet }) {
  const { t } = useUiLocale();
  const h = t.handouts;
  const demoText = set.language === "kz" ? "Көрсетілім нұсқасы." : h.demoFlashcards;
  return (
    <div>
      {set.stub && (
        <p className="mb-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2">
          {demoText}
        </p>
      )}
      <h3 className="text-lg font-bold text-center">{set.title}</h3>
      {set.intro && <p className="mt-1 text-sm text-center text-slate-600">{set.intro}</p>}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {set.cards.map((card, i) => (
          <FlashcardTile key={i} card={card} index={i} language={set.language ?? "ru"} />
        ))}
      </div>
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
      <h3 className="text-lg font-bold text-center">{puzzle.title}</h3>
      {puzzle.intro && <p className="mt-1 text-sm text-center text-slate-600">{puzzle.intro}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="border-collapse mx-auto">
          <tbody>
            {puzzle.grid.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`w-7 h-7 border text-center text-sm font-bold ${cell ? "border-[#2B2D83] bg-white" : "border-transparent"}`}
                  >
                    {cell && filled.has(`${r},${c}`) ? (
                      <span className="text-[10px] text-slate-500">{puzzle.numbers.find((n) => n.row === r && n.col === c)?.number}</span>
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
          <div className="font-bold mb-1 text-[#2B2D83]">{label.across}</div>
          <ol className="list-decimal list-inside space-y-1">
            {puzzle.placed.filter((w) => w.direction === "across").map((w) => (
              <li key={`a${w.number}`}>
                <b>{w.number}.</b> {w.clue} ({w.word.length} {label.letters})
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="font-bold mb-1 text-[#2B2D83]">{label.down}</div>
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
        <p className="mt-3 text-xs text-slate-500">
          {label.unplaced} {puzzle.unplaced.map((w) => w.word).join(", ")}
        </p>
      )}
      <details className="mt-4 border border-slate-300 rounded-lg overflow-hidden print:hidden">
        <summary className="bg-slate-50 text-slate-800 px-4 py-2 font-bold text-sm cursor-pointer hover:bg-slate-100">
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
}: {
  handout: Handout;
  /** Второй материал комплекта (памятки после листа) — показывается ниже с разделителем. */
  extra?: Handout;
  title?: string;
  fileName?: string;
  docxBase64?: string;
  onClose: () => void;
  /** Контекст для точечной перегенерации заданий. */
  meta?: { topic: string; subject: string; grade: number; language: "ru" | "kz" };
}) {
  const { t } = useUiLocale();
  const h = t.handouts;
  const [doc, setDoc] = useState<Handout>(handout);
  const [extraDoc, setExtraDoc] = useState<Handout | null>(extra ?? null);
  const [regenBusy, setRegenBusy] = useState<{ part: "main" | "extra"; index: number } | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

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
          handout: doc,
          extra: extraDoc ?? undefined,
          includeAnswers,
          fileName:
            (fileName ?? "handout.docx").replace(/\.docx$/i, "") +
            (includeAnswers ? ".docx" : " — ученикам.docx"),
        }),
      });
      if (!res.ok) throw new Error("Не удалось собрать документ");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (fileName ?? "handout.docx").replace(/\.docx$/i, "") +
        (includeAnswers ? ".docx" : " — ученикам.docx");
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
  }, [doc, extraDoc, fileName, docxBase64, h.downloadFailed]);

  const showStudentButton = doc.kind !== "flashcards" || (extraDoc != null && extraDoc.kind !== "flashcards");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="rounded-xl bg-white shadow-2xl print:shadow-none"
        overlayClassName="overflow-y-auto p-4"
        aria-label={h.previewTitle}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-[#3D6DB5] text-white rounded-t-xl">
          <DialogTitle className="font-bold text-sm sm:text-base">{title ?? h.previewTitle}</DialogTitle>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadDoc(true)}
              disabled={printing}
              className="inline-flex items-center gap-1.5 rounded-md bg-white text-[#2B2D83] px-3 py-1.5 text-sm font-medium hover:bg-sky-100 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {printing ? h.building : h.teacherBtn}
            </button>
            {showStudentButton && (
              <button
                type="button"
                onClick={() => downloadDoc(false)}
                disabled={printing}
                title="Тот же материал без ответов и дескрипторов — для раздачи классу"
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 text-white px-3 py-1.5 text-sm font-medium hover:bg-white/25 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {printing ? h.building : h.studentBtn}
              </button>
            )}
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
        <div className="p-4 sm:p-6">
          {doc.kind === "worksheet" && (
            <WorksheetView
              sheet={doc}
              onRegenerate={(index) => regenerateTask("main", index)}
              regenBusyIndex={regenBusy?.part === "main" ? regenBusy.index : null}
              onLinkChange={(index, link) => patchTask("main", index, { link })}
            />
          )}
          {doc.kind === "flashcards" && <FlashcardsView set={doc} />}
          {doc.kind === "crossword" && <CrosswordView puzzle={doc} />}
          {extraDoc && (
            <div className="mt-8 border-t-2 border-dashed border-slate-300 pt-6">
              {extraDoc.kind === "worksheet" && (
                <WorksheetView
                  sheet={extraDoc}
                  onRegenerate={(index) => regenerateTask("extra", index)}
                  regenBusyIndex={regenBusy?.part === "extra" ? regenBusy.index : null}
                  onLinkChange={(index, link) => patchTask("extra", index, { link })}
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
