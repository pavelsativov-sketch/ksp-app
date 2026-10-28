"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Sparkles, MonitorPlay, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setActiveAgentTask } from "./agent-dock";
import { useWorkspaceStore } from "@/lib/store/workspace";
import { useOsShellStore } from "@/lib/store/os-shell";

/** Эвристика: задача требует реального браузера с кликами? */
function needsBrowser(text: string): boolean {
  return /https?:\/\/|bilim\s*class|билим\s*клас+|kundelik|күнделік|нобд|nobd|дэшборд|дешборд|провести\s+урок|урок\s+провед|войди|открой сайт|кликни|нажми кнопку|введи пароль|заполни форму|авторизуй|зайди на/i.test(
    text,
  );
}

const PEDAGOGICAL_EXAMPLES = [
  "Составь аналитическую справку ВШК по посещённому уроку алгебры в 8 классе",
  "Сделай анализ СОР №1 по естествознанию: 24 уч., качество 71%, типичные ошибки",
  "Напиши психолого-педагогическую характеристику на ученика 9 класса для ПМПК",
  "Подготовь повестку и доклад классного руководителя на родительское собрание",
  "Составь индивидуальный план (ИОМ) ликвидации пробелов по математике на 4 недели",
  "Проверь поурочный план (КСП) по физике 7 класс на соответствие целям ГОСО",
];

const BROWSER_EXAMPLES = [
  "Открой дэшборд BilimClass и поставь, что урок проведён",
  "BilimClass: нажми 3-ю кнопку (Журнал урока) над предметом и нажми «Провести урок»",
  "BilimClass: открой 2-ю кнопку (Оценки и проведение) или 1-ю кнопку (КТП) с дэшборда",
  "Зайди на nobd.edu.kz в раздел школьной отчётности",
];

/** Педагогический композер задач ИИ-ассистента */
export function AgentComposer() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        setPending(false);
        router.push("/login?next=/school/workspace");
        return;
      }
      const data = (await res.json()) as { taskId?: string; status?: string; error?: string };
      if (!res.ok || !data.taskId) {
        setError(data.error ?? "Не удалось запустить ассистента");
        setPending(false);
        return;
      }
      if (data.status === "queued") {
        setNotice("Задача поставлена в очередь: предыдущая ещё выполняется. Она запустится автоматически.");
      } else {
        setNotice(null);
      }
      setActiveAgentTask(data.taskId, text.slice(0, 80), text);
      setPrompt("");
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    }
    setPending(false);
  }

  function openComputerUse() {
    if (prompt.trim()) {
      sessionStorage.setItem("computer-use-goal", prompt.trim());
    }
    useOsShellStore.getState().setTab("os");
    useWorkspaceStore.getState().openWindow("computer-use", "Работа с компьютером", "computer-use");
    router.push("/school?os=computer-use");
  }

  const currentExamples = wantsBrowser ? BROWSER_EXAMPLES : PEDAGOGICAL_EXAMPLES;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 shadow-sm">
        <label htmlFor="agent-prompt" className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Sparkles className="size-4 text-emerald-400" /> Опишите задачу для ИИ-ассистента Mekty
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
          placeholder="Опишите задачу (например: открой дэшборд BilimClass и поставь, что урок проведён, или составь анализ СОР №1)..."
          className="mt-2.5 w-full resize-y rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
        />

        {/* ── Подсказка: задача с браузером (BilimClass / Kundelik / НОБД) ── */}
        {wantsBrowser && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-300">Режим работы с BilimClass / НОБД</p>
              <p className="mt-0.5 text-[11px] text-amber-200/80">
                Нажмите <strong>«Запустить агента»</strong> (ИИ сам откроет вкладку «Браузер» справа, перейдёт на дэшборд BilimClass, найдёт 3 кнопки над предметом и проведёт урок) или откройте отдельное приложение <strong>«Работа с компьютером»</strong>.
              </p>
              <button
                type="button"
                onClick={openComputerUse}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/30"
              >
                <MonitorPlay className="size-3.5" /> Открыть «Работа с компьютером»
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">Ctrl+Enter — отправить запрос</p>
          <Button
            onClick={() => void run()}
            disabled={pending || prompt.trim().length < 3}
            className="h-8 gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {pending ? "Запуск…" : "Запустить агента"}
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        {notice && <p className="mt-2 text-xs text-sky-300">{notice}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {currentExamples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setPrompt(ex)}
            className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:border-emerald-500/40 hover:bg-white/[0.05] hover:text-slate-200 text-left"
          >
            {ex.length > 50 ? ex.slice(0, 50) + "…" : ex}
          </button>
        ))}
      </div>
    </div>
  );
}
