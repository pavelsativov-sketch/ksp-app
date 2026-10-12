"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Terminal, MonitorPlay, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setActiveAgentTask } from "./agent-dock";

/** Эвристика: задача требует реального браузера с кликами? */
function needsBrowser(text: string): boolean {
  return /https?:\/\/|bilim\s*class|нобд|nobd|войди|открой сайт|кликни|нажми кнопку|введи пароль|заполни форму|авторизуй|зайди на/i.test(
    text,
  );
}

const EXAMPLES = [
  "Создай в песочнице файл raspisanie.txt с примером расписания на понедельник и покажи его содержимое",
  "Зайди на https://gov.kz и кратко перескажи, о чём главная страница",
  "Создай файл hello.txt с приветствием и покажи его содержимое",
];

const BROWSER_EXAMPLES = [
  "Войди в BilimClass и отметь урок проведённым",
  "Открой https://bilimclass.kz/login и сообщи что видишь",
  "Зайди на nobd.edu.kz и найди раздел отчётности",
];

/** Композер задачи: описание → реальный запуск агента в песочнице. */
export function AgentComposer() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wantsBrowser = useMemo(() => needsBrowser(prompt), [prompt]);

  async function run() {
    const text = prompt.trim();
    if (text.length < 3 || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      if (res.status === 401) {
        router.push("/login?next=/school");
        return;
      }
      const data = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !data.taskId) {
        setError(data.error ?? "Не удалось запустить агента");
        setPending(false);
        return;
      }
      setActiveAgentTask(data.taskId, text.slice(0, 80));
      setPrompt("");
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    }
    setPending(false);
  }

  function openComputerUse() {
    // Сохраняем задачу в sessionStorage и открываем Computer Use
    if (prompt.trim()) {
      sessionStorage.setItem("computer-use-goal", prompt.trim());
    }
    router.push("/school?os=computer-use");
  }

  const currentExamples = wantsBrowser ? BROWSER_EXAMPLES : EXAMPLES;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <label htmlFor="agent-prompt" className="flex items-center gap-2 text-sm font-bold">
          <Terminal className="size-4 text-primary" /> Опишите задачу — агент выполнит её по-настоящему
        </label>
        <textarea
          id="agent-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void run();
          }}
          rows={3}
          maxLength={4000}
          placeholder="Например: создай файл plan.txt со списком из 5 тем для урока информатики в 7 классе и покажи его"
          className="mt-3 w-full resize-y rounded-xl border border-border bg-background p-3 font-mono text-sm outline-none focus:border-primary"
        />

        {/* ── Подсказка: задача с браузером → предлагаем Computer Use ── */}
        {wantsBrowser && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-300">Задача требует браузера с кликами</p>
              <p className="mt-0.5 text-xs text-amber-200/70">
                Текстовый агент не может кликать и заполнять формы. Используйте{" "}
                <strong>«Работа с компьютером»</strong> — там агент видит экран и нажимает кнопки.
              </p>
              <button
                type="button"
                onClick={openComputerUse}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30"
              >
                <MonitorPlay className="size-3.5" /> Открыть «Работа с компьютером»
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Ctrl+Enter — запустить. Выполнение видно в окне справа внизу.</p>
          <Button onClick={() => void run()} disabled={pending || prompt.trim().length < 3}>
            {pending ? <Loader2 className="animate-spin" /> : <Play />} {pending ? "Запускаю…" : "Запустить агента"}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {currentExamples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setPrompt(ex)}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
          >
            {ex.length > 60 ? ex.slice(0, 60) + "…" : ex}
          </button>
        ))}
      </div>
    </div>
  );
}
