"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Play,
  Eye,
  ArrowRight,
  Trophy,
  Users,
  Loader2,
  Download,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { QrCodeSvg } from "@/components/ksp/qr-card";
import { ShareQrActions } from "@/components/share/share-toolbar";
import { quizShareMessage } from "@/lib/share/messengers";
import { MathText } from "@/lib/math/render-math";
import {
  type InteractiveTask,
} from "@/lib/ksp/tasks";
import {
  correctSummary,
  fetchQuizEvents,
  generateRoomCode,
  postQuizEvent,
  toPublicTask,
  type HostQuestionMsg,
  type HostResume,
  type HostState,
  type LiveLeaderboardEntry,
  type LivePhase,
  type StudentAnswerMsg,
  type StudentJoinMsg,
} from "@/lib/ksp/live-quiz";

interface Props {
  tasks: InteractiveTask[];
  planTitle: string;
  planId: string;
  /** Активная комната этого хоста — восстановление после F5. */
  resume?: HostResume | null;
}

export function LiveQuizHost({ tasks, planTitle, planId, resume = null }: Props) {
  const [code] = useState(() => resume?.code ?? generateRoomCode());
  const [phase, setPhase] = useState<LivePhase>(resume?.phase ?? "lobby");
  const [currentIndex, setCurrentIndex] = useState(resume?.currentIndex ?? -1);
  const [students, setStudents] = useState<Map<string, LiveLeaderboardEntry>>(
    () => new Map((resume?.leaderboard ?? []).map((e) => [e.studentId, e])),
  );
  const [answersByQuestion, setAnswersByQuestion] = useState<Map<number, Map<string, true>>>(
    new Map(),
  );
  const [now, setNow] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(resume?.endsAt ?? null);
  const lastSeqRef = useRef(0);
  const [joinUrl, setJoinUrl] = useState("");
  // Неотправленные события хоста: показываем баннер с повтором, чтобы ученики не зависли.
  const [failedEvents, setFailedEvents] = useState<Array<{ event: string; payload: unknown }>>([]);

  const send = useCallback((event: string, payload: unknown) => {
    postQuizEvent(code, event, payload).catch(() =>
      setFailedEvents((prev) => [...prev, { event, payload }]),
    );
  }, [code]);

  function retryFailed() {
    const pending = failedEvents;
    setFailedEvents([]);
    // Порядок важен (question → reveal → state), поэтому шлём последовательно.
    void pending.reduce<Promise<void>>(
      (chain, ev, i) =>
        chain.then(() =>
          postQuizEvent(code, ev.event, ev.payload).catch((err: unknown) => {
            setFailedEvents((prev) => [...pending.slice(i), ...prev]);
            throw err;
          }),
        ),
      Promise.resolve(),
    ).catch(() => {});
  }

  // tick for countdown
  useEffect(() => {
    if (phase !== "question") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoinUrl(`${window.location.origin}/quiz/join?code=${code}`);
  }, [code]);

  // Сердцебиение лобби: создаёт комнату с planId сразу после открытия хостом.
  // Без него F5 хоста до первого вопроса не находил комнату по planId и
  // генерировал новый код, а ученики оставались в старой комнате.
  useEffect(() => {
    if (resume) return;
    send("host:state", {
      phase: "lobby",
      currentIndex: -1,
      leaderboard: [],
      planId,
    });
  }, [code, planId, resume, send]);

  // Polling входящих событий студентов (join/answer) каждые 1.5с.
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const events = await fetchQuizEvents(code, lastSeqRef.current);
        if (!alive || events.length === 0) return;
        for (const ev of events) {
          lastSeqRef.current = Math.max(lastSeqRef.current, ev.seq);
          if (ev.event === "student:join") {
            const m = ev.payload as StudentJoinMsg;
            setStudents((prev) => {
              if (prev.has(m.studentId)) return prev;
              const next = new Map(prev);
              next.set(m.studentId, {
                studentId: m.studentId,
                name: m.name || "Ученик",
                score: 0,
                answered: 0,
              });
              return next;
            });
          } else if (ev.event === "student:answer") {
            handleAnswerRef.current(ev.payload as StudentAnswerMsg);
          } else if (ev.event === "host:reveal" || ev.event === "host:state" || ev.event === "host:end") {
            // Лидерборд в этих событиях подменён сервером — он авторитетный.
            const lb = (ev.payload as { leaderboard?: LiveLeaderboardEntry[] }).leaderboard;
            if (Array.isArray(lb)) applyLeaderboardRef.current(lb);
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
  }, [code]);

  // Хост сам ведёт state; студентам рассылаем события через /api/quiz.
  // Актуальные обработчики для polling (избегаем stale closure).
  const handleAnswerRef = useRef(handleAnswer);
  handleAnswerRef.current = handleAnswer;
  const applyLeaderboardRef = useRef(applyLeaderboard);
  applyLeaderboardRef.current = applyLeaderboard;

  function handleAnswer(m: StudentAnswerMsg) {
    // Очки считает сервер /api/quiz (время и оценивание — серверные).
    // Здесь — только локальный индикатор «сколько ответили».
    if (phase !== "question" || m.index !== currentIndex || (endsAt !== null && Date.now() > endsAt)) return;
    if (!students.has(m.studentId) || !Number.isFinite(m.ms) || m.ms < 0) return;
    const answered = answersByQuestion.get(m.index);
    if (answered?.has(m.studentId)) return;

    setAnswersByQuestion((prev) => {
      const next = new Map(prev);
      const nextInner = new Map(prev.get(m.index) ?? []);
      nextInner.set(m.studentId, true);
      next.set(m.index, nextInner);
      return next;
    });
  }

  /** Лидерборд с сервера — единственный авторитетный источник очков. */
  function applyLeaderboard(entries: LiveLeaderboardEntry[]) {
    setStudents(() => new Map(entries.map((e) => [e.studentId, e])));
  }

  function startQuiz() {
    if (tasks.length === 0) return;
    goToQuestion(0);
  }

  function goToQuestion(idx: number) {
    const task = tasks[idx];
    if (!task) {
      setPhase("ended");
      setCurrentIndex(idx);
      void confetti({ particleCount: 200, spread: 100, origin: { y: 0.4 } });
      const leaderboard = Array.from(students.values()).sort((a, b) => b.score - a.score);
      send("host:end", { leaderboard });
      return;
    }
    setCurrentIndex(idx);
    setPhase("question");
    const limit = task.timeLimitSec ?? 30;
    const e = Date.now() + limit * 1000;
    setEndsAt(e);

    const msg: HostQuestionMsg = {
      index: idx,
      task: toPublicTask(task),
      endsAt: e,
      // Полная задача с ответами — сервер сохранит её в комнате и не рассылает.
      secret: task,
      planId,
    };
    send("host:question", msg);
  }

  function reveal() {
    const task = tasks[currentIndex];
    if (!task) return;
    setPhase("reveal");
    setEndsAt(null);
    send("host:reveal", {
      index: currentIndex,
      correctSummary: correctSummary(task),
    });
    const leaderboard = Array.from(students.values()).sort((a, b) => b.score - a.score);
    send("host:state", {
      phase: "reveal",
      currentIndex,
      total: tasks.length,
      leaderboard,
    } satisfies HostState);
  }

  function next() {
    goToQuestion(currentIndex + 1);
  }

  const currentTask = currentIndex >= 0 ? tasks[currentIndex] : null;
  const remainingMs = endsAt ? Math.max(0, endsAt - now) : null;
  const answeredCount = answersByQuestion.get(currentIndex)?.size ?? 0;
  const studentsList = useMemo(
    () => Array.from(students.values()).sort((a, b) => b.score - a.score),
    [students],
  );

  // Auto-reveal when timer expires
  useEffect(() => {
    if (phase !== "question" || remainingMs !== 0) return;
    const t = setTimeout(() => reveal(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, phase]);

  return (
    <div className="min-h-screen bg-foreground text-foreground">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <p className="editorial-kicker text-muted-foreground">Классный режим · ведущий</p><h1 className="editorial-display mt-3 text-4xl text-foreground">{planTitle}</h1>
          </div>
          <div className="text-right"><p className="tabular-nums text-xs font-bold uppercase tracking-[0.1em] text-[#b9cce8]">Код для входа</p><p className="mt-1 tabular-nums text-4xl font-bold tracking-[0.16em] text-white">{code}</p></div>
        </div>

        {failedEvents.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-400 bg-red-950/60 px-4 py-3 text-sm">
            <span>Часть событий не дошла до учеников ({failedEvents.length}) — проверьте интернет.</span>
            <Button size="sm" variant="secondary" onClick={retryFailed}>Повторить</Button>
          </div>
        )}

        {phase === "lobby" && (
          <Lobby
            joinUrl={joinUrl}
            code={code}
            planTitle={planTitle}
            students={studentsList}
            tasksCount={tasks.length}
            onStart={startQuiz}
          />
        )}

        {phase === "question" && currentTask && (
          <QuestionView
            task={currentTask}
            index={currentIndex}
            total={tasks.length}
            remainingMs={remainingMs}
            answered={answeredCount}
            connected={students.size}
            onReveal={reveal}
          />
        )}

        {phase === "reveal" && currentTask && (
          <RevealView
            task={currentTask}
            index={currentIndex}
            total={tasks.length}
            leaderboard={studentsList}
            isLast={currentIndex >= tasks.length - 1}
            onNext={next}
          />
        )}

        {phase === "ended" && <EndView code={code} leaderboard={studentsList} />}
      </div>
    </div>
  );
}

// ---------- Sub-views ----------

function Lobby({
  joinUrl,
  code,
  planTitle,
  students,
  tasksCount,
  onStart,
}: {
  joinUrl: string;
  code: string;
  planTitle: string;
  students: LiveLeaderboardEntry[];
  tasksCount: number;
  onStart: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const effectiveUrl = joinUrl || `https://ksp-app-pi.vercel.app/quiz/join?code=${code}`;
  const shareText = quizShareMessage({ title: planTitle, url: effectiveUrl, code });
  async function copy() {
    try {
      await navigator.clipboard.writeText(effectiveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
      <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-border-strong bg-muted p-6 text-foreground">
        <h2 className="text-lg font-semibold">Как присоединиться</h2>
        <ol className="text-sm space-y-2 text-foreground list-decimal list-inside">
          <li>
            Откройте на телефоне{" "}
            <a href={effectiveUrl} className="editorial-link break-all">
              {effectiveUrl.replace(/^https?:\/\//, "")}
            </a>
          </li>
          <li>
            Или отсканируйте QR-код / введите код на <span className="tabular-nums">/quiz/join</span>:
          </li>
        </ol>
        <div className="flex flex-col items-center gap-4 border-y border-border bg-muted py-5 sm:flex-row sm:justify-around">
          <div className="w-[172px] shrink-0">
            <QrCodeSvg key={effectiveUrl} text={effectiveUrl} label={`QR: ${planTitle}`} />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Код комнаты</p>
            <p className="mt-1 tabular-nums text-5xl font-bold tracking-widest text-primary">{code}</p>
          </div>
        </div>
        <div className="space-y-2.5">
          <Button variant="outline" onClick={copy} className="w-full">
            <Copy className="w-4 h-4" />
            {copied ? "Скопировано!" : "Скопировать ссылку"}
          </Button>
          <ShareQrActions
            url={effectiveUrl}
            title={planTitle}
            code={code}
            shareText={shareText}
            compact
          />
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" /> Участники: {students.length}
          </h2>
          <p className="text-xs text-muted-foreground">{tasksCount} заданий</p>
        </div>
        {students.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Ждём учеников…
          </div>
        ) : (
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {students.map((s) => (
              <li
                key={s.studentId}
                className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm"
              >
                <span className="size-2 rounded-full bg-success"></span>
                {s.name}
              </li>
            ))}
          </ul>
        )}
        <Button onClick={onStart} disabled={tasksCount === 0} className="w-full">
          <Play className="w-4 h-4" />
          Начать квиз ({students.length} учеников)
        </Button>
        {tasksCount === 0 && (
          <p className="text-xs text-warning">
            В этом плане нет интерактивных заданий. Добавьте их в редакторе.
          </p>
        )}
      </div>
    </div>
  );
}

function QuestionView({
  task,
  index,
  total,
  remainingMs,
  answered,
  connected,
  onReveal,
}: {
  task: InteractiveTask;
  index: number;
  total: number;
  remainingMs: number | null;
  answered: number;
  connected: number;
  onReveal: () => void;
}) {
  const seconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;
  return (
    <div className="space-y-5 rounded-2xl border border-border-strong bg-muted p-6 text-foreground">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Вопрос {index + 1} из {total}
        </span>
        {seconds !== null && (
          <span
            className={
              "tabular-nums text-3xl font-bold " +
              (seconds <= 5 ? "text-primary animate-pulse" : "text-success")
            }
          >
            {seconds}
          </span>
        )}
      </div>
      <h2 className="text-3xl font-semibold leading-tight"><MathText text={task.question} /></h2>

      {task.type === "MCQ" && (
        <div className="grid grid-cols-2 gap-3 pt-3">
          {task.options.map((opt, i) => (
            <div
              key={i}
              className="border border-border bg-surface p-4 text-lg"
            >
              <span className="mr-2 font-bold text-primary">
                {String.fromCharCode(0x0410 + i)}.
              </span>
              <MathText text={opt} />
            </div>
          ))}
        </div>
      )}
      {task.type === "TRUE_FALSE" && (
        <div className="grid grid-cols-2 gap-3 pt-3 text-2xl font-bold text-center">
          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700">
            Верно
          </div>
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
            Неверно
          </div>
        </div>
      )}
      {task.type === "FILL_BLANK" && (
        <p className="text-xl text-muted-foreground italic"><MathText text={task.template} /></p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Ответили: <span className="font-bold text-foreground">{answered}</span> из {connected}
        </p>
        <Button variant="outline" onClick={onReveal}>
          <Eye className="w-4 h-4" />
          Показать ответ
        </Button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${connected > 0 ? (answered / connected) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function RevealView({
  task,
  index,
  total,
  leaderboard,
  isLast,
  onNext,
}: {
  task: InteractiveTask;
  index: number;
  total: number;
  leaderboard: LiveLeaderboardEntry[];
  isLast: boolean;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-xl border border-border p-6 space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Вопрос {index + 1} из {total}
        </p>
        <h2 className="text-2xl font-semibold"><MathText text={task.question} /></h2>
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-4 text-lg">
          <MathText text={correctSummary(task)} />
        </div>
        <Button onClick={onNext} className="w-full">
          {isLast ? "Завершить и показать итоги" : "Следующий вопрос"}{" "}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>

      <Leaderboard entries={leaderboard.slice(0, 5)} />
    </div>
  );
}

function EndView({ code, leaderboard }: { code: string; leaderboard: LiveLeaderboardEntry[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-primary p-8 text-center text-foreground">
        <Trophy className="w-12 h-12 mx-auto mb-2" />
        <h2 className="text-3xl font-bold mb-1">Квиз завершён!</h2>
        <p className="text-violet-100">Поздравляем участников</p>
      </div>
      <Leaderboard entries={leaderboard} />
      <div className="flex justify-end">
        <a href={`/api/quiz/${code}/results`}>
          <Button variant="outline">
            <Download className="w-4 h-4" />
            Скачать результаты (CSV)
          </Button>
        </a>
      </div>
    </div>
  );
}

function Leaderboard({ entries }: { entries: LiveLeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
        Пока нет ответов
      </div>
    );
  }
  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2 text-sm font-semibold border-b border-border bg-muted">
        Лидерборд
      </div>
      <ul>
        {entries.map((s, i) => (
          <li
            key={s.studentId}
            className={
              "px-4 py-2 flex items-center gap-3 " +
              (i === 0
                ? "bg-warning-soft"
                : i === 1
                  ? "bg-muted"
                  : i === 2
                    ? "bg-warning-soft"
                    : "")
            }
          >
            <span className="w-6 text-right font-bold text-muted-foreground">{i + 1}.</span>
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-xs text-muted-foreground">{s.answered} отв.</span>
            <span className="tabular-nums font-bold text-lg w-16 text-right">{s.score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
