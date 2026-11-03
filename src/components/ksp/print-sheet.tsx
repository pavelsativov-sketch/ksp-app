"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { QrCodeSvg } from "@/components/ksp/qr-card";
import { optionLetter, worksheetAnswerLines, worksheetTypeLabel } from "@/lib/handouts/answers";
import type { Flashcard, FlashcardSet, Worksheet, WorksheetTask } from "@/lib/handouts/types";
import s from "./print-sheet.module.css";

/** Рабочая высота белого листа: A4 за вычетом рамки, строки сверху и подвала. */
const PAPER_CAPACITY = 1015;
const TITLE_HEIGHT = 74;
const TASK_GAP = 12;
const CARDS_PER_PAGE = 6;

const TONES = ["#b8860b", "#1420e6", "#0f96b4", "#6a1b9a", "#f08a24", "#c04fc8", "#17935b", "#d6336c"];
const tone = (index: number) => ({ "--tone": TONES[index % TONES.length] }) as CSSProperties;

/** Только пока лист открыт: печатаем сами страницы без полей, рамки окна и остального сайта. */
const PRINT_CSS = `@media print {
  @page { size: A4; margin: 0; }
  body > *:not([role="dialog"]) { display: none !important; }
  [role="dialog"] { position: static !important; transform: none !important; width: auto !important; max-width: none !important; max-height: none !important; overflow: visible !important; }
}`;

const imageSrc = (base64: string, mime?: string) => `data:${mime ?? "image/jpeg"};base64,${base64}`;

/** Разделяет задания по страницам A4, не разрывая задание. */
export function paginate(heights: number[], firstPageReserve: number, capacity = PAPER_CAPACITY): number[][] {
  const pages: number[][] = [[]];
  let used = firstPageReserve;
  heights.forEach((height, index) => {
    const page = pages[pages.length - 1]!;
    if (page.length > 0 && used + height > capacity) {
      pages.push([index]);
      used = height + TASK_GAP;
    } else {
      page.push(index);
      used += height + TASK_GAP;
    }
  });
  return pages;
}

/** Перестановка без случайности: ключ на листе и в ответах один и тот же при каждом показе. */
export function matchOrder(length: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  const step = length > 3 ? (length % 3 === 0 ? 2 : 3) : 2;
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) out.push(order[(i * step + 1) % length]!);
  return new Set(out).size === length ? out : order.reverse();
}

function Blanks({ text }: { text: string }) {
  return <>{text.split(/(_{3,})/).map((part, i) => (/^_{3,}$/.test(part) ? <span key={i} className={s.blank}>&nbsp;</span> : part))}</>;
}

const splitLines = (text: string) => text.split(/\n+|(?=\s\d+[.)]\s)/).map((line) => line.trim().replace(/^\d+[.)]\s*/, "")).filter(Boolean);

/** Предложения с пропусками: вводную фразу модели в нумерованный список не берём. */
function bankLines(prompt: string): string[] {
  const all = splitLines(prompt);
  const withBlanks = all.filter((line) => line.includes("___"));
  return withBlanks.length > 0 ? withBlanks : all;
}

function TaskContent({ task, onLinkChange, fallback }: { task: WorksheetTask; onLinkChange?: (link: string) => void; fallback: (task: WorksheetTask) => ReactNode }) {
  switch (task.type) {
    case "match": {
      const terms = task.options ?? [];
      const definitions = task.pairs ?? [];
      const order = matchOrder(definitions.length);
      return (
        <>
          <div className={s.matchTop}>
            <ol className={s.matchTerms}>{terms.map((term, i) => <li key={i}>{term}</li>)}</ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {task.imageBase64 && <img className={s.matchImage} src={imageSrc(task.imageBase64, task.imageMime)} alt={task.imageAlt ?? ""} />}
          </div>
          <ul className={s.lines}>{order.map((source, i) => <li key={i}><b>{optionLetter(i)}.</b> {definitions[source]}</li>)}</ul>
          <div className={s.answerPill}><span>Ответы:</span>{terms.map((_, i) => <span key={i}>{i + 1}____</span>)}</div>
        </>
      );
    }
    case "fill_bank":
      return (
        <>
          <div className={s.bank}><span className={s.bankTitle}>Слова для справок:</span>{(task.wordBank ?? []).join(", ")}.</div>
          <ol className={s.numbered}>{bankLines(task.prompt).map((line, i) => <li key={i}><Blanks text={line} /></li>)}</ol>
        </>
      );
    case "fill":
      return <p className={s.question}><Blanks text={task.prompt} /></p>;
    case "open":
      return (
        <>
          {splitLines(task.prompt).length > 1 && splitLines(task.prompt).map((question, i) => (
            <div key={i}>
              <p className={s.question}>{i + 1}. {question}</p>
              <div className={s.ruled} /><div className={s.ruled} />
            </div>
          ))}
          {splitLines(task.prompt).length <= 1 && <><div className={s.ruled} /><div className={s.ruled} /><div className={s.ruled} /></>}
        </>
      );
    case "compare": {
      const columns = task.compareColumns ?? [];
      return (
        <table className={s.table}>
          <thead><tr>{columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr></thead>
          <tbody>{(task.compareRows ?? []).map((row, i) => <tr key={i}><td>{row}</td>{columns.slice(1).map((_, j) => <td key={j} />)}</tr>)}</tbody>
        </table>
      );
    }
    case "multiple_choice":
      return <div className={s.options}>{(task.options ?? []).map((option, i) => <div key={i} className={s.option}><span className={s.letter}>{optionLetter(i)}</span>{option}</div>)}</div>;
    case "true_false":
      return <div className={s.options}><div className={s.option}><span className={s.letter}>✓</span>Верно</div><div className={s.option}><span className={s.letter}>✗</span>Неверно</div></div>;
    case "reflection": {
      const labels = task.reflectionOptions?.length ? task.reflectionOptions : ["Всё понял", "Есть вопросы", "Нужна помощь"];
      const colors = ["#35b34a", "#2f7bf0", "#e5352d"];
      return <div className={s.traffic}>{labels.slice(0, 3).map((label, i) => <div key={i}><span className={s.light} style={{ background: colors[i] }} />{label}</div>)}</div>;
    }
    case "interactive":
      return (
        <div className={s.qrRow}>
          {task.link
            ? <div className={s.qrBox}><QrCodeSvg key={task.link} text={task.link} /></div>
            : <div className={`${s.qrBox} ${s.qrEmpty}`}>Вставьте ссылку, появится QR</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            {task.link && <div className={s.qrLink}>{task.link}</div>}
            {onLinkChange && <input data-no-capture className={s.qrInput} value={task.link ?? ""} onChange={(e) => onLinkChange(e.target.value)} placeholder="https://… ссылка на интерактив" aria-label="Ссылка на интерактив" />}
          </div>
        </div>
      );
    default:
      return <>{fallback(task)}</>;
  }
}

/** В этих типах вопрос или предложения стоят в теле задания, а в шапке только инструкция. */
function instructionOf(task: WorksheetTask, language: "ru" | "kz"): string {
  if (task.type === "fill_bank") return worksheetTypeLabel("fill_bank", language);
  if (task.type === "open" && splitLines(task.prompt).length > 1) return worksheetTypeLabel("open", language);
  if (task.type === "fill") return worksheetTypeLabel("fill", language);
  return task.prompt;
}

function TaskBlock({ task, index, language, onRegenerate, regenerating, onLinkChange, fallback }: {
  task: WorksheetTask;
  index: number;
  language: "ru" | "kz";
  onRegenerate?: () => void;
  regenerating?: boolean;
  onLinkChange?: (link: string) => void;
  fallback: (task: WorksheetTask) => ReactNode;
}) {
  const word = language === "kz" ? "Тапсырма" : "Задание";
  return (
    <section className={s.task} style={tone(index)} data-task>
      <div className={s.taskHead}>
        <span className={s.badge}>{word} {index + 1}</span>
        <span className={s.instruction}>{instructionOf(task, language)}</span>
        <span className={s.points}>{task.points > 0 ? `${task.points} б.` : ""}</span>
        {onRegenerate && <button type="button" data-no-capture className={s.replace} onClick={onRegenerate} disabled={regenerating}>{regenerating ? "…" : "Заменить"}</button>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {task.imageBase64 && task.type !== "match" && <img className={s.taskImage} src={imageSrc(task.imageBase64, task.imageMime)} alt={task.imageAlt ?? ""} />}
      <TaskContent task={task} onLinkChange={onLinkChange} fallback={fallback} />
      <div style={{ clear: "both" }} />
    </section>
  );
}

export interface WorksheetSheetProps {
  sheet: Worksheet;
  grade?: number;
  subject?: string;
  footer?: string;
  withKey?: boolean;
  onRegenerate?: (index: number) => void;
  regeneratingIndex?: number | null;
  onLinkChange?: (index: number, link: string) => void;
  fallback: (task: WorksheetTask) => ReactNode;
}

/** Рабочий лист как на образце учителя: тёмная рамка со свечением, цветные плашки, страницы A4. */
export function WorksheetSheet({ sheet, grade, subject, footer = "MEKTY", withKey = false, onRegenerate, regeneratingIndex, onLinkChange, fallback }: WorksheetSheetProps) {
  const language = sheet.language ?? "ru";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<number[][]>([sheet.tasks.map((_, i) => i)]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = paginate([...root.querySelectorAll<HTMLElement>("[data-task]")].map((task) => task.offsetHeight), TITLE_HEIGHT);
    setPages((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, []);

  // Высоту знают только браузер и загруженный шрифт, поэтому разбивка считается после отрисовки.
  useLayoutEffect(() => {
    measure();
    void document.fonts?.ready.then(measure);
  }, [measure, sheet.tasks]);

  const block = (task: WorksheetTask, i: number) => (
    <TaskBlock
      key={i}
      task={task}
      index={i}
      language={language}
      onRegenerate={onRegenerate ? () => onRegenerate(i) : undefined}
      regenerating={regeneratingIndex === i}
      onLinkChange={onLinkChange ? (link) => onLinkChange(i, link) : undefined}
      fallback={fallback}
    />
  );
  const secondLine = [grade ? (language === "kz" ? `${grade}-сынып` : `${grade} класс`) : "", subject ?? ""].filter(Boolean);

  return (
    <div ref={rootRef} className={s.stack}>
      <style>{PRINT_CSS}</style>
      {pages.map((page, pageIndex) => (
        <article key={pageIndex} className={s.page} data-sheet-page>
          <div className={s.topline}>
            {pageIndex === 0
              ? <><span className={`${s.fieldLine} ${s.fieldLineDate}`}>{language === "kz" ? "Күні" : "Дата"}</span><span className={s.fieldLine}>{language === "kz" ? "Аты-жөні" : "ФИ"}</span></>
              : secondLine.map((part) => <span key={part}>{part}</span>)}
          </div>
          <div className={s.paper}>
            {pageIndex === 0 && <h3 className={s.title}>{sheet.title.replace(/^Рабочий лист:\s*/, "")}</h3>}
            {page.map((i) => block(sheet.tasks[i]!, i))}
          </div>
          <div className={s.footer}>{footer}</div>
        </article>
      ))}
      {withKey && (
        <article className={s.page} data-sheet-page>
          <div className={s.topline}><span>{language === "kz" ? "Мұғалімге жауаптар" : "Ответы для учителя"}</span></div>
          <div className={s.paper}>
            <ul className={s.keyList}>{worksheetAnswerLines(sheet.tasks, language).map((line, i) => <li key={i}>{line}</li>)}</ul>
          </div>
          <div className={s.footer}>{footer}</div>
        </article>
      )}
    </div>
  );
}

function CardCell({ card, index, language }: { card: Flashcard; index: number; language: "ru" | "kz" }) {
  return (
    <div className={s.card} style={tone(index)}>
      <div className={s.cardHead}><span className={s.cardNumber}>{index + 1}</span>{card.front}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {card.imageBase64 && <img className={s.cardImage} src={imageSrc(card.imageBase64, card.imageMime)} alt={card.imageAlt ?? ""} />}
      <p className={s.cardText}>{card.back}</p>
      {card.example && <p className={s.cardExample}><b>{language === "kz" ? "Мысал" : "Пример"}:</b> {card.example}</p>}
      {card.checkQuestion && <p className={s.cardCheck}><b>{language === "kz" ? "Өзіңді тексер" : "Проверь себя"}:</b> {card.checkQuestion}</p>}
    </div>
  );
}

/** Карточки для тетради: шесть на листе A4, с линиями реза. */
export function CardsSheet({ set }: { set: FlashcardSet }) {
  const language = set.language ?? "ru";
  const pages = Array.from({ length: Math.ceil(set.cards.length / CARDS_PER_PAGE) }, (_, i) => set.cards.slice(i * CARDS_PER_PAGE, (i + 1) * CARDS_PER_PAGE));
  return (
    <div className={s.stack}>
      <style>{PRINT_CSS}</style>
      {pages.map((cards, pageIndex) => (
        <article key={pageIndex} className={`${s.page} ${s.cardsPage}`} data-sheet-page>
          <p className={s.cardsNote}>✂ {language === "kz" ? "Сызық бойымен қиып, дәптерге жапсыр" : "Вырежи по линии и вклей в тетрадь"} · {set.title}</p>
          <div className={s.cards}>{cards.map((card, i) => <CardCell key={i} card={card} index={pageIndex * CARDS_PER_PAGE + i} language={language} />)}</div>
        </article>
      ))}
    </div>
  );
}
