"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  fetchQuizEvents,
  generateStudentId,
  postQuizEvent,
  type HostQuestionMsg,
  type HostState,
  type LiveLeaderboardEntry,
  type PublicTask,
} from "@/lib/ksp/live-quiz";
import type { TaskAnswer } from "@/lib/ksp/tasks";

type Phase = "name" | "lobby" | "question" | "submitted" | "reveal" | "ended";

export function LiveQuizStudent({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  // Идентификатор ученика сохраняется в sessionStorage по коду комнаты:
  // после обновления страницы (F5) тот же ученик остаётся тем же участником,
  // а не получает новую личность (иначе можно отвечать повторно).
  const [studentId, setStudentId] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(`ksp-quiz-student:${initialCode}`) ?? generateStudentId();
    } catch {
      return generateStudentId();
    }
  });
  const [phase, setPhase] = useState<Phase>("name");
  const [error, setError] = useState<string | null>(null);

  const [currentQ, setCurrentQ] = useState<HostQuestionMsg | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [revealText, setRevealText] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LiveLeaderboardEntry[]>([]);

  const lastSeqRef = useRef(0);

  // При смене кода на экране входа пересоздаём идентификатор под новый код.
  function ensureStudentIdForCode(targetCode: string) {
    if (phase !== "name") return;
    const key = `ksp-quiz-student:${targetCode}`;
    try {
      const existing = window.sessionStorage.getItem(key);
      if (existing) {
        setStudentId(existing);
        return;
      }
      const fresh = generateStudentId();
      window.sessionStorage.setItem(key, fresh);
      setStudentId(fresh);
    } catch {
      setStudentId(generateStudentId());
    }
  }

  useEffect(() => {
    if (phase !== "question") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  // Polling событий хоста после входа.
  useEffect(() => {
    if (phase !== "lobby" && phase !== "question" && phase !== "submitted" && phase !== "reveal") return;
    let alive = true;
    async function poll() {
      try {
        const events = await fetchQuizEvents(code, lastSeqRef.current);
        if (!alive) return;
        for (const ev of events) {
          lastSeqRef.current = Math.max(lastSeqRef.current, ev.seq);
          if (ev.event === "host:question") {
            const m = ev.payload as HostQuestionMsg;
            setCurrentQ(m);
            setQuestionStartedAt(Date.now());
            setEndsAt(m.endsAt ?? null);
            setRevealText(null);
            setPhase("question");
          } else if (ev.event === "host:reveal") {
            const m = ev.payload as { index: number; correctSummary: string };
            setRevealText(m.correctSummary);
            setPhase("reveal");
          } else if (ev.event === "host:state") {
            const m = ev.payload as HostState;
            setLeaderboard(m.leaderboard);
          } else if (ev.event === "host:end") {
            const m = ev.payload as { leaderboard: LiveLeaderboardEntry[] };
            setLeaderboard(m.leaderboard);
            setPhase("ended");
          }
        }
      } catch {
        // polling продолжается
      }
    }
    const t = setInterval(poll, 1500);
    void poll();
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [code, phase]);

  function join() {
    if (!/^\d{6}$/.test(code)) {
      setError("Код должен состоять из 6 цифр");
      return;
    }
    if (!name.trim()) {
      setError("Введите имя");
      return;
    }
    setError(null);
    void postQuizEvent(code, "student:join", { studentId, name: name.trim() });
    setPhase("lobby");
  }

  function submit(answer: TaskAnswer) {
    if (!currentQ) return;
    const ms = Date.now() - (questionStartedAt ?? Date.now());
    void postQuizEvent(code, "student:answer", { studentId, index: currentQ.index, answer, ms });
    setPhase("submitted");
  }

  // ---------- render ----------

  if (phase === "name") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1c1a17] p-4">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-[#ddd5cb] bg-surface p-6 text-[#1c1a17]">
          <div className="text-center">
            <p className="editorial-kicker">Классный режим</p><h1 className="editorial-display mt-2 text-4xl">Live-квиз</h1>
            <p className="mt-2 text-sm text-[#5f5751]">Введите код от учителя</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Код комнаты</Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              className="text-center font-mono text-2xl tracking-widest"
              value={code}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, "");
                setCode(next);
                ensureStudentIdForCode(next);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Ваше имя</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Алия К."
              maxLength={40}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button onClick={join} className="w-full">
            Войти
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "lobby") {
    return (
      <CenterScreen>
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3" />
        <p className="text-lg font-medium">Привет, {name}!</p>
        <p className="text-sm text-slate-500">Ждём начала квиза…</p>
      </CenterScreen>
    );
  }

  if (phase === "submitted") {
    return (
      <CenterScreen>
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mb-3" />
        <p className="text-lg font-medium">Ответ отправлен</p>
        <p className="text-sm text-slate-500">Ждём остальных…</p>
      </CenterScreen>
    );
  }

  if (phase === "reveal") {
    return (
      <CenterScreen>
        <p className="text-sm text-slate-500 mb-2">Ответ</p>
        <p className="text-lg font-semibold text-center text-emerald-700 max-w-md">
          {revealText ?? "—"}
        </p>
      </CenterScreen>
    );
  }

  if (phase === "ended") {
    const myEntry = leaderboard.find((e) => e.studentId === studentId);
    const myRank = myEntry ? leaderboard.indexOf(myEntry) + 1 : null;
    return (
      <CenterScreen>
        <Trophy className="w-12 h-12 text-amber-500 mb-2" />
        <p className="text-2xl font-bold mb-1">Квиз завершён</p>
        {myEntry ? (
          <>
            <p className="text-lg">
              Ваше место: <span className="font-bold text-indigo-700">#{myRank}</span>
            </p>
            <p className="text-sm text-slate-500">Очки: {myEntry.score}</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">Ваши результаты не нашлись</p>
        )}
        <div className="mt-4 w-full max-w-sm">
          <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Топ-5</p>
          <ul className="bg-surface border rounded-lg overflow-hidden">
            {leaderboard.slice(0, 5).map((e, i) => (
              <li
                key={e.studentId}
                className={
                  "px-3 py-2 text-sm flex justify-between border-b last:border-b-0 " +
                  (e.studentId === studentId ? "bg-indigo-50 font-semibold" : "")
                }
              >
                <span>
                  {i + 1}. {e.name}
                </span>
                <span className="font-mono">{e.score}</span>
              </li>
            ))}
          </ul>
        </div>
      </CenterScreen>
    );
  }

  // phase === "question"
  if (!currentQ) return null;
  const remainingMs = endsAt ? Math.max(0, endsAt - now) : null;
  const seconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f0e6] p-4">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{name}</span>
          {seconds !== null && (
            <span
              className={
                "font-mono font-bold text-xl " +
                (seconds <= 5 ? "text-red-600" : "text-indigo-700")
              }
            >
              ⏱ {seconds}
            </span>
          )}
        </div>
        <div className="border-b border-[#d9d1c3] bg-[#fffdf8] p-5"><p className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-[#1e4f91]">Вопрос в работе</p><p className="mt-2 text-xl font-bold leading-7">{currentQ.task.question}</p></div>
        <AnswerForm key={`${currentQ.index}-${currentQ.endsAt}`} task={currentQ.task} onSubmit={submit} />
      </div>
    </div>
  );
}

function CenterScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f0e6] p-6 text-center text-[#17202b]">
      {children}
    </div>
  );
}

function AnswerForm({
  task,
  onSubmit,
}: {
  task: PublicTask;
  onSubmit: (a: TaskAnswer) => void;
}) {
  const [text, setText] = useState("");
  const [num, setNum] = useState("");
  const [fillers, setFillers] = useState<string[]>(
    task.type === "FILL_BLANK" ? Array(task.blanks).fill("") : [],
  );
  const [order, setOrder] = useState<number[]>(
    task.type === "ORDERING" ? task.items.map((_, i) => i).reverse() : [],
  );
  const [pairs, setPairs] = useState<Array<{ leftIndex: number; rightIndex: number }>>(
    task.type === "MATCHING"
      ? task.left.map((_, i) => ({ leftIndex: i, rightIndex: task.right.length - 1 - i }))
      : [],
  );

  switch (task.type) {
    case "MCQ":
      return (
        <div className="grid grid-cols-1 gap-2">
          {task.options.map((opt, i) => (
            <Button
              key={i}
              size="lg"
              variant="outline"
              className="justify-start text-left h-auto py-4 whitespace-normal"
              onClick={() => onSubmit({ type: "MCQ", selectedIndex: i })}
            >
              <span className="font-bold text-indigo-600 mr-2">
                {String.fromCharCode(0x0410 + i)}.
              </span>
              {opt}
            </Button>
          ))}
        </div>
      );
    case "TRUE_FALSE":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-20 bg-emerald-600 hover:bg-emerald-700 text-white text-xl"
            onClick={() => onSubmit({ type: "TRUE_FALSE", selected: true })}
          >
            Верно
          </Button>
          <Button
            size="lg"
            className="h-20 bg-red-600 hover:bg-red-700 text-white text-xl"
            onClick={() => onSubmit({ type: "TRUE_FALSE", selected: false })}
          >
            Неверно
          </Button>
        </div>
      );
    case "SHORT_ANSWER":
      return (
        <div className="space-y-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ваш ответ"
            autoFocus
          />
          <Button
            disabled={!text.trim()}
            onClick={() => onSubmit({ type: "SHORT_ANSWER", text })}
            className="w-full"
          >
            Отправить
          </Button>
        </div>
      );
    case "NUMERIC":
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="number"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              placeholder="Число"
              autoFocus
            />
            {task.unit && (
              <span className="self-center text-slate-500 text-sm">{task.unit}</span>
            )}
          </div>
          <Button
            disabled={num === ""}
            onClick={() =>
              onSubmit({ type: "NUMERIC", value: num === "" ? null : Number(num) })
            }
            className="w-full"
          >
            Отправить
          </Button>
        </div>
      );
    case "FILL_BLANK":
      return (
        <div className="space-y-2">
          <p className="text-sm text-slate-500 italic">{task.template}</p>
          {fillers.map((v, i) => (
            <Input
              key={i}
              value={v}
              onChange={(e) =>
                setFillers((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))
              }
              placeholder={`Пропуск ${i + 1}`}
            />
          ))}
          <Button
            onClick={() => onSubmit({ type: "FILL_BLANK", fillers })}
            className="w-full"
          >
            Отправить
          </Button>
        </div>
      );
    case "MATCHING":
      return (
        <div className="space-y-3">
          {task.left.map((l, li) => (
            <div key={li} className="flex items-center gap-2">
              <span className="w-1/2 truncate text-sm">{l}</span>
              <select
                className="flex-1 border rounded px-2 py-1 text-sm"
                value={pairs[li]?.rightIndex ?? 0}
                onChange={(e) =>
                  setPairs((prev) =>
                    prev.map((p, idx) =>
                      idx === li ? { ...p, rightIndex: Number(e.target.value) } : p,
                    ),
                  )
                }
              >
                {task.right.map((r, ri) => (
                  <option key={ri} value={ri}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <Button
            onClick={() => onSubmit({ type: "MATCHING", pairs })}
            className="w-full"
          >
            Отправить
          </Button>
        </div>
      );
    case "ORDERING":
      return (
        <div className="space-y-2">
          {order.map((idx, pos) => (
            <div key={pos} className="flex items-center gap-2 bg-surface p-2 rounded border">
              <span className="text-sm font-bold text-slate-400 w-6">{pos + 1}.</span>
              <span className="flex-1 text-sm truncate">{task.items[idx]}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pos === 0}
                onClick={() =>
                  setOrder((prev) => {
                    const copy = prev.slice();
                    [copy[pos - 1], copy[pos]] = [copy[pos], copy[pos - 1]];
                    return copy;
                  })
                }
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pos === order.length - 1}
                onClick={() =>
                  setOrder((prev) => {
                    const copy = prev.slice();
                    [copy[pos], copy[pos + 1]] = [copy[pos + 1], copy[pos]];
                    return copy;
                  })
                }
              >
                ↓
              </Button>
            </div>
          ))}
          <Button onClick={() => onSubmit({ type: "ORDERING", order })} className="w-full">
            Отправить
          </Button>
        </div>
      );
  }
}
