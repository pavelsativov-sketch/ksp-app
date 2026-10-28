"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { LoaderCircle, TerminalSquare, Eraser, Copy, Check } from "lucide-react";
import { useTerminalStore, type TerminalInfo } from "@/lib/store/terminal";

/** Подписи терминала: команды всегда выполняются в облачной Linux-песочнице. */
const SHELL = { label: "Linux", prompt: "workspace $" } as const;

export function TerminalApp() {
  const entries = useTerminalStore((s) => s.entries);
  const history = useTerminalStore((s) => s.history);
  const addEntry = useTerminalStore((s) => s.addEntry);
  const addHistory = useTerminalStore((s) => s.addHistory);
  const clear = useTerminalStore((s) => s.clear);

  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const info = useTerminalStore((s) => s.info);
  const setInfo = useTerminalStore((s) => s.setInfo);
  const [statusText, setStatusText] = useState(info ? "" : "Подключаю рабочую среду…");
  const [availableOverride, setAvailable] = useState<boolean | null>(null);
  // До ответа сервера берём последнее известное состояние, а не «недоступно»:
  // иначе при возврате на вкладку поле ввода мигало бы выключенным.
  const available = availableOverride ?? info?.available === true;
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copied, setCopied] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const known = info !== null;

  useEffect(() => {
    let active = true;
    fetch("/api/agents/terminal", { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() as TerminalInfo }))
      .then(({ response, data }) => {
        if (!active) return;
        const ok = response.ok && data.available === true;
        setInfo(data);
        setAvailable(ok);
        setStatusText(ok
          ? `${SHELL.label} ${data.status ?? "готов"} · ${data.cwd ?? ""} · сессия до 15 минут`
          : data.error ?? "Среда выполнения команд недоступна");
      })
      .catch(() => { if (active) setStatusText("Не удалось подключить рабочую среду"); });
    return () => { active = false; };
  }, [setInfo]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [entries, busy]);

  useEffect(() => { if (available) inputRef.current?.focus(); }, [available]);

  async function stop() {
    try {
      await fetch("/api/agents/terminal/stop", { method: "POST" });
    } catch {
      // команда могла завершиться сама — игнорируем
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const requested = command.trim();
    if (!requested || busy || !available) return;
    if (requested === "clear" || requested === "cls") {
      setCommand("");
      clear();
      return;
    }
    setCommand("");
    addHistory(requested);
    setHistoryIndex(-1);
    setBusy(true);
    try {
      const response = await fetch("/api/agents/terminal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: requested, timeoutMs: 90_000 }),
      });
      const data = await response.json() as { stdout?: string; stderr?: string; exitCode?: number; error?: string };
      addEntry({
        command: requested, stdout: data.stdout ?? "", stderr: data.stderr ?? "", exitCode: data.exitCode, error: data.error,
      });
      if (!response.ok && data.error) setStatusText(data.error);
    } catch {
      addEntry({ command: requested, stdout: "", stderr: "", error: "Не удалось отправить команду" });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.length === 0) return;
      const index = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(index);
      setCommand(history[index] ?? "");
    } else if (event.key === "ArrowDown" && historyIndex >= 0) {
      event.preventDefault();
      const index = historyIndex + 1;
      setHistoryIndex(index >= history.length ? -1 : index);
      setCommand(index >= history.length ? "" : history[index] ?? "");
    } else if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      clear();
    } else if (event.ctrlKey && event.key.toLowerCase() === "c" && busy) {
      event.preventDefault();
      void stop();
    }
  }

  async function copyOutput(index: number) {
    const entry = entries[index];
    if (!entry) return;
    const text = [entry.stdout, entry.stderr, entry.error].filter(Boolean).join("\n").trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied((current) => (current === index ? null : current)), 1500);
    } catch {
      // буфер обмена недоступен — молча пропускаем
    }
  }

  return (
    <section className="flex h-full min-h-64 flex-col bg-[#0c0c14] font-mono text-[13px] text-white" aria-label="Терминал">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2 text-[11px] text-white/55">
        <TerminalSquare className="size-4 text-sky-300" aria-hidden="true" />
        <span className="truncate">{statusText || (info ? `${SHELL.label} ${info.status ?? "готов"} · ${info.cwd ?? ""}` : "")}</span>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={clear}
            aria-label="Очистить терминал"
            title="Очистить вывод (Ctrl+L)"
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white/80"
          >
            <Eraser className="size-3" /> Очистить
          </button>
        )}
      </header>
      <div className="flex-1 overflow-y-auto p-4" onClick={() => inputRef.current?.focus()}>
        <div className="mb-3 text-xs text-white/40">
          {!known
            ? "Подключаю рабочую среду…"
            : "Файлы рабочей области сохраняются в вашем аккаунте. Команды запускаются в изолированной Linux Sandbox: это облако, ваш компьютер они не затрагивают. Одна команда может выполняться до 90 секунд, сессия — до 15 минут."}
        </div>
        {entries.map((entry, index) => (
          <div key={`${index}-${entry.command}`} className="group mb-3 whitespace-pre-wrap break-words">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><span className="text-emerald-300">{SHELL.prompt}</span> <span>{entry.command}</span></div>
              {(entry.stdout || entry.stderr || entry.error) && (
                <button
                  type="button"
                  onClick={() => void copyOutput(index)}
                  aria-label="Скопировать вывод"
                  title="Скопировать вывод"
                  className="shrink-0 rounded p-1 text-white/30 opacity-0 transition-opacity hover:bg-white/10 hover:text-white/70 focus:opacity-100 group-hover:opacity-100"
                >
                  {copied === index ? <Check className="size-3 text-emerald-300" /> : <Copy className="size-3" />}
                </button>
              )}
            </div>
            {entry.stdout && <pre className="mt-1 whitespace-pre-wrap font-mono text-white/85">{entry.stdout.replace(/\n$/, "")}</pre>}
            {entry.stderr && <pre className="mt-1 whitespace-pre-wrap font-mono text-rose-300">{entry.stderr.replace(/\n$/, "")}</pre>}
            {entry.error && <p className="mt-1 text-rose-300">{entry.error}</p>}
            {!entry.stdout && !entry.stderr && !entry.error && entry.exitCode === 0 && <p className="mt-1 text-white/30">Готово, вывода нет</p>}
            {entry.exitCode !== undefined && entry.exitCode !== 0 && <p className="mt-1 text-amber-300">Процесс завершился с кодом {entry.exitCode}</p>}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-white/45">
            <LoaderCircle className="size-4 animate-spin" /> Выполняю…
            <button
              type="button"
              onClick={stop}
              className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/20"
              aria-label="Остановить команду"
            >
              Стоп
            </button>
          </div>
        )}
        {!available && entries.length === 0 && <p className="mt-4 text-amber-200/80">Файлы и браузер агента доступны. Запуск команд требует отдельной среды выполнения и здесь отключён.</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4 py-3">
        <span className="shrink-0 text-emerald-300">$</span>
        <input
          ref={inputRef} value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={handleKeyDown}
          disabled={!available || busy} aria-label={`Команда ${SHELL.label}`} autoComplete="off" spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/30 disabled:opacity-50"
          placeholder={available ? "Введите команду…" : "Среда выполнения пока недоступна"}
        />
        <button type="submit" disabled={!available || busy || !command.trim()} className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/15 disabled:opacity-40">Запустить</button>
      </form>
    </section>
  );
}
