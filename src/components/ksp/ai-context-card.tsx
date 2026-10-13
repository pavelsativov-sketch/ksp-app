"use client";

import type { AiRunContext } from "./hooks/use-plan-ai";
import { Button } from "@/components/ui/button";

export function AiContextCard({
  context,
  locale,
  history = [],
  canReplayExactly,
  onReplay,
}: {
  context: AiRunContext;
  locale: "ru" | "kk";
  history?: AiRunContext[];
  canReplayExactly?: (id: string) => boolean;
  onReplay?: (id: string) => void;
}) {
  const isKk = locale === "kk";
  const { rag } = context;
  const generatedAt = new Intl.DateTimeFormat(isKk ? "kk-KZ" : "ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(context.generatedAt));
  const olderRuns = history.filter((run) => run.id !== context.id).slice(-5).reverse();
  const status = rag.status === "not_selected"
    ? (isKk ? "Оқулық таңдалмаған; нәтиже енгізілген сабақ деректерімен жасалды." : "Учебник не выбран; результат создан только по введённым данным урока.")
    : rag.status === "unavailable"
      ? (isKk ? "Оқулық таңдалды, бірақ мәтінмән алынбады; нәтиже оқулықсыз жасалды." : "Учебник выбран, но контекст не получен; результат создан без него.")
      : rag.status === "degraded"
        ? (isKk ? "Оқулық мәтінмәні резервтік тәсілмен табылды немесе ескерту бар." : "Контекст учебника получен резервным способом или с предупреждением.")
        : (isKk ? "Оқулық мәтінмәні ізделіп, үзінділер генерацияға берілді." : "Контекст учебника найден; перечисленные фрагменты переданы в генерацию.");

  return (
    <details className="rounded-xl border border-[#cfc3b5] bg-[#f8f4ed] p-3 text-xs text-[#453d36]">
      <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        {isKk ? "AI сұрауының мәтінмәні мен дереккөздері" : "Контекст и источники AI-запроса"}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-[11px] text-[#756b63]">{isKk ? "Соңғы сәтті сұрау:" : "Последний успешный запрос:"} {generatedAt}</p>
        <p className="text-[11px] text-[#756b63]">{isKk ? "Үлгі нұсқасы" : "Версия пайплайна"}: {context.promptVersion} · {isKk ? "КСП нұсқасы" : "Версия КСП"}: {context.planRevision?.slice(0, 19) ?? (isKk ? "сақталмаған" : "ещё не сохранён")}</p>
        <p role="status">{status}</p>
        <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="font-medium">{isKk ? "Сынып" : "Класс"}</dt><dd>{context.grade}</dd>
          <dt className="font-medium">{isKk ? "Пән" : "Предмет"}</dt><dd>{context.subject || "—"}</dd>
          <dt className="font-medium">{isKk ? "Тақырып" : "Тема"}</dt><dd>{context.topic}</dd>
          <dt className="font-medium">{isKk ? "Жұмыс тілі" : "Язык"}</dt><dd>{context.language === "kz" ? "Қазақша / KZ" : "Русский / RU"}</dd>
          <dt className="font-medium">{isKk ? "Мектеп профилі" : "Профиль школы"}</dt><dd>{context.schoolProfile?.toUpperCase() ?? "—"}</dd>
          <dt className="font-medium">{isKk ? "Бөлім" : "Раздел"}</dt><dd>{context.section || "—"}</dd>
          <dt className="font-medium">{isKk ? "Алдыңғы сабақ контексті" : "Контекст прошлого урока"}</dt>
          <dd>{context.previousLessonContextIncluded ? (isKk ? "берілді" : "передавался") : (isKk ? "берілмеді" : "не передавался")}</dd>
          <dt className="font-medium">{isKk ? "Оқулық таңдалды" : "Учебник выбран"}</dt><dd>{context.textbookSelected ? (isKk ? "иә" : "да") : (isKk ? "жоқ" : "нет")}</dd>
        </dl>
        <div>
          <h4 className="font-semibold">{isKk ? "Оқу мақсаттары" : "Учебные цели"}</h4>
          {context.learningObjectives.length > 0
            ? <ul className="mt-1 list-disc space-y-1 pl-5">{context.learningObjectives.map((objective, index) => <li key={`${index}:${objective}`}>{objective}</li>)}</ul>
            : <p className="mt-1">{isKk ? "Мақсаттар берілмеді." : "Цели не передавались."}</p>}
        </div>
        <div>
          <h4 className="font-semibold">{isKk ? "Оқулық дереккөздері" : "Источники учебника"} ({rag.chunkCount})</h4>
          {rag.textbookTitle && <p className="mt-1">{rag.textbookTitle}</p>}
          {rag.method && <p className="mt-1 text-[11px] text-[#756b63]">{isKk ? "Іздеу әдісі" : "Метод поиска"}: {rag.method}</p>}
          {rag.sources.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {rag.sources.map((source) => <li key={source.id}>
                {source.pageNumber !== null ? (isKk ? `${source.pageNumber}-бет` : `стр. ${source.pageNumber}`) : (isKk ? "бет белгісіз" : "страница не указана")}
                {` · ${isKk ? "үзінді" : "фрагмент"} ${source.chunkIndex + 1} · id ${source.id.slice(-8)}`}
              </li>)}
            </ul>
          ) : <p className="mt-1">{isKk ? "Қолданылған үзінділер жоқ." : "Использованных фрагментов нет."}</p>}
          {rag.warnings.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">{rag.warnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}</ul>}
        </div>
        <p className="text-[11px] text-[#756b63]">
          {isKk ? "AI-дың жасырын ішкі пайымдары көрсетілмейді. Қауіпсіз метадеректер ағымдағы қойындының sessionStorage ішінде сақталады." : "Внутренние рассуждения AI не показываются. Безопасные метаданные хранятся в sessionStorage текущей вкладки."}
        </p>
        {onReplay && (
          <div className="space-y-2 border-t border-[#ddd5cb] pt-3">
            <Button type="button" size="sm" variant="outline" onClick={() => onReplay(context.id)}>
              {canReplayExactly?.(context.id)
                ? (isKk ? "Дәл сұрауды қайта іске қосу және алдын ала қарау" : "Повторить точный запрос и открыть предпросмотр")
                : (isKk ? "Қауіпсіз қайталау және алдын ала қарау" : "Повторить безопасно и открыть предпросмотр")}
            </Button>
            {context.replayInput.previousHomeworkIncluded && !canReplayExactly?.(context.id) && (
              <p className="text-[11px] text-amber-800">
                {isKk ? "Құпиялылық үшін үй тапсырмасының мәтіні тарихта сақталмайды; қайталау оны қоспайды." : "Текст домашнего задания не сохраняется в истории; повтор из истории будет без него."}
              </p>
            )}
          </div>
        )}
        {olderRuns.length > 0 && onReplay && (
          <details className="border-t border-[#ddd5cb] pt-3">
            <summary className="cursor-pointer font-semibold">{isKk ? `Алдыңғы сұраулар (${history.length - 1})` : `Предыдущие запросы (${history.length - 1})`}</summary>
            <ul className="mt-2 space-y-2">
              {olderRuns.map((run) => {
                const exact = canReplayExactly?.(run.id) ?? false;
                const date = new Intl.DateTimeFormat(isKk ? "kk-KZ" : "ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(run.generatedAt));
                return <li key={run.id} className="rounded-lg border border-[#ddd5cb] bg-white p-2">
                  <p className="font-medium">{run.topic} · {date}</p>
                  <p className="text-[11px] text-[#756b63]">{run.promptVersion} · {run.rag.textbookTitle ?? (isKk ? "оқулықсыз" : "без учебника")} · {run.rag.chunkCount} {isKk ? "үзінді" : "фрагментов"}</p>
                  <Button className="mt-2" type="button" size="sm" variant="outline" onClick={() => onReplay(run.id)}>
                    {exact ? (isKk ? "Дәл қайталау" : "Повторить точный запрос") : (isKk ? "Қауіпсіз қайталау" : "Повторить безопасно")}
                  </Button>
                  {run.replayInput.previousHomeworkIncluded && !exact && <p className="mt-1 text-[11px] text-amber-800">{isKk ? "Үй жұмысының мәтіні әдейі сақталмады." : "Текст домашнего задания намеренно не сохранялся."}</p>}
                </li>;
              })}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}
