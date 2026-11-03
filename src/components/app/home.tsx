"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Bot, CalendarDays, ChevronRight, ClipboardCheck, FileSpreadsheet, FileText, Gamepad2, Grid3x3, Layers, Library, Loader2, LayoutGrid, MessageSquareText, MonitorSmartphone, MoreHorizontal, Send, Sparkles, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { setActiveAgentTask } from "@/components/agents/agent-dock";
import { ThreeStage } from "@/components/three/three-stage";
import { appCopy, type AppCopy } from "./copy";
import s from "./home.module.css";

export interface HomePlan {
  id: string;
  title: string;
  topic: string;
  grade: number;
  updatedAt: string;
}

export interface HomeProps {
  /** Открыть окно нового урока сразу: на него ведут меню и ссылки «Создать». */
  startLesson?: boolean;
  subjects: Array<{ name: string; min: number; max: number }>;
  recent: HomePlan[];
  favorites: HomePlan[];
  bilimConnected: boolean;
  agentOnline: boolean;
}

type Tone = "violet" | "blue" | "peach" | "green" | "pink" | "gray";

function when(iso: string, c: AppCopy, locale: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return c.today;
  if (days === 1) return c.yesterday;
  return date.toLocaleDateString(locale === "ru" ? "ru-RU" : "kk-KZ", { day: "numeric", month: "short" });
}

/** Новый урок: три поля и кнопка. Пока ИИ пишет, робот работает и показывает этап. */
const LAST_LESSON_KEY = "mekty:last-lesson";

function readLastLesson(): { grade: number; subject: string } {
  const fallback = { grade: 5, subject: "" };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_LESSON_KEY) ?? "null") as { grade?: unknown; subject?: unknown } | null;
    return {
      grade: typeof saved?.grade === "number" ? saved.grade : fallback.grade,
      subject: typeof saved?.subject === "string" ? saved.subject : fallback.subject,
    };
  } catch {
    return fallback;
  }
}

function LessonDialog({ open, onClose, subjects, c }: { open: boolean; onClose: () => void; subjects: HomeProps["subjects"]; c: AppCopy }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement | null>(null);
  const topicRef = useRef<HTMLInputElement | null>(null);
  const [grade, setGrade] = useState(() => readLastLesson().grade);
  const [subject, setSubject] = useState(() => readLastLesson().subject);
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState<"ru" | "kz">("ru");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // autoFocus срабатывает раньше showModal, и фокус уходил на кнопку закрытия.
      topicRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStep((v) => Math.min(v + 1, c.progress.length - 1)), 9000);
    return () => clearInterval(id);
  }, [busy, c.progress.length]);

  const available = subjects.filter((x) => grade >= x.min && grade <= x.max);
  const chosen = available.some((x) => x.name === subject) ? subject : available[0]?.name ?? "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!topic.trim()) {
      setError(c.topicEmpty);
      return;
    }
    setBusy(true);
    setStep(0);
    setError("");
    try {
      localStorage.setItem(LAST_LESSON_KEY, JSON.stringify({ grade, subject: chosen }));
    } catch {
      // Память о выборе необязательна.
    }
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, subject: chosen, topic, language }),
      });
      const data = (await res.json().catch(() => ({}))) as { planId?: string; error?: string };
      if (!res.ok || !data.planId) throw new Error(data.error ?? c.lessonError);
      router.push(`/plans/${data.planId}#materials`);
    } catch (e) {
      setError(e instanceof Error ? e.message : c.lessonError);
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className={s.dialog} onClose={onClose} aria-labelledby="lesson-title">
      {open && (
        <form onSubmit={submit} className={s.dialogBody}>
          <button type="button" className={s.dialogClose} onClick={onClose} aria-label={c.close}><X aria-hidden="true" /></button>
          <div className={s.dialogRobot}><ThreeStage scene="robot" className={s.fill} /></div>
          <h2 id="lesson-title" className={s.dialogTitle}>{c.newLesson}</h2>
          {busy ? (
            <ol className={s.steps} aria-live="polite">
              {c.progress.map((label, i) => (
                <li key={label} className={i < step ? s.stepDone : i === step ? s.stepNow : s.stepNext}>
                  {i === step ? <Loader2 aria-hidden="true" className={s.spin} /> : <span className={s.stepDot} />}
                  {label}
                </li>
              ))}
            </ol>
          ) : (
            <>
              <p className={s.dialogLead}>{c.newLessonLead}</p>
              <div className={s.fieldRow}>
                <label className={s.field}>
                  <span>{c.classLabel}</span>
                  <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
                    {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className={`${s.field} ${s.fieldWide}`}>
                  <span>{c.subjectLabel}</span>
                  <select value={chosen} onChange={(e) => setSubject(e.target.value)}>
                    {available.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                  </select>
                </label>
                <label className={s.field}>
                  <span>{c.languageLabel}</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value as "ru" | "kz")}>
                    <option value="ru">Русский</option>
                    <option value="kz">Қазақша</option>
                  </select>
                </label>
              </div>
              <label className={s.field}>
                <span>{c.topicLabel}</span>
                <input ref={topicRef} value={topic} onChange={(e) => { setTopic(e.target.value); setError(""); }} placeholder={c.topicHint} maxLength={300} />
              </label>
              {error && <p role="alert" className={s.error}>{error}</p>}
              <div className={s.dialogActions}>
                <Link href="/plans/new" className={s.quiet}>{c.manual}</Link>
                <button type="submit" className={s.primary}><Sparkles aria-hidden="true" /> {c.create}</button>
              </div>
            </>
          )}
        </form>
      )}
    </dialog>
  );
}

/** Материал строится из плана: сперва выбираем урок. */
function PickDialog({ open, onClose, onNew, plans, c }: { open: boolean; onClose: () => void; onNew: () => void; plans: HomePlan[]; c: AppCopy }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className={s.dialog} onClose={onClose} aria-labelledby="pick-title">
      {open && (
        <div className={s.dialogBody}>
          <button type="button" className={s.dialogClose} onClick={onClose} aria-label={c.close}><X aria-hidden="true" /></button>
          <h2 id="pick-title" className={s.dialogTitle}>{c.pickLesson}</h2>
          <p className={s.dialogLead}>{c.pickLead}</p>
          <ul className={s.pickList}>
            {plans.map((plan) => (
              <li key={plan.id}>
                <Link href={`/plans/${plan.id}#materials`} className={s.pickItem}>
                  <span><b>{plan.topic || plan.title}</b><small>{plan.grade} {c.grade}</small></span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <div className={s.dialogActions}>
            <button type="button" className={s.primary} onClick={onNew}><Sparkles aria-hidden="true" /> {c.newLesson}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function AgentPanel({ c, bilimConnected, agentOnline }: { c: AppCopy; bilimConnected: boolean; agentOnline: boolean }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (text.length < 3) {
      setError(c.promptEmpty);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/agents/task", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text }) });
      const data = (await res.json().catch(() => ({}))) as { taskId?: string; error?: string };
      if (!res.ok || !data.taskId) throw new Error(data.error ?? c.agentError);
      setActiveAgentTask(data.taskId, text.slice(0, 80), text);
      router.push("/school");
    } catch (e) {
      setError(e instanceof Error ? e.message : c.networkError);
      setBusy(false);
    }
  }

  return (
    <aside className={s.agent} aria-labelledby="agent-title">
      <div className={s.agentHead}>
        <div className={s.agentRobot}><ThreeStage scene="robot" className={s.fill} /></div>
        <div>
          <h2 id="agent-title" className={s.agentTitle}>{c.agentTitle[0]}<br />{c.agentTitle[1]}</h2>
          <span className={agentOnline ? s.online : s.offline}><i />{agentOnline ? c.online : c.offline}</span>
        </div>
      </div>
      <p className={s.agentLead}>{c.agentLead}</p>
      <Link href={bilimConnected ? "/school?os=browser" : "/school?os=browser"} className={s.bilim}>
        <span className={s.bilimMark}>B</span>
        <span className={s.bilimName}>BilimClass</span>
        <span className={bilimConnected ? s.bilimOn : s.bilimOff}>{bilimConnected ? c.connected : c.notConnected}</span>
        <ChevronRight aria-hidden="true" />
      </Link>
      <div className={s.chips}>
        {c.prompts.map((text, i) => (
          <button key={text} type="button" className={s.chip} style={{ "--i": i } as React.CSSProperties} onClick={() => { setPrompt(text); setError(""); }}>
            <MessageSquareText aria-hidden="true" /> {text}
          </button>
        ))}
      </div>
      <form onSubmit={send} className={s.composer}>
        <Sparkles aria-hidden="true" className={s.composerSpark} />
        <textarea aria-label={c.composerLabel} value={prompt} rows={2} placeholder={c.composerHint} onChange={(e) => { setPrompt(e.target.value); setError(""); }} />
        <button type="submit" aria-label={c.send} className={s.send} disabled={busy}>
          {busy ? <Loader2 aria-hidden="true" className={s.spin} /> : <Send aria-hidden="true" />}
        </button>
      </form>
      {error && <p role="alert" className={s.error}>{error}</p>}
    </aside>
  );
}

export function Home({ startLesson = false, subjects, recent, favorites, bilimConnected, agentOnline }: HomeProps) {
  const { locale } = useUiLocale();
  const c = appCopy(locale);
  const [lessonOpen, setLessonOpen] = useState(startLesson);
  useEffect(() => {
    // Иначе обновление страницы снова открывало бы окно.
    if (startLesson) window.history.replaceState(null, "", "/dashboard");
  }, [startLesson]);
  const [pickOpen, setPickOpen] = useState(false);
  const [tab, setTab] = useState<"recent" | "favorites">("recent");

  const startMaterial = () => (recent.length > 0 ? setPickOpen(true) : setLessonOpen(true));
  const list = tab === "recent" ? recent : favorites;

  const actionCards: Array<{ tone: Tone; icon: LucideIcon; text: string[]; onClick?: () => void; href?: string }> = [
    { tone: "violet", icon: FileText, text: c.actions.ksp, onClick: () => setLessonOpen(true) },
    { tone: "blue", icon: CalendarDays, text: c.actions.plan, href: "/plans" },
    { tone: "green", icon: Bot, text: c.actions.agent, href: "/school" },
  ];
  const materials: Array<{ tone: Tone; icon: LucideIcon; text: string[] }> = [
    { tone: "violet", icon: Gamepad2, text: c.materials.interactive },
    { tone: "blue", icon: FileSpreadsheet, text: c.materials.worksheet },
    { tone: "peach", icon: MessageSquareText, text: c.materials.speech },
    { tone: "green", icon: Grid3x3, text: c.materials.crossword },
    { tone: "pink", icon: ClipboardCheck, text: c.materials.quiz },
    { tone: "gray", icon: LayoutGrid, text: c.materials.more },
  ];
  const caps: Array<{ tone: Tone; icon: LucideIcon; text: string[]; href: string }> = [
    { tone: "violet", icon: FileText, text: c.caps.ksp, href: "/dashboard?new=1" },
    { tone: "blue", icon: CalendarDays, text: c.caps.plan, href: "/plans" },
    { tone: "green", icon: Library, text: c.caps.library, href: "/library" },
    { tone: "peach", icon: MonitorSmartphone, text: c.caps.os, href: "/school/dashboard" },
  ];

  return (
    <div className={s.page}>
      <div className={s.center}>
        <section className={s.hero} aria-labelledby="home-title">
          <div className={s.heroCopy}>
            <h1 id="home-title">{c.welcome}</h1>
            <p>{c.welcomeLead}</p>
          </div>
          <div className={s.heroScene}><ThreeStage scene="desk" className={s.fill} /></div>
        </section>

        <div className={s.actions}>
          {actionCards.map(({ tone, icon: Icon, text, onClick, href }, i) => {
            const inner = (
              <>
                <span className={s.tile} data-tone={tone}><Icon aria-hidden="true" /></span>
                <span className={s.actionText}><b>{text[0]}</b>{text[1]}</span>
                <ChevronRight aria-hidden="true" className={s.chev} />
              </>
            );
            const style = { "--i": i } as React.CSSProperties;
            return href
              ? <Link key={text[0]} href={href} className={s.action} data-tone={tone} style={style}>{inner}</Link>
              : <button key={text[0]} type="button" onClick={onClick} className={s.action} data-tone={tone} style={style}>{inner}</button>;
          })}
        </div>

        <div className={s.split}>
          <section className={s.panel} aria-labelledby="quick-title">
            <h2 id="quick-title">{c.quickTitle}</h2>
            <p className={s.panelLead}>{c.quickLead}</p>
            <div className={s.materials}>
              {materials.map(({ tone, icon: Icon, text }, i) => (
                <button key={text[0]} type="button" className={s.material} data-tone={tone} style={{ "--i": i } as React.CSSProperties} onClick={startMaterial}>
                  <Icon aria-hidden="true" />
                  <b>{text[0]}</b>
                  <span>{text[1]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={s.panel} aria-labelledby="projects-title">
            <div className={s.panelHead}>
              <h2 id="projects-title">{c.projects}</h2>
              <Link href="/plans" className={s.allLink}>{c.all} <ArrowRight aria-hidden="true" /></Link>
            </div>
            <div role="tablist" aria-label={c.projects} className={s.tabs}>
              <button type="button" role="tab" aria-selected={tab === "recent"} onClick={() => setTab("recent")}>{c.recent}</button>
              <button type="button" role="tab" aria-selected={tab === "favorites"} onClick={() => setTab("favorites")}>{c.favorites}</button>
            </div>
            {list.length === 0 ? (
              <div className={s.empty}>
                <p>{tab === "recent" ? c.emptyRecent : c.emptyFavorites}</p>
                {tab === "recent" && <button type="button" className={s.primary} onClick={() => setLessonOpen(true)}><Sparkles aria-hidden="true" /> {c.createFirst}</button>}
              </div>
            ) : (
              <ul className={s.projects}>
                {list.slice(0, 4).map((plan) => (
                  <li key={plan.id} className={s.project}>
                    <span className={s.projectIcon}><Layers aria-hidden="true" /></span>
                    <Link href={`/plans/${plan.id}`} className={s.projectText}>
                      <b>КСП · {plan.grade} {c.grade}</b>
                      <span>{plan.topic || plan.title}</span>
                    </Link>
                    <time dateTime={plan.updatedAt}>{when(plan.updatedAt, c, locale)}</time>
                    <details className={s.projectMenu}>
                      <summary aria-label={c.menu}><MoreHorizontal aria-hidden="true" /></summary>
                      <div>
                        <Link href={`/plans/${plan.id}`}>{c.open}</Link>
                        <Link href={`/plans/${plan.id}/edit`}>{c.edit}</Link>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className={s.panel} aria-labelledby="caps-title">
          <h2 id="caps-title">{c.capabilities}</h2>
          <div className={s.caps}>
            {caps.map(({ tone, icon: Icon, text, href }, i) => (
              <Link key={text[0]} href={href} className={s.cap} data-tone={tone} style={{ "--i": i } as React.CSSProperties}>
                <Icon aria-hidden="true" />
                <b>{text[0]}</b>
                <span>{text[1]}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <AgentPanel c={c} bilimConnected={bilimConnected} agentOnline={agentOnline} />

      <LessonDialog open={lessonOpen} onClose={() => setLessonOpen(false)} subjects={subjects} c={c} />
      <PickDialog open={pickOpen} onClose={() => setPickOpen(false)} onNew={() => { setPickOpen(false); setLessonOpen(true); }} plans={recent} c={c} />
    </div>
  );
}
