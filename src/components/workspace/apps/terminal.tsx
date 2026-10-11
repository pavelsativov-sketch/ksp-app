"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { LoaderCircle, TerminalSquare } from "lucide-react";

interface TerminalEntry {
  command: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: string;
}

export function TerminalApp() {
  const [command, setCommand] = useState("");
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Подключаю изолированную среду…");
  const [available, setAvailable] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/agents/terminal", { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() as { available?: boolean; status?: string; error?: string; cwd?: string } }))
      .then(({ response, data }) => {
        if (!active) return;
        setAvailable(response.ok && data.available === true);
        setStatus(data.available ? `Linux ${data.status ?? "готов"} · ${data.cwd ?? ""} · сессия до 15 минут` : data.error ?? "В бесплатной облачной среде Linux-команды недоступны");
      })
      .catch(() => { if (active) setStatus("Не удалось подключить Linux-среду"); });
    return () => { active = false; };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [entries, busy]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const requested = command.trim();
    if (!requested || busy || !available) return;
    setCommand("");
    setHistory((previous) => [...previous, requested]);
    setHistoryIndex(-1);
    setBusy(true);
    try {
      const response = await fetch("/api/agents/terminal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: requested, timeoutMs: 90_000 }),
      });
      const data = await response.json() as { stdout?: string; stderr?: string; exitCode?: number; error?: string; cwd?: string };
      setEntries((previous) => [...previous, {
        command: requested, stdout: data.stdout ?? "", stderr: data.stderr ?? "", exitCode: data.exitCode, error: data.error,
      }]);
      if (!response.ok && data.error) setStatus(data.error);
    } catch {
      setEntries((previous) => [...previous, { command: requested, stdout: "", stderr: "", error: "Не удалось отправить команду" }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const index = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(index);
      setCommand(history[index] ?? "");
    } else if (event.key === "ArrowDown" && historyIndex >= 0) {
      event.preventDefault();
      const index = historyIndex + 1;
      setHistoryIndex(index >= history.length ? -1 : index);
      setCommand(history[index] ?? "");
    } else if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      setEntries([]);
    }
  }

  return (
    <section className="flex h-full min-h-64 flex-col bg-[#0c0c14] font-mono text-[13px] text-white" aria-label="Linux-терминал">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2 text-[11px] text-white/55">
        <TerminalSquare className="size-4 text-sky-300" aria-hidden="true" />
        <span className="truncate">{status}</span>
      </header>
      <div className="flex-1 overflow-y-auto p-4" onClick={() => inputRef.current?.focus()}>
        <div className="mb-3 text-xs text-white/40">Файлы рабочей области сохраняются в вашем аккаунте. Команды запускаются в изолированной Linux Sandbox; одна команда может выполняться до 90 секунд, сессия — до 15 минут.</div>
        {entries.map((entry, index) => (
          <div key={`${index}-${entry.command}`} className="mb-3 whitespace-pre-wrap break-words">
            <div><span className="text-emerald-300">workspace $</span> <span>{entry.command}</span></div>
            {entry.stdout && <pre className="mt-1 whitespace-pre-wrap font-mono text-white/85">{entry.stdout.replace(/\n$/, "")}</pre>}
            {entry.stderr && <pre className="mt-1 whitespace-pre-wrap font-mono text-rose-300">{entry.stderr.replace(/\n$/, "")}</pre>}
            {entry.error && <p className="mt-1 text-rose-300">{entry.error}</p>}
            {entry.exitCode !== undefined && entry.exitCode !== 0 && <p className="mt-1 text-amber-300">Процесс завершился с кодом {entry.exitCode}</p>}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-white/45"><LoaderCircle className="size-4 animate-spin" /> Выполняю…</div>}
        {!available && entries.length === 0 && <p className="mt-4 text-amber-200/80">Файлы и браузер агента доступны. Запуск Linux-команд требует отдельной среды выполнения и здесь отключён.</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4 py-3">
        <span className="shrink-0 text-emerald-300">$</span>
        <input
          ref={inputRef} value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={handleKeyDown}
          disabled={!available || busy} aria-label="Команда Linux" autoComplete="off" spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/30 disabled:opacity-50"
          placeholder={available ? "Введите команду…" : "Linux-среда пока недоступна"}
        />
        <button type="submit" disabled={!available || busy || !command.trim()} className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/15 disabled:opacity-40">Запустить</button>
      </form>
    </section>
  );
}
