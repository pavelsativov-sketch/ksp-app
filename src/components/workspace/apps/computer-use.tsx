'use client';

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  MonitorPlay, Loader2, Play, ShieldAlert, ShieldCheck, Check, X,
  Lock, Hand,
} from "lucide-react";

/**
 * Панель агента «Использование компьютера».
 *
 * Здесь учитель видит живой экран браузера прямо в рабочей области ОС, может
 * в любой момент кликнуть по полю логина/пароля на экране и ввести данные
 * напрямую с клавиатуры, а также подтверждать или отклонять важные действия.
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

interface ActiveFieldInfo {
  tag: string;
  type: string;
  label?: string;
  name?: string;
  placeholder?: string;
  isPassword: boolean;
  isEditable: boolean;
  value?: string;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface PageAuthBarrier {
  requiresUserAction: boolean;
  kind: "login" | "captcha" | "2fa" | null;
  reason: string;
  domain: string;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const status = response.status ? ` (HTTP ${response.status})` : "";
    throw new Error(`Сервис компьютерного агента вернул страницу ошибки вместо данных${status}.`);
  }
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
  EDUCATIONAL_RECORDS_MODIFICATION: "Изменение оценок, посещаемости или учебных записей",
};

const SUGGESTIONS = [
  "BilimClass: открой дэшборд учителя и отметь урок проведённым",
  "BilimClass: на дэшборде нажми 3-ю кнопку (Журнал урока) над предметом и нажми «Провести урок»",
  "BilimClass: открой с дэшборда 2-ю кнопку (Оценки и проведение) или 1-ю кнопку (КТП)",
];

export function ComputerUseApp({ initialGoal, initialUrl }: { initialGoal?: string; initialUrl?: string } = {}) {
  const [goal, setGoal] = useState(
    initialGoal ?? (initialUrl?.includes("bilimclass")
      ? "Открыть дэшборд учителя в BilimClass и отметить урок проведённым"
      : initialUrl?.includes("nobd")
        ? "Войти в НОБД и открыть отчёты"
        : "")
  );
  const [startUrl, setStartUrl] = useState(initialUrl ?? "");

  // Читаем цель из sessionStorage (устанавливается AgentComposer при редиректе)
  useEffect(() => {
    const stored = sessionStorage.getItem('computer-use-goal');
    if (!stored) return;
    const timeout = window.setTimeout(() => {
      setGoal(stored);
      sessionStorage.removeItem('computer-use-goal');
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [control, setControl] = useState<"ai" | "user">("ai");
  const [authBarrier, setAuthBarrier] = useState<PageAuthBarrier | null>(null);
  const [activeField, setActiveField] = useState<ActiveFieldInfo | null>(null);
  const [screenBusy, setScreenBusy] = useState(false);

  const [imgLayout, setImgLayout] = useState<{ width: number; height: number } | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const kbInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const typeBufferRef = useRef("");
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appendLog = useCallback((line: LogLine) => {
    setLog((prev) => [...prev, line].slice(-200));
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

  const applyFrameResponse = useCallback(async (res: Response) => {
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return;
    const rawActiveField = res.headers.get("X-Active-Field");
    const rawAuthBarrier = res.headers.get("X-Auth-Barrier");
    if (rawActiveField) {
      try {
        const parsed = JSON.parse(decodeURIComponent(rawActiveField)) as ActiveFieldInfo;
        setActiveField(parsed);
      } catch {
        setActiveField(null);
      }
    } else {
      setActiveField(null);
    }
    if (rawAuthBarrier) {
      try {
        setAuthBarrier(JSON.parse(decodeURIComponent(rawAuthBarrier)) as PageAuthBarrier);
      } catch { /* ignore */ }
    }
    const blob = await res.blob();
    setScreenshot((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  }, []);

  // Загружаем текущий снимок экрана при открытии окна и пока агент работает
  const refreshScreenshot = useCallback(async () => {
    if (typeBufferRef.current) return;
    try {
      const res = await fetch("/api/agents/computer?action=screenshot", { cache: "no-store" });
      await applyFrameResponse(res);
    } catch {
      // Снимок вспомогательный
    }
  }, [applyFrameResponse]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void refreshScreenshot(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [refreshScreenshot]);

  useEffect(() => {
    if (!running && control !== "user") return;
    const poll = window.setInterval(() => {
      void refreshScreenshot();
    }, 2500);
    return () => window.clearInterval(poll);
  }, [running, control, refreshScreenshot]);

  // Опрашиваем живые события, барьер входа и запросы подтверждения
  useEffect(() => {
    if (!running) return;
    const poll = window.setInterval(async () => {
      try {
        const res = await fetch("/api/agents/computer", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          pending?: PendingAction[];
          events?: LogLine[];
          authBarrier?: PageAuthBarrier | null;
          control?: "ai" | "user";
        };
        if (data.pending) setPending(data.pending);
        if (data.events && data.events.length > 0) {
          setLog(data.events.slice(-200));
        }
        if (data.authBarrier !== undefined) setAuthBarrier(data.authBarrier);
        if (data.control) setControl(data.control);
      } catch {
        // Опрос не обязан быть надёжным
      }
    }, 1500);
    return () => window.clearInterval(poll);
  }, [running]);

  const enqueueScreenAction = useCallback((params: Record<string, string>) => {
    setScreenBusy(true);
    queueRef.current = queueRef.current
      .catch(() => {})
      .then(async () => {
        try {
          const res = await fetch("/api/agents/browser-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
            cache: "no-store",
          });
          await applyFrameResponse(res);
        } finally {
          setScreenBusy(false);
        }
      });
    return queueRef.current;
  }, [applyFrameResponse]);

  const flushTypedBuffer = useCallback(() => {
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    const text = typeBufferRef.current;
    if (!text) return;
    typeBufferRef.current = "";
    void enqueueScreenAction({ action: "type", text });
  }, [enqueueScreenAction]);

  const handleScreenClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    kbInputRef.current?.focus({ preventScroll: true });
    flushTypedBuffer();
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 800);
    if (x < 0 || y < 0 || x >= 1280 || y >= 800) return;
    void enqueueScreenAction({ action: "click", x: String(x), y: String(y) });
  }, [enqueueScreenAction, flushTypedBuffer]);

  const handleScreenKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return;
    const specialKeys = ["Enter", "Tab", "Backspace", "Delete", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (specialKeys.includes(e.key)) {
      e.preventDefault();
      if (e.key === "Backspace") {
        if (typeBufferRef.current.length > 0) {
          typeBufferRef.current = typeBufferRef.current.slice(0, -1);
          return;
        }
        flushTypedBuffer();
        void enqueueScreenAction({ action: "key", key: "Backspace" });
        return;
      }
      flushTypedBuffer();
      void enqueueScreenAction({ action: "key", key: e.key });
    }
  }, [enqueueScreenAction, flushTypedBuffer]);

  const handleScreenInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    e.target.value = "";
    typeBufferRef.current += val;
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    typeTimerRef.current = setTimeout(() => {
      flushTypedBuffer();
    }, 150);
  }, [flushTypedBuffer]);

  const handleScreenPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;
    flushTypedBuffer();
    void enqueueScreenAction({ action: "type", text: pasted });
  }, [enqueueScreenAction, flushTypedBuffer]);

  const toggleControl = useCallback(async (next: "ai" | "user") => {
    flushTypedBuffer();
    setControl(next);
    if (next === "ai") setAuthBarrier(null);
    await fetch("/api/agents/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ control: next }),
    }).catch(() => {});
  }, [flushTypedBuffer]);

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
    setLog([{ type: "THINK", message: `Задача: ${task}` }]);

    try {
      const res = await fetch("/api/agents/computer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: task, startUrl: startUrl.trim() || undefined }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        summary?: string;
        error?: string;
        events?: Array<{ type: string; message: string }>;
      }>(res);

      if (data.events && data.events.length > 0) {
        setLog(data.events);
      }

      if (!res.ok) {
        setError(data.error ?? "Агент не смог выполнить задачу");
      } else {
        setSummary(data.summary || "Задача выполнена");
        appendLog({ type: "END", message: data.summary || "Задача выполнена" });
      }
      void refreshScreenshot();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сбой связи с агентом");
    } finally {
      setRunning(false);
      setPending([]);
    }
  }, [goal, startUrl, running, appendLog, refreshScreenshot]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setImgLayout({ width: rect.width, height: rect.height });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [screenshot]);

  const fieldOverlayStyle = React.useMemo(() => {
    if (!activeField?.box || !imgLayout?.width || !imgLayout?.height) return null;

    const scaleX = 1280 / imgLayout.width;
    const scaleY = 800 / imgLayout.height;
    const scale = Math.max(scaleX, scaleY);
    const renderedW = 1280 / scale;
    const renderedH = 800 / scale;
    const offsetX = (imgLayout.width - renderedW) / 2;
    const offsetY = (imgLayout.height - renderedH) / 2;

    const b = activeField.box;
    const x = offsetX + b.x * (renderedW / 1280);
    const y = offsetY + b.y * (renderedH / 800);
    const w = b.width * (renderedW / 1280);
    const h = b.height * (renderedH / 800);

    if (w <= 0 || h <= 0) return null;

    return {
      left: Math.round(x),
      top: Math.round(y),
      width: Math.max(80, Math.round(w)),
      height: Math.max(26, Math.round(h)),
    };
  }, [activeField, imgLayout]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0d0f1a] text-slate-200">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <MonitorPlay className="size-4 text-sky-400" />
        <span className="text-xs font-semibold">Агент: работа с компьютером</span>
        {running && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-300">
            <Loader2 className="size-3 animate-spin" /> {control === "user" ? "ждёт вашего ввода" : "работает"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {control === "user" ? (
            <button
              type="button"
              onClick={() => void toggleControl("ai")}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-2.5 py-1 text-[10px] font-semibold text-slate-950 hover:bg-emerald-400"
            >
              <Play className="size-3 fill-current" /> Продолжить с ИИ
            </button>
          ) : running ? (
            <button
              type="button"
              onClick={() => void toggleControl("user")}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-medium text-amber-200 hover:bg-amber-400/20"
            >
              <Hand className="size-3" /> Взять управление
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <label className="block text-[11px] font-medium text-slate-400" htmlFor="computer-goal">
          Задача для агента
        </label>
        <textarea
          id="computer-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
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
          placeholder="https://www.bilimclass.kz"
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

        {(control === "user" || authBarrier?.requiresUserAction) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2.5 text-xs text-amber-100">
            <div className="flex items-center gap-2">
              <Lock className="size-4 shrink-0 text-amber-300" />
              <span>
                {authBarrier?.reason || "Кликните прямо по полю логина или пароля на экране ниже и введите данные с клавиатуры."}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void toggleControl("ai")}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400"
            >
              <Play className="size-3 fill-current" /> Готово — передать ИИ
            </button>
          </div>
        )}

        {/* Скрытое поле для прямого клавиатурного ввода при клике по экрану */}
        <input
          ref={kbInputRef}
          type="text"
          defaultValue=""
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Прямой ввод с клавиатуры на экран агента"
          onBlur={flushTypedBuffer}
          onKeyDown={handleScreenKeyDown}
          onChange={handleScreenInputChange}
          onPaste={handleScreenPaste}
          className="absolute left-0 top-0 h-0 w-0 opacity-0 pointer-events-none p-0 m-0 border-0"
          tabIndex={-1}
        />

        {screenshot && (
          <figure className="relative mt-3">
            <img
              ref={imgRef}
              src={screenshot}
              alt="Текущий экран, которым управляет агент"
              onClick={handleScreenClick}
              draggable={false}
              className="w-full cursor-text rounded-lg border border-white/10"
            />
            {screenBusy && (
              <div className="absolute right-2 top-2 h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            )}
            {/* Интерактивная рамка подсветки активного поля на экране */}
            {fieldOverlayStyle && (
              <div
                style={fieldOverlayStyle}
                className={`pointer-events-none absolute z-20 rounded border-2 transition-all ${
                  activeField?.isPassword
                    ? "border-amber-400/90 shadow-[0_0_0_2px_rgba(251,191,36,0.3)]"
                    : "border-sky-400/90 shadow-[0_0_0_2px_rgba(56,189,248,0.3)]"
                }`}
              />
            )}
            <figcaption className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
              <span>Интерактивный экран ОС (кликните по полю логина/пароля и печатайте напрямую)</span>
              <span>Сессии сохраняются ✓</span>
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
                    line.type === "WARNING" || line.type === "PAUSED"
                      ? "text-amber-300"
                      : line.type === "END" || line.type === "RESUMED"
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
