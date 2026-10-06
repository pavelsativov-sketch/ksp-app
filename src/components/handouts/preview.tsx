"use client";

import { useCallback, useState } from "react";
import { Download, Printer, Settings, X } from "lucide-react";
import type { Crossword, FlashcardSet, Handout, Worksheet, WorksheetTask } from "@/lib/handouts/types";
import { optionLetter, worksheetAnswerLines, worksheetTypeLabel } from "@/lib/handouts/answers";
import { resolveErrorsCount, resolveTableRows } from "@/lib/handouts/layout";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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

/** Настройки отображения предпросмотра. */
interface PreviewSettings {
  fontSize: number;
  spacing: number;
  showAnswers: boolean;
  showDescriptors: boolean;
  showImages: boolean;
  columns: number;
}

const DEFAULT_SETTINGS: PreviewSettings = {
  fontSize: 14,
  spacing: 1,
  showAnswers: true,
  showDescriptors: true,
  showImages: true,
  columns: 1,
};

function TaskBody({ task, settings }: { task: WorksheetTask; settings: PreviewSettings }) {
  const { t } = useUiLocale();
  const h = t.handouts;
  const fontSize = settings.fontSize;

  switch (task.type) {
    case "open":
      return (
        <div className="mt-2 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-baseline gap-2" style={{ fontSize }}>
              <span className={`w-5 shrink-0 ${NAVY}`}>{i + 1}</span>
              <span className="flex-1 border-b border-slate-400" />
            </div>
          ))}
        </div>
      );
    case "multiple_choice":
      return (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5" style={{ fontSize }}>
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
        <div className="mt-2 flex gap-4 text-sm" style={{ fontSize }}>
          <span className="border border-slate-300 rounded px-3 py-1">☐ {h.trueLabel}</span>
          <span className="border border-slate-300 rounded px-3 py-1">☐ {h.falseLabel}</span>
        </div>
      );
    case "match": {
      const options = task.options ?? [];
      const pairs = task.pairs ?? [];
      return (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm" style={{ fontSize }}>
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
          <div className="mt-2 rounded border border-[#C77F42] bg-[#FFF2CC] px-3 py-2 text-sm" style={{ fontSize }}>
            <b className={NAVY}>{h.wordBank}</b>
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
      const groups = task.groups ?? ["Группа 1", "Группа 2"];
      // Ячейки высокие и пустые — ученик пишет в них от руки,
      // поэтому в предпросмотре повторяем ту же геометрию, что в docx.
      const rows = Math.max(3, Math.min(8, Math.ceil(items.length / 4)));
      return (
        <>
          <div className="mt-2 rounded border border-[#C77F42] bg-[#FFF2CC] px-3 py-2 text-sm" style={{ fontSize }}>
            <b className={NAVY}>{h.sortWords}</b>
            <span className="text-[#1F4E9C]">{items.join("  -  ")}</span>
          </div>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-2 border-[#2B2D83] bg-[#3D6DB5] text-white px-2 py-1 text-left">{groups[0]}</th>
                <th className="border-2 border-[#2B2D83] bg-[#3D6DB5] text-white px-2 py-1 text-left">{groups[1]}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, i) => (
                <tr key={i}>
                  <td className="border-2 border-[#2B2D83] px-2 py-1 h-20" />
                  <td className="border-2 border-[#2B2D83] px-2 py-1 h-20" />
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
              <div key={i} className="flex items-center gap-2 border border-slate-300 rounded px-2 py-1 text-sm bg-white" style={{ fontSize }}>
                <span className={`font-bold ${NAVY}`}>☐</span>
                <span>{opt}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{h.ownExample}</div>
        </>
      );
    case "case_study":
      return (
        <>
          <div className="mt-2 rounded-2xl border-2 border-[#C77F42] bg-[#F6C89F] px-4 py-3 text-sm leading-relaxed" style={{ fontSize }}>
            <b className="text-[#7A3E12]">{h.caseLabel}</b>
            {task.situation}
          </div>
          <div className="mt-2 space-y-2 text-sm">
            <div className="border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{h.problemL}</div>
            <div className="border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{h.solutionL}</div>
            <div className="border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{h.whyL}</div>
          </div>
        </>
      );
    case "table_fix":
      return (
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-2 border-[#2B2D83] bg-[#D9D9D9] px-2 py-1 text-left">{task.tableHeaders?.[0] ?? "Что сделано неправильно?"}</th>
              <th className="border-2 border-[#2B2D83] bg-[#D9D9D9] px-2 py-1 text-left">{task.tableHeaders?.[1] ?? "Как исправить?"}</th>
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
          <div className="mt-2 rounded-2xl border-2 border-[#C77F42] bg-[#F6C89F] px-4 py-3 text-sm leading-relaxed" style={{ fontSize }}>
            {task.situation}
          </div>
          <p className="mt-2 text-xs text-slate-600">Ошибок найти: {resolveErrorsCount(task.errorsCount)} — заполни строки «Ошибка → Исправление».</p>
          <table className="mt-1 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-2 border-[#2B2D83] bg-[#D9D9D9] px-2 py-1 text-left">Ошибка</th>
                <th className="border-2 border-[#2B2D83] bg-[#D9D9D9] px-2 py-1 text-left">Исправление</th>
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
            <span key={i} className="px-3 py-1 rounded-lg bg-[#3D6DB5] text-white text-sm font-medium shadow-sm" style={{ fontSize }}>
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
                ☐ {task.reflectionOptions?.[i] ?? ["Всё понял(а)", "Есть сомнения", "Нужна помощь"][i]}
              </div>
            </div>
          ))}
        </div>
      );
    case "interactive":
      return (
        <div className="mt-2 flex items-start gap-3">
          <div className="w-20 h-20 shrink-0 border-2 border-dashed border-[#2B2D83] rounded flex items-center justify-center text-[10px] text-center text-slate-500 bg-white">
            QR-код{task.link ? "" : ` ${h.qrSuffix}`}
          </div>
          <div className="text-sm flex-1" style={{ fontSize }}>
            <p className="mt-1 text-xs break-all">
              <b className={NAVY}>{h.linkLabel}</b> {task.link ?? h.linkEmpty}
            </p>
            <div className="mt-1 border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">{h.myResult}</div>
          </div>
        </div>
      );
    case "creative":
      return (
        <div className="mt-2 h-36 rounded border-2 border-dashed border-[#2B2D83] bg-white flex items-center justify-center text-xs text-slate-400">
          {h.workField}
        </div>
      );
    case "word_search":
      return (
        <>
          <div className="mt-2 rounded border border-[#C77F42] bg-[#FFF2CC] px-3 py-2 text-sm" style={{ fontSize }}>
            <b className={NAVY}>Найди слова:</b>
            {(task.searchWords ?? []).join("  ·  ")}
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {Array.from({ length: 25 }).map((_, i) => (
              <div key={i} className="w-8 h-8 border border-slate-300 rounded flex items-center justify-center text-sm bg-white">
                {String.fromCharCode(65 + (i % 26))}
              </div>
            ))}
          </div>
        </>
      );
    case "ordering":
      return (
        <>
          <div className="mt-2 space-y-1">
            {(task.orderItems ?? []).map((item, i) => (
              <div key={i} className="flex items-center gap-2 border border-slate-300 rounded px-2 py-1 text-sm bg-white" style={{ fontSize }}>
                <span className={`font-bold ${NAVY}`}>{i + 1}.</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="border-b-2 border-dashed border-slate-400 h-6" />
            ))}
          </div>
        </>
      );
    case "odd_one_out":
      return (
        <>
          <div className="mt-2 space-y-1">
            {(task.oddItems ?? []).map((item, i) => (
              <div key={i} className="flex items-center gap-2 border border-slate-300 rounded px-2 py-1 text-sm bg-white" style={{ fontSize }}>
                <span className={`font-bold ${NAVY}`}>{optionLetter(i)}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-b-2 border-dashed border-slate-400 h-6 text-xs text-slate-500">Какой элемент лишний? Почему?</div>
        </>
      );
    case "categorize":
      return (
        <>
          <div className="mt-2 rounded border border-[#C77F42] bg-[#FFF2CC] px-3 py-2 text-sm" style={{ fontSize }}>
            <b className={NAVY}>Категории:</b>
            {(task.categories ?? []).join("  ·  ")}
          </div>
          <div className="mt-2 space-y-1">
            {(task.categoryItems ?? []).map((item, i) => (
              <div key={i} className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" style={{ fontSize }}>
                {item}
              </div>
            ))}
          </div>
        </>
      );
    default:
      return null;
  }
}

function WorksheetView({
  sheet,
  settings,
}: {
  sheet: Worksheet;
  settings: PreviewSettings;
}) {
  const { t } = useUiLocale();
  const h = t.handouts;
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
          {h.demoWorksheet}
        </p>
      )}
      <div className="flex justify-between text-sm font-bold border-b border-black pb-1 mb-4" style={{ fontSize: settings.fontSize }}>
        <span>{sheet.metaLine?.split("Класс")[0]?.trim() || "ФИО ученика: ____"}</span>
        <span>{sheet.metaLine?.includes("Класс") ? sheet.metaLine.slice(sheet.metaLine.indexOf("Класс")) : "Класс: ____ Дата: ____"}</span>
      </div>
      <h3 className="text-xl font-bold text-center mb-1 text-[#2B2D83]" style={{ fontSize: settings.fontSize + 6 }}>{sheet.title}</h3>
      {sheet.intro && <p className="mt-1 text-sm text-center text-slate-600 mb-4 italic" style={{ fontSize: settings.fontSize - 2 }}>{sheet.intro}</p>}
      
      {sheet.learningObjectives && sheet.learningObjectives.length > 0 && (
        <div className="mb-6 p-3 bg-blue-50/50 border border-blue-100 rounded text-sm text-blue-900" style={{ fontSize: settings.fontSize - 2 }}>
          <strong className="block mb-1">Цели обучения:</strong>
          <ul className="list-disc pl-5">
            {sheet.learningObjectives.map((obj, i) => (
              <li key={i}>{obj}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-5" style={{ gap: `${settings.spacing * 1}rem` }}>
        {sheet.tasks.map((task, i) => {
          return (
          <div key={i} className="overflow-hidden rounded-xl border border-[#B9C6E4] bg-white shadow-sm print:shadow-none print:mb-6">
            <div className="flex items-center justify-between gap-2 border-b border-[#B9C6E4] bg-gradient-to-r from-sky-100 to-indigo-100 px-4 py-2 font-bold text-sm text-[#2B2D83]" style={{ fontSize: settings.fontSize }}>
              <span>
                Задание {i + 1}. {worksheetTypeLabel(task.type)} <span className="font-normal text-slate-600">({task.points} б.)</span>
              </span>
            </div>
            <div className="px-4 py-3">
              <div className="font-bold text-base mb-1" style={{ fontSize: settings.fontSize + 2 }}>{task.prompt}</div>
              
              <div className={`flex flex-col sm:flex-row gap-4 ${task.imageBase64 ? 'items-start' : ''}`}>
                <div className="flex-1">
                  <TaskBody task={task} settings={settings} />
                </div>
              
                {settings.showImages && task.imageBase64 && (
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
              {settings.showDescriptors && (
                <>
                  <p className="mt-2 text-[11px] italic text-slate-500">{h.criterion}: {task.criterion}</p>
                  <p className="text-[11px] italic text-slate-500">{h.descriptor}: {task.descriptor}</p>
                </>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {settings.showAnswers && (
        <details className="mt-8 border border-slate-300 rounded-lg overflow-hidden group print:hidden">
          <summary className="bg-slate-50 text-slate-800 px-4 py-2 font-bold text-sm cursor-pointer hover:bg-slate-100">
            {h.answersDetails}
          </summary>
          <div className="p-4 bg-white space-y-4">
            <div>
              <h4 className="font-bold text-sm mb-2 text-[#2B2D83]">{h.answersH}</h4>
              <div className="text-sm space-y-1">
                {worksheetAnswerLines(sheet.tasks).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-bold text-sm mb-2 text-[#2B2D83]">{h.descriptorsH}</h4>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="p-2 font-bold border-r border-slate-300">{h.thTask}</th>
                    <th className="p-2 font-bold border-r border-slate-300">{h.thCriterion}</th>
                    <th className="p-2 font-bold">{h.thDescriptor}</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.tasks.map((task, i) => (
                    <tr key={i} className="border-b border-slate-200">
                      <td className="p-2 border-r border-slate-300">№{i + 1} ({task.points}б)</td>
                      <td className="p-2 border-r border-slate-300">{task.criterion}</td>
                      <td className="p-2">{task.descriptor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function FlashcardTile({ card, index, language, settings }: { card: FlashcardSet["cards"][number]; index: number; language: "ru" | "kz"; settings: PreviewSettings }) {
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
      {settings.showImages && card.imageBase64 && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl(card.imageBase64, card.imageMime)}
          alt={card.imageAlt || card.front}
          className="h-32 w-full object-cover"
        />
      )}
      <div className="p-3">
        <h4 className="font-extrabold leading-tight text-[#20216B]" style={{ fontSize: settings.fontSize + 1 }}>{card.front}</h4>
        <p className="mt-2 leading-relaxed text-slate-700" style={{ fontSize: settings.fontSize - 1 }}>{card.back}</p>
        {card.example && (
          <div className={`mt-3 rounded-xl border ${accent.line} ${accent.soft} px-2.5 py-2 leading-relaxed text-slate-700`} style={{ fontSize: settings.fontSize - 2 }}>
            <b className="text-[#20216B]">{copy.example}: </b>{card.example}
          </div>
        )}
        {card.checkQuestion && (
          <div className="mt-3 border-t border-dashed border-slate-300 pt-2 leading-relaxed text-slate-600" style={{ fontSize: settings.fontSize - 2 }}>
            <b className="text-[#20216B]">✦ {copy.check}: </b>{card.checkQuestion}
          </div>
        )}
      </div>
    </article>
  );
}

function FlashcardsView({ set, settings }: { set: FlashcardSet; settings: PreviewSettings }) {
  const { t } = useUiLocale();
  const h = t.handouts;
  return (
    <div>
      {set.stub && (
        <p className="mb-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2">
          {h.demoFlashcards}
        </p>
      )}
      <h3 className="text-lg font-bold text-center" style={{ fontSize: settings.fontSize + 4 }}>{set.title}</h3>
      {set.intro && <p className="mt-1 text-sm text-center text-slate-600" style={{ fontSize: settings.fontSize - 2 }}>{set.intro}</p>}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {set.cards.map((card, i) => (
          <FlashcardTile key={i} card={card} index={i} language={set.language ?? "ru"} settings={settings} />
        ))}
      </div>
    </div>
  );
}

function CrosswordView({ puzzle, settings }: { puzzle: Crossword; settings: PreviewSettings }) {
  const { t } = useUiLocale();
  const h = t.handouts;
  const filled = new Set(puzzle.numbers.map((n) => `${n.row},${n.col}`));
  return (
    <div>
      <h3 className="text-lg font-bold text-center" style={{ fontSize: settings.fontSize + 4 }}>{puzzle.title}</h3>
      {puzzle.intro && <p className="mt-1 text-sm text-center text-slate-600" style={{ fontSize: settings.fontSize - 2 }}>{puzzle.intro}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="border-collapse mx-auto">
          <tbody>
            {puzzle.grid.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`w-7 h-7 border text-center text-sm font-bold ${cell ? "border-[#2B2D83] bg-white" : "border-transparent"}`}
                    style={{ fontSize: settings.fontSize - 2 }}
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
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm" style={{ fontSize: settings.fontSize - 2 }}>
        <div>
          <div className="font-bold mb-1 text-[#2B2D83]">{h.across}</div>
          <ol className="list-decimal list-inside space-y-1">
            {puzzle.placed.filter((w) => w.direction === "across").map((w) => (
              <li key={`a${w.number}`}>
                <b>{w.number}.</b> {w.clue} ({w.word.length} {h.letters})
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="font-bold mb-1 text-[#2B2D83]">{h.down}</div>
          <ol className="list-decimal list-inside space-y-1">
            {puzzle.placed.filter((w) => w.direction === "down").map((w) => (
              <li key={`d${w.number}`}>
                <b>{w.number}.</b> {w.clue} ({w.word.length} {h.letters})
              </li>
            ))}
          </ol>
        </div>
      </div>
      {puzzle.unplaced.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {h.unplaced} {puzzle.unplaced.map((w) => w.word).join(", ")}
        </p>
      )}
      {settings.showAnswers && (
        <details className="mt-4 border border-slate-300 rounded-lg overflow-hidden print:hidden">
          <summary className="bg-slate-50 text-slate-800 px-4 py-2 font-bold text-sm cursor-pointer hover:bg-slate-100">
            {h.crosswordAnswers}
          </summary>
          <div className="p-4 bg-white text-sm space-y-1">
            {puzzle.placed.map((w) => (
              <div key={`${w.direction}${w.number}`}>
                <b>{w.number}.</b> {w.word} — {w.clue}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function HandoutPreview({
  handout,
  title,
  fileName,
  docxBase64,
  onClose,
}: {
  handout: Handout;
  title?: string;
  fileName?: string;
  docxBase64?: string;
  onClose: () => void;
}) {
  const { t } = useUiLocale();
  const h = t.handouts;
  const [settings, setSettings] = useState<PreviewSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const downloadDoc = useCallback(async (includeAnswers: boolean) => {
    setDownloading(true);
    try {
      const res = await fetch("/api/handouts/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handout,
          includeAnswers,
          fileName: (fileName ?? "handout.docx").replace(/\.docx$/i, "") + (includeAnswers ? ".docx" : " — ученикам.docx"),
        }),
      });
      if (!res.ok) throw new Error("Не удалось собрать документ");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileName ?? "handout.docx").replace(/\.docx$/i, "") + (includeAnswers ? ".docx" : " — ученикам.docx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
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
      }
    } finally {
      setDownloading(false);
    }
  }, [handout, fileName, docxBase64]);

  const printDoc = useCallback(() => {
    window.print();
  }, []);

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
              onClick={() => setShowSettings(!showSettings)}
              className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1.5 text-sm hover:bg-white/25"
              title="Настройки"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => downloadDoc(true)}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-md bg-white text-[#2B2D83] px-3 py-1.5 text-sm font-medium hover:bg-sky-100 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {downloading ? h.building : h.teacherBtn}
            </button>
            <button
              type="button"
              onClick={() => downloadDoc(false)}
              disabled={downloading}
              title="Тот же материал без ответов и дескрипторов — для раздачи классу"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 text-white px-3 py-1.5 text-sm font-medium hover:bg-white/25 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {downloading ? h.building : h.studentBtn}
            </button>
            <button
              type="button"
              onClick={printDoc}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 text-white px-3 py-1.5 text-sm font-medium hover:bg-white/25"
            >
              <Printer className="w-4 h-4" />
              Печать
            </button>
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
        {showSettings && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Размер шрифта</label>
                <input
                  type="range"
                  min="10"
                  max="20"
                  value={settings.fontSize}
                  onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })}
                  className="w-full"
                />
                <span className="text-xs text-slate-500">{settings.fontSize}px</span>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Отступы</label>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.5"
                  value={settings.spacing}
                  onChange={(e) => setSettings({ ...settings, spacing: Number(e.target.value) })}
                  className="w-full"
                />
                <span className="text-xs text-slate-500">{settings.spacing}x</span>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Ответы</label>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, showAnswers: !settings.showAnswers })}
                  className={`rounded px-2 py-1 text-xs ${settings.showAnswers ? "bg-[#2B2D83] text-white" : "bg-slate-200 text-slate-700"}`}
                >
                  {settings.showAnswers ? "Показать" : "Скрыть"}
                </button>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Дескрипторы</label>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, showDescriptors: !settings.showDescriptors })}
                  className={`rounded px-2 py-1 text-xs ${settings.showDescriptors ? "bg-[#2B2D83] text-white" : "bg-slate-200 text-slate-700"}`}
                >
                  {settings.showDescriptors ? "Показать" : "Скрыть"}
                </button>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Изображения</label>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, showImages: !settings.showImages })}
                  className={`rounded px-2 py-1 text-xs ${settings.showImages ? "bg-[#2B2D83] text-white" : "bg-slate-200 text-slate-700"}`}
                >
                  {settings.showImages ? "Показать" : "Скрыть"}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="p-4 sm:p-6">
          {handout.kind === "worksheet" && (
            <WorksheetView sheet={handout} settings={settings} />
          )}
          {handout.kind === "flashcards" && <FlashcardsView set={handout} settings={settings} />}
          {handout.kind === "crossword" && <CrosswordView puzzle={handout} settings={settings} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
