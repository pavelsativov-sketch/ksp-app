"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MathText, formatMathPlain } from "@/lib/math/render-math";

import {
  fetchQuizEvents,
  generateStudentId,
  postQuizEvent,
  QUIZ_OFFLINE_AFTER_FAILURES,
  QuizHttpError,
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
  // Секрет участника от сервера: без него нельзя отвечать или войти под этим id.
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(tokenKey(initialCode));
    } catch {
      return null;
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

  const [joining, setJoining] = useState(false);
  const [sendState, setSendState] = useState<"sending" | "sent" | "failed">("sent");
  const lastAnswerRef = useRef<{ index: number; answer: TaskAnswer; ms: number } | null>(null);

  const lastSeqRef = useRef(0);
  const [offline, setOffline] = useState(false);
  const pollFailuresRef = useRef(0);

  // При смене кода на экране входа пересоздаём идентификатор под новый код.
  function ensureStudentIdForCode(targetCode: string) {
    if (phase !== "name") return;
    const key = `ksp-quiz-student:${targetCode}`;
    try {
      const existing = window.sessionStorage.getItem(key);
      setToken(window.sessionStorage.getItem(tokenKey(targetCode)));
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
        pollFailuresRef.current = 0;
        setOffline(false);
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
        // polling продолжается; после нескольких сбоев подряд — видимое «нет связи»
        pollFailuresRef.current += 1;
        if (alive && pollFailuresRef.current >= QUIZ_OFFLINE_AFTER_FAILURES) setOffline(true);
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
    setJoining(true);
    postQuizEvent(code, "student:join", { studentId, name: name.trim(), ...(token ? { token } : {}) })
      .then((res) => {
        if (res.token) {
          setToken(res.token);
          try {
            window.sessionStorage.setItem(`ksp-quiz-student:${code}`, studentId);
            window.sessionStorage.setItem(tokenKey(code), res.token);
          } catch {
            // без sessionStorage после F5 войдём новым участником
          }
        }
        setPhase("lobby");
      })
      .catch((err: unknown) => {
        const status = err instanceof QuizHttpError ? err.status : 0;
        setError(
          status === 404 ? "Квиз не найден. Проверьте код."
            : status === 403 ? "Этот участник уже вошёл с другого устройства."
            : "Не удалось войти: нет связи с сервером. Попробуйте ещё раз.",
        );
      })
      .finally(() => setJoining(false));
  }

  function sendAnswer(msg: { index: number; answer: TaskAnswer; ms: number }) {
    setSendState("sending");
    postQuizEvent(code, "student:answer", { studentId, token, ...msg })
      .then(() => setSendState("sent"))
      .catch(() => setSendState("failed"));
  }

  function submit(answer: TaskAnswer) {
    if (!currentQ) return;
    const ms = Date.now() - (questionStartedAt ?? Date.now());
    const msg = { index: currentQ.index, answer, ms };
    lastAnswerRef.current = msg;
    setPhase("submitted");
    sendAnswer(msg);
  }

  // ---------- render ----------

  const view = renderView();
  return (
    <>
      {offline && (
        <div role="status" className="fixed inset-x-0 top-0 z-50 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          Нет связи с квизом, пробуем снова…
        </div>
      )}
      {view}
    </>
  );

  function renderView() {

  if (phase === "name") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-foreground p-4">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-6 text-foreground">
          <div className="text-center">
            <p className="editorial-kicker">Классный режим</p><h1 className="editorial-display mt-2 text-4xl">Live-квиз</h1>
            <p className="mt-2 text-sm text-muted-foreground">Введите код от учителя</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Код комнаты</Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              className="text-center tabular-nums text-2xl tracking-widest"
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
          <Button onClick={join} disabled={joining} className="w-full">
            {joining ? "Входим…" : "Войти"}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "lobby") {
    return (
      <CenterScreen>
        <Loader2 className="w-10 h-10 animate-spin text-violet-600 mb-3" />
        <p className="text-lg font-medium">Привет, {name}!</p>
        <p className="text-sm text-muted-foreground">Ждём начала квиза…</p>
      </CenterScreen>
    );
  }

  if (phase === "submitted" && sendState === "sending") {
    return (
      <CenterScreen>
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3" />
        <p className="text-lg font-medium">Отправляем ответ…</p>
      </CenterScreen>
    );
  }

  if (phase === "submitted" && sendState === "failed") {
    return (
      <CenterScreen>
        <p role="alert" className="text-lg font-medium text-red-700">Ответ не отправлен</p>
        <p className="mb-3 text-sm text-slate-500">Проверьте интернет и повторите.</p>
        <Button onClick={() => lastAnswerRef.current && sendAnswer(lastAnswerRef.current)}>
          Повторить
        </Button>
      </CenterScreen>
    );
  }

  if (phase === "submitted") {
    return (
      <CenterScreen>
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mb-3" />
        <p className="text-lg font-medium">Ответ отправлен</p>
        <p className="text-sm text-muted-foreground">Ждём остальных…</p>
      </CenterScreen>
    );
  }

  if (phase === "reveal") {
    return (
      <CenterScreen>
        <p className="text-sm text-muted-foreground mb-2">Ответ</p>
        <p className="text-lg font-semibold text-center text-emerald-700 max-w-md">
          {revealText ? <MathText text={revealText} /> : "—"}
        </p>
      </CenterScreen>
    );
  }

  if (phase === "ended") {
    const myEntry = leaderboard.find((e) => e.studentId === studentId);
    const myRank = myEntry ? leaderboard.indexOf(myEntry) + 1 : null;
    return (
      <CenterScreen>
        <Trophy className="w-12 h-12 text-warning mb-2" />
        <p className="text-2xl font-bold mb-1">Квиз завершён</p>
        {myEntry ? (
          <>
            <p className="text-lg">
              Ваше место: <span className="font-bold text-violet-700">#{myRank}</span>
            </p>
            <p className="text-sm text-muted-foreground">Очки: {myEntry.score}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Ваши результаты не нашлись</p>
        )}
        <div className="mt-4 w-full max-w-sm">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Топ-5</p>
          <ul className="bg-surface border rounded-lg overflow-hidden">
            {leaderboard.slice(0, 5).map((e, i) => (
              <li
                key={e.studentId}
                className={
                  "px-3 py-2 text-sm flex justify-between border-b last:border-b-0 " +
                  (e.studentId === studentId ? "bg-violet-50 font-semibold" : "")
                }
              >
                <span>
                  {i + 1}. {e.name}
                </span>
                <span className="tabular-nums">{e.score}</span>
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
    <div className="flex min-h-screen flex-col bg-background p-4">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{name}</span>
          {seconds !== null && (
            <span
              className={
                "tabular-nums font-bold text-xl " +
                (seconds <= 5 ? "text-red-600" : "text-violet-700")
              }
            >
              ⏱ {seconds}
            </span>
          )}
        </div>
        <div className="border-b border-border bg-surface p-5"><p className="tabular-nums text-xs font-bold uppercase tracking-[0.1em] text-ink">Вопрос в работе</p><p className="mt-2 text-xl font-bold leading-7"><MathText text={currentQ.task.question} /></p></div>
        <AnswerForm key={`${currentQ.index}-${currentQ.endsAt}`} task={currentQ.task} onSubmit={submit} />
      </div>
    </div>
  );
  }
}

const tokenKey = (roomCode: string) => `ksp-quiz-token:${roomCode}`;

function CenterScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center text-foreground">
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
              <span className="font-bold text-violet-600 mr-2">
                {String.fromCharCode(0x0410 + i)}.
              </span>
              <MathText text={opt} />
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
              <span className="self-center text-muted-foreground text-sm">{task.unit}</span>
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
          <p className="text-sm text-muted-foreground italic"><MathText text={task.template} /></p>
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
              <span className="w-1/2 truncate text-sm"><MathText text={l} /></span>
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
                    {formatMathPlain(r)}
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
              <span className="text-sm font-bold text-muted-foreground w-6">{pos + 1}.</span>
              <span className="flex-1 text-sm truncate"><MathText text={task.items[idx] ?? ""} /></span>
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
