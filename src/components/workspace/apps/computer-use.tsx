'use client';

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MonitorPlay, Loader2, Play, ShieldAlert, ShieldCheck, Check, X } from "lucide-react";

/**
 * Панель агента «Использование компьютера».
 *
 * Здесь учитель видит, что агент собирается сделать, и решает по опасным
 * действиям. Молчание трактуется как отказ, поэтому кнопки «Разрешить» и
 * «Отклонить» равнозначны по последствию отсутствия ответа — но явный отказ
 * понятнее и попадает в лог задачи.
 */

interface LogLine {
  type: string;
  message: string;
}

interface PendingAction {
  id: string;
  action: { name: string; intent: string; args: Record<string, unknown> };
  decision: { risk: string; reason: string; policy?: string };
  probe: { label: string; tag: string; visible: boolean };
}

const RISK_LABEL: Record<string, string> = {
  FINANCIAL_TRANSACTIONS: "Платёж или покупка",
  SENSITIVE_DATA_MODIFICATION: "Личные или государственные данные",
  COMMUNICATION_TOOL: "Отправка сообщений",
  ACCOUNT_CREATION: "Создание учётной записи",
  DATA_MODIFICATION: "Изменение или удаление данных",
  USER_CONSENT_MANAGEMENT: "Согласие на cookie",
  LEGAL_TERMS_AND_AGREEMENTS: "Принятие условий",
  CAPTCHA: "Проверка «я не робот»",
  LOGIN: "Вход в учётную запись",
};

const SUGGESTIONS = [
  "Найди на сайте школы расписание на завтра",
  "Открой материалы по теме «Дроби» и найди в них видео",
  "Собери ссылки на бесплатные тренажёры по математике 5 класс",
];

export function ComputerUseApp() {
  const [goal, setGoal] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((line: LogLine) => {
    setLog((prev) => [...prev, line].slice(-200));
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

  // Пока агент работает, опрашиваем журнал и снимок экрана: длинный POST сам
  // по себе не отдаёт промежуточных событий, а учитель должен видеть ход
  // работы, а не пустое окно пять минут.
  useEffect(() => {
    if (!running) return;
    const poll = window.setInterval(async () => {
      try {
        const res = await fetch("/api/agents/computer?action=screenshot", {
          cache: "no-store",
        });
        if (res.ok) {
          const blob = await res.blob();
          setScreenshot((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        }
      } catch {
        // Снимок — вспомогательный, его отсутствие не должно ломать панель.
      }
    }, 3000);
    return () => window.clearInterval(poll);
  }, [running]);

  // Запросы подтверждения приходят отдельным маршрутом: цикл агента висит
  // в длинном POST и отдать их по нему не может.
  useEffect(() => {
    if (!running) return;
    const poll = window.setInterval(async () => {
      try {
        const res = await fetch("/api/agents/computer", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { pending?: PendingAction[] };
        if (data.pending) setPending(data.pending);
      } catch {
        // Опрос не обязан быть надёжным: пропущенный ответ = отказ, и агент
        // не станет действовать без подтверждения.
      }
    }, 1500);
    return () => window.clearInterval(poll);
  }, [running]);

  const answer = useCallback(async (id: string, allow: boolean) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch("/api/agents/computer/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, allow }),
      });
    } catch {
      setError("Не удалось передать ответ агенту");
    }
  }, []);

  const start = useCallback(async () => {
    const task = goal.trim();
    if (task.length < 3 || running) return;
    setRunning(true);
    setError(null);
    setSummary(null);
    setPending([]);
    setLog([]);
    appendLog({ type: "THINK", message: `Задача: ${task}` });

    try {
      const res = await fetch("/api/agents/computer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: task, startUrl: startUrl.trim() || undefined }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        summary?: string;
        error?: string;
        events?: Array<{ type: string; message: string }>;
      };

      for (const event of data.events ?? []) appendLog(event);

      if (!res.ok) {
        setError(data.error ?? "Агент не смог выполнить задачу");
      } else {
        setSummary(data.summary || "Задача выполнена");
        appendLog({ type: "END", message: data.summary || "Задача выполнена" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сбой связи с агентом");
    } finally {
      setRunning(false);
      setPending([]);
    }
  }, [goal, startUrl, running, appendLog]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0d0f1a] text-slate-200">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <MonitorPlay className="size-4 text-sky-400" />
        <span className="text-xs font-semibold">Агент: работа с компьютером</span>
        {running && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-300">
            <Loader2 className="size-3 animate-spin" /> работает
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <label className="block text-[11px] font-medium text-slate-400" htmlFor="computer-goal">
          Задача для агента
        </label>
        <textarea
          id="computer-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          disabled={running}
          placeholder="Например: найди на сайте материалы по теме «Дроби» и открой раздел с упражнениями"
          className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-xs outline-none placeholder:text-slate-600 focus:border-sky-500/60 disabled:opacity-60"
        />

        <label className="mt-2 block text-[11px] font-medium text-slate-400" htmlFor="computer-url">
          Начать с этой страницы (необязательно)
        </label>
        <input
          id="computer-url"
          value={startUrl}
          onChange={(e) => setStartUrl(e.target.value)}
          disabled={running}
          placeholder="https://school.kz/lessons"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-xs outline-none placeholder:text-slate-600 focus:border-sky-500/60 disabled:opacity-60"
        />

        {!running && !goal && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setGoal(s)}
                className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-400 transition-colors hover:border-sky-500/40 hover:text-sky-300"
              >
                {s.length > 46 ? `${s.slice(0, 46)}…` : s}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => void start()}
          disabled={running || goal.trim().length < 3}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Запустить агента
        </button>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">
            {error}
          </p>
        )}
        {summary && !error && (
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
            {summary}
          </p>
        )}

        {screenshot && (
          <figure className="mt-3">
            <img
              src={screenshot}
              alt="Текущий экран, которым управляет агент"
              className="w-full rounded-lg border border-white/10"
            />
            <figcaption className="mt-1 text-[10px] text-slate-500">
              Экран, который видит агент
            </figcaption>
          </figure>
        )}

        {log.length > 0 && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Ход работы
            </p>
            <ul className="space-y-1">
              {log.map((line, i) => (
                <li
                  key={`${line.type}-${i}`}
                  className={`text-[11px] leading-snug ${
                    line.type === "WARNING"
                      ? "text-amber-300"
                      : line.type === "END"
                        ? "text-emerald-300"
                        : line.type === "ERROR"
                          ? "text-rose-300"
                          : "text-slate-400"
                  }`}
                >
                  {line.message}
                </li>
              ))}
              <div ref={logEndRef} />
            </ul>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/5 p-3">
          {pending.map((p) => (
            <div key={p.id} className="mb-2 last:mb-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <ShieldAlert className="size-3.5" />
                Требуется ваше решение
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                {p.action.name === "click"
                  ? `Нажать на «${p.probe.label.slice(0, 70) || "элемент без подписи"}»`
                  : p.action.name === "type"
                    ? `Ввести текст в поле «${p.probe.label.slice(0, 50) || "без подписи"}»`
                    : p.action.name === "navigate"
                      ? `Перейти на ${String(p.action.args.url ?? "").slice(0, 70)}`
                      : p.action.name}
              </p>
              {p.action.intent && (
                <p className="mt-0.5 text-[11px] text-slate-500 italic">Зачем: {p.action.intent}</p>
              )}
              <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-200/90">
                <ShieldCheck className="size-3" />
                {RISK_LABEL[p.decision.policy ?? ""] ?? "Действие с последствиями"}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void answer(p.id, true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Check className="size-3.5" /> Разрешить
                </button>
                <button
                  type="button"
                  onClick={() => void answer(p.id, false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/20"
                >
                  <X className="size-3.5" /> Отклонить
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Если не ответить за 2 минуты, действие будет отклонено.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
