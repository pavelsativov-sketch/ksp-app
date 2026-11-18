"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  Crown,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Plus,
  School,
  Search,
  ShieldCheck,
  Ticket,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminPasswordResetForm,
  BulkCodesForm,
  CreateCodeForm,
  GrantProForm,
  RevokeCodeButton,
} from "@/components/admin/code-controls";
import { FeedbackInbox, type AdminFeedbackRow } from "@/components/admin/feedback-inbox";
import { HiddenPlansList, ModerationQueue } from "@/components/admin/moderation-controls";
import {
  createPasswordResetLinkAction,
  hidePlanAction,
  unhidePlanAction,
} from "@/app/actions/admin";
import type { AdminOverview, DailyPoint } from "@/lib/admin/users";
import type { getAdminDashboard } from "@/lib/admin/queries";
import type { AdminControlCenterExtras } from "@/lib/admin/control-center";
import type { HiddenPlanItem, ModerationQueueItem } from "@/lib/moderation";

export type AdminTabId =
  | "overview"
  | "inbox"
  | "users"
  | "billing"
  | "ai"
  | "content"
  | "audit";

export const ADMIN_TABS: readonly AdminTabId[] = [
  "overview",
  "inbox",
  "users",
  "billing",
  "ai",
  "content",
  "audit",
] as const;

type DashboardData = Awaited<ReturnType<typeof getAdminDashboard>>;

interface AdminShellProps {
  initialTab: AdminTabId;
  data: DashboardData;
  overview: AdminOverview | null;
  feedbackRows: AdminFeedbackRow[];
  queue: ModerationQueueItem[];
  hiddenPlans: HiddenPlanItem[];
  extras: AdminControlCenterExtras;
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  grant_pro: "Выдача Pro",
  set_subscription: "Изменение подписки",
  grant_tokens: "Бонус КСП",
  create_code: "Выпуск промокода",
  create_codes_bulk: "Пакет промокодов",
  revoke_code: "Отзыв промокода",
  password_reset_link: "Ссылка сброса пароля",
  hide_plan: "Скрытие урока",
  unhide_plan: "Возврат урока",
};

function fmtNum(value: number): string {
  return Number(value || 0).toLocaleString("ru-RU");
}

function fmtKzDate(value: string | null, withTime = true): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      timeZone: "Asia/Almaty",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  } catch {
    return value;
  }
}

function DailyTrendChart({ daily }: { daily: DailyPoint[] }) {
  const width = 760;
  const height = 210;
  const pad = 28;
  const series = [
    { key: "users" as const, label: "Новые учителя", color: "#6366f1" },
    { key: "plans" as const, label: "Создано уроков (КСП)", color: "#10b981" },
    { key: "generations" as const, label: "AI-генерации", color: "#f59e0b" },
  ];
  const max = Math.max(1, ...daily.flatMap((d) => series.map((s) => d[s.key])));
  const x = (i: number) => pad + (i * (width - pad * 2)) / Math.max(1, daily.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label="Динамика платформы за 30 дней"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={pad}
              x2={width - pad}
              y1={y(max * t)}
              y2={y(max * t)}
              stroke="var(--border)"
              strokeDasharray={t ? "4 4" : undefined}
            />
            <text x={2} y={y(max * t) + 4} fontSize="11" fill="var(--muted-foreground)">
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={daily.map((d, i) => `${x(i)},${y(d[s.key])}`).join(" ")}
          />
        ))}
        {daily.map((d, i) => (
          <rect
            key={d.day}
            x={x(i) - 6}
            y={pad}
            width={12}
            height={height - pad * 2}
            fill="transparent"
          >
            <title>{`${d.day}: учителей +${d.users}, уроков +${d.plans}, AI-генераций ${d.generations}`}</title>
          </rect>
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto tabular-nums">
          {daily[0]?.day} — {daily[daily.length - 1]?.day}
        </span>
      </div>
    </div>
  );
}

function downloadUsersCsv(
  users: DashboardData["users"],
) {
  const header = "ID,Name,Email,Plan,ExpiresAt,KspMonth,ImagesMonth,CreatedAt";
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = users.map((u) =>
    [
      esc(u.id),
      esc(u.name),
      esc(u.email),
      esc(u.plan),
      esc(u.expiresAt),
      u.generations,
      u.images,
      esc(u.createdAt),
    ].join(","),
  );
  const blob = new Blob(["\uFEFF" + [header, ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mekty-users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AdminShell({
  initialTab,
  data,
  overview,
  feedbackRows,
  queue,
  hiddenPlans,
  extras,
}: AdminShellProps) {
  const router = useRouter();
  const [tab, setTab] = useState<AdminTabId>(initialTab);
  const [planTierFilter, setPlanTierFilter] = useState<"all" | "pro" | "free">("all");
  const [busyUserAction, setBusyUserAction] = useState<string | null>(null);
  const [userNotice, setUserNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [userResetLinks, setUserResetLinks] = useState<Record<string, string>>({});
  const [planSearch, setPlanSearch] = useState("");
  const [plansState, setPlansState] = useState(extras.recentPlans);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  const newFeedbackCount = feedbackRows.filter((f) => f.status === "new").length;
  const configuredEnvCount = extras.envStatuses.filter((e) => e.configured).length;
  const aiSuccessRate =
    data.stats.requests > 0
      ? Math.round(((data.stats.requests - data.stats.errors) / data.stats.requests) * 100)
      : 100;
  const proConversion =
    data.stats.totalUsers > 0
      ? Math.round((data.stats.proUsers / data.stats.totalUsers) * 100)
      : 0;

  function switchTab(next: AdminTabId) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  function pageHref(key: "page" | "codePage", value: number, targetTab: AdminTabId) {
    return `/admin?${new URLSearchParams({
      tab: targetTab,
      q: data.query.q,
      page: String(data.query.page),
      codePage: String(data.query.codePage),
      status: data.query.status,
      [key]: String(value),
    })}`;
  }

  const filteredUsers = useMemo(() => {
    if (planTierFilter === "all") return data.users;
    return data.users.filter((u) => u.plan === planTierFilter);
  }, [data.users, planTierFilter]);

  const filteredPlans = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    if (!q) return plansState;
    return plansState.filter((p) =>
      [p.title, p.ownerEmail, p.ownerName, `${p.grade}`]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [plansState, planSearch]);

  async function quickUserSubscription(
    userId: string,
    email: string,
    body: Record<string, unknown>,
    label: string,
  ) {
    setBusyUserAction(userId);
    setUserNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Ошибка изменения подписки");
      setUserNotice({ ok: true, text: `${email}: ${label}` });
      router.refresh();
    } catch (e) {
      setUserNotice({ ok: false, text: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setBusyUserAction(null);
    }
  }

  async function quickUserBonus(userId: string, email: string, amount: number) {
    setBusyUserAction(userId);
    setUserNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, scope: "month" }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Ошибка начисления бонуса");
      setUserNotice({ ok: true, text: `${email}: начислено +${amount} КСП на этот месяц` });
      router.refresh();
    } catch (e) {
      setUserNotice({ ok: false, text: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setBusyUserAction(null);
    }
  }

  async function quickUserPasswordReset(userId: string, email: string) {
    setBusyUserAction(userId);
    setUserNotice(null);
    try {
      const res = await createPasswordResetLinkAction({ email });
      if (!res.ok) throw new Error(res.error);
      setUserResetLinks((prev) => ({ ...prev, [userId]: res.resetUrl }));
      await navigator.clipboard.writeText(res.resetUrl).catch(() => {});
      setUserNotice({
        ok: true,
        text: `Одноразовая ссылка сброса пароля для ${email} скопирована в буфер обмена!`,
      });
    } catch (e) {
      setUserNotice({ ok: false, text: e instanceof Error ? e.message : "Ошибка создания ссылки" });
    } finally {
      setBusyUserAction(null);
    }
  }

  async function togglePlanVisibility(planId: string, currentlyHidden: boolean) {
    setBusyPlanId(planId);
    try {
      const res = currentlyHidden
        ? await unhidePlanAction({ planId })
        : await hidePlanAction({ planId });
      if (res.ok) {
        setPlansState((prev) =>
          prev.map((p) => (p.id === planId ? { ...p, hidden: !currentlyHidden } : p)),
        );
        router.refresh();
      }
    } finally {
      setBusyPlanId(null);
    }
  }

  const navItems: Array<{
    id: AdminTabId;
    label: string;
    sub: string;
    icon: React.ReactNode;
    badge?: number;
    badgeTone?: "amber" | "rose" | "muted";
  }> = [
    {
      id: "overview",
      label: "Дашборд",
      sub: "Сводка и графики",
      icon: <LayoutDashboard className="size-4" />,
    },
    {
      id: "inbox",
      label: "Заявки и поддержка",
      sub: "Pro, школы, сброс пароля",
      icon: <Inbox className="size-4" />,
      badge: newFeedbackCount > 0 ? newFeedbackCount : feedbackRows.length,
      badgeTone: newFeedbackCount > 0 ? "amber" : "muted",
    },
    {
      id: "users",
      label: "Пользователи",
      sub: "Подписки, лимиты, бонусы",
      icon: <Users className="size-4" />,
      badge: data.stats.totalUsers,
      badgeTone: "muted",
    },
    {
      id: "billing",
      label: "Промокоды и Pro",
      sub: "Выпуск кодов и доступ",
      icon: <Ticket className="size-4" />,
      badge: data.stats.activeCodes,
      badgeTone: "muted",
    },
    {
      id: "ai",
      label: "ИИ и система",
      sub: `${configuredEnvCount}/${extras.envStatuses.length} ключей активны`,
      icon: <Bot className="size-4" />,
    },
    {
      id: "content",
      label: "Уроки и школы",
      sub: "Библиотека и модерация",
      icon: <BookOpen className="size-4" />,
      badge: queue.length > 0 ? queue.length : undefined,
      badgeTone: "rose",
    },
    {
      id: "audit",
      label: "Аудит и трафик",
      sub: "Журнал действий и визиты",
      icon: <ShieldCheck className="size-4" />,
    },
  ];

  function resolveUserLabel(uid: string | null): string {
    if (!uid) return "—";
    const found = extras.userEmailMap[uid];
    if (found?.email) return found.name ? `${found.name} (${found.email})` : found.email;
    return uid;
  }

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 md:px-6 lg:py-8">
      {/* Верхняя шапка центра управления */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="size-4" />
            Mekty · Центр управления платформой
          </div>
          <h1 className="editorial-display mt-1 text-2xl sm:text-3xl">Админ-панель</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="size-2 rounded-full bg-emerald-500" />
            ИИ-успешность: {aiSuccessRate}%
          </span>
          <span className="rounded-full border border-border bg-muted/60 px-3 py-1 font-medium text-muted-foreground">
            Время: Алматы / Астана (UTC+5)
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">На сайт →</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Боковая навигация */}
        <aside className="space-y-3">
          <nav
            aria-label="Разделы админ-панели"
            className="flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-surface p-2 lg:flex-col lg:overflow-visible"
          >
            {navItems.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchTab(item.id)}
                  className={`flex shrink-0 items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all lg:w-full ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={active ? "text-primary-foreground" : "text-primary"}>
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{item.label}</div>
                      <div
                        className={`hidden truncate text-[11px] lg:block ${
                          active ? "text-primary-foreground/80" : "text-muted-foreground"
                        }`}
                      >
                        {item.sub}
                      </div>
                    </div>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                        active
                          ? "bg-white/20 text-white"
                          : item.badgeTone === "amber"
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : item.badgeTone === "rose"
                              ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Мини-памятка администратора на десктопе */}
          <div className="hidden rounded-2xl border border-border bg-surface p-4 text-xs text-muted-foreground lg:block space-y-2">
            <div className="font-semibold text-foreground">Быстрая шпаргалка</div>
            <p>• Оплата Kaspi / заявка школы падает во вкладку <b>«Заявки и поддержка»</b>.</p>
            <p>• Прямо из заявки можно в 1 клик выдать <b>Pro +1 мес</b>, выпустить промокод или скопировать ссылку сброса пароля.</p>
            <p>• В разделе <b>«ИИ и система»</b> виден статус всех подключённых API-ключей и скорость каждой модели.</p>
          </div>
        </aside>

        {/* Рабочая область выбранной вкладки */}
        <main className="min-w-0 space-y-6">
          {/* ==================== 1. ДАШБОРД ==================== */}
          {tab === "overview" && (
            <div className="space-y-6">
              {(newFeedbackCount > 0 || queue.length > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2.5 font-medium">
                    <AlertCircle className="size-5 shrink-0 text-amber-600" />
                    <span>
                      Требуют внимания:{" "}
                      {newFeedbackCount > 0 && <b>{newFeedbackCount} новых заявок/обращений</b>}
                      {newFeedbackCount > 0 && queue.length > 0 && " и "}
                      {queue.length > 0 && <b>{queue.length} жалоб в модерации</b>}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {newFeedbackCount > 0 && (
                      <Button size="sm" onClick={() => switchTab("inbox")}>
                        Открыть заявки ({newFeedbackCount})
                      </Button>
                    )}
                    {queue.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => switchTab("content")}>
                        Модерация ({queue.length})
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* 8 чистых сводных KPI карточек без дублей */}
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Всего учителей</span>
                    <Users className="size-4 text-primary" />
                  </div>
                  <div className="mt-2 text-3xl font-bold tabular-nums">
                    {fmtNum(data.stats.totalUsers)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    +{fmtNum(overview?.newUsers7 ?? 0)} за 7 дн. · активных:{" "}
                    {fmtNum(overview?.activeUsers7 ?? 0)}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    <span>Активные подписки Pro</span>
                    <Crown className="size-4 text-amber-500" />
                  </div>
                  <div className="mt-2 text-3xl font-bold tabular-nums">
                    {fmtNum(data.stats.proUsers)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Конверсия {proConversion}% · Free: {fmtNum(data.stats.freeUsers)}
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Создано уроков (КСП)</span>
                    <BookOpen className="size-4 text-primary" />
                  </div>
                  <div className="mt-2 text-3xl font-bold tabular-nums">
                    {fmtNum(extras.counts.totalPlans)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    В этом месяце: {fmtNum(data.stats.generations)} · публичных:{" "}
                    {fmtNum(extras.counts.publicPlans)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => switchTab("inbox")}
                  className="rounded-2xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/50"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Заявки и обращения</span>
                    <Inbox className="size-4 text-primary" />
                  </div>
                  <div className="mt-2 text-3xl font-bold tabular-nums">
                    {fmtNum(newFeedbackCount)}{" "}
                    <span className="text-base font-normal text-muted-foreground">новых</span>
                  </div>
                  <p className="mt-1 text-xs text-primary underline">
                    Всего в базе: {fmtNum(feedbackRows.length)} → открыть
                  </p>
                </button>

                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Запросы к ИИ ({data.stats.month})</span>
                    <Activity className="size-4 text-primary" />
                  </div>
                  <div className="mt-2 text-3xl font-bold tabular-nums">
                    {fmtNum(data.stats.requests)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Успешно {aiSuccessRate}% · ср. ответ {(data.stats.avgDuration / 1000).toFixed(1)} с
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>СОР/СОЧ и документы завуча</span>
                    <BarChart3 className="size-4 text-primary" />
                  </div>
                  <div className="mt-2 text-3xl font-bold tabular-nums">
                    {fmtNum(extras.counts.sorSochCount + extras.counts.schoolDocsCount)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    СОР/СОЧ: {fmtNum(extras.counts.sorSochCount)} · ИОМ/ВШК/хар-ки:{" "}
                    {fmtNum(extras.counts.schoolDocsCount)}
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Ученики и выданные ДЗ</span>
                    <Users className="size-4 text-primary" />
                  </div>
                  <div className="mt-2 text-3xl font-bold tabular-nums">
                    {fmtNum(extras.counts.journalStudentsCount)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    В электронных журналах · выдач ДЗ: {fmtNum(extras.counts.assignmentsCount)}
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Школы и промокоды</span>
                    <School className="size-4 text-primary" />
                  </div>
                  <div className="mt-2 text-3xl font-bold tabular-nums">
                    {fmtNum(extras.schools.length)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Свободных промокодов Pro: {fmtNum(data.stats.activeCodes)}
                  </p>
                </div>
              </div>

              {/* График активности за 30 дней */}
              {overview && (
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold">Динамика за последние 30 дней</h2>
                      <p className="text-xs text-muted-foreground">
                        Регистрации педагогов, новые КСП и вызовы генерации по дням
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => switchTab("billing")}>
                        <Ticket className="size-4" /> Выдать Pro / Промокод
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => switchTab("ai")}>
                        <Bot className="size-4" /> Проверить ИИ-ключи
                      </Button>
                    </div>
                  </div>
                  <DailyTrendChart daily={overview.daily} />
                </div>
              )}
            </div>
          )}

          {/* ==================== 2. ЗАЯВКИ И ПОДДЕРЖКА ==================== */}
          {tab === "inbox" && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-xl font-bold">
                  Входящие заявки на покупку Pro, подключение школ и поддержка
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Прямо из карточки обращения можно в один клик выдать подписку Pro по email, сгенерировать промокод для отправки в WhatsApp или скопировать ссылку сброса пароля.
                </p>
              </div>
              <FeedbackInbox initialItems={feedbackRows} />
            </section>
          )}

          {/* ==================== 3. ПОЛЬЗОВАТЕЛИ ==================== */}
          {tab === "users" && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
                <div>
                  <h2 className="text-xl font-bold">
                    Управление пользователями ({fmtNum(data.matchedUsers)})
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Поиск учителей, мгновенная выдача Pro, начисление бонусных КСП и генерация ссылки восстановления пароля прямо в строке таблицы.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadUsersCsv(filteredUsers)}
                >
                  <Download className="size-4" /> Выгрузить CSV ({filteredUsers.length})
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
                <form action="/admin" method="get" className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                  <input type="hidden" name="tab" value="users" />
                  <input type="hidden" name="status" value={data.query.status} />
                  <div className="relative flex-1 min-w-[220px] max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      name="q"
                      defaultValue={data.query.q}
                      maxLength={100}
                      placeholder="Имя учителя, email или ID…"
                      className="pl-9"
                    />
                  </div>
                  <Button type="submit" size="sm">
                    Найти
                  </Button>
                  {data.query.q && (
                    <Link
                      prefetch={false}
                      href="/admin?tab=users"
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      Сбросить поиск
                    </Link>
                  )}
                </form>

                <div className="flex items-center gap-1.5">
                  {(
                    [
                      ["all", "Все"],
                      ["pro", "Только Pro"],
                      ["free", "Только Free"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPlanTierFilter(val)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        planTierFilter === val
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {userNotice && (
                <div
                  role={userNotice.ok ? "status" : "alert"}
                  className={`rounded-xl border px-4 py-2.5 text-xs font-semibold ${
                    userNotice.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {userNotice.text}
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="p-3.5">Учитель</th>
                      <th className="p-3.5">Тариф и срок</th>
                      <th className="p-3.5">Расход за месяц</th>
                      <th className="p-3.5">Регистрация</th>
                      <th className="p-3.5 text-right">Быстрые действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const isBusy = busyUserAction === u.id;
                      return (
                        <tr
                          key={u.id}
                          className="border-b border-border last:border-0 hover:bg-muted/20"
                        >
                          <td className="p-3.5">
                            <Link
                              prefetch={false}
                              href={`/admin/users/${u.id}`}
                              className="font-semibold text-foreground hover:text-primary hover:underline"
                            >
                              {u.name || "Без имени"}
                            </Link>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                            {userResetLinks[u.id] && (
                              <div className="mt-1.5 flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-[11px]">
                                <span className="truncate max-w-[240px] font-mono">
                                  {userResetLinks[u.id]}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(userResetLinks[u.id]!);
                                  }}
                                  className="font-semibold text-primary underline"
                                >
                                  Копировать
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                u.plan === "pro"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {u.plan === "pro" ? "★ Pro" : "Free"}
                            </span>
                            {u.expiresAt && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                до {fmtKzDate(u.expiresAt, false)}
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 text-xs tabular-nums">
                            <div>
                              КСП: <b>{u.generations}</b>
                            </div>
                            <div className="text-muted-foreground">
                              Картинки: {u.images}
                            </div>
                          </td>
                          <td className="p-3.5 text-xs text-muted-foreground">
                            {fmtKzDate(u.createdAt, false)}
                          </td>
                          <td className="p-3.5">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() =>
                                  void quickUserSubscription(
                                    u.id,
                                    u.email,
                                    { action: "extend", plan: "pro", months: 1 },
                                    "выдан Pro на +1 месяц",
                                  )
                                }
                                title="Продлить / выдать Pro на 1 месяц"
                              >
                                <Crown className="size-3.5 text-amber-500" />
                                +1 мес Pro
                              </Button>

                              {u.plan === "pro" && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={isBusy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Снять подписку Pro у ${u.email} и перевести на Free?`,
                                      )
                                    ) {
                                      void quickUserSubscription(
                                        u.id,
                                        u.email,
                                        { action: "revoke" },
                                        "подписка Pro снята",
                                      );
                                    }
                                  }}
                                  className="text-destructive hover:text-destructive"
                                >
                                  Снять Pro
                                </Button>
                              )}

                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => void quickUserBonus(u.id, u.email, 5)}
                                title="Добавить +5 бесплатных генераций КСП в этом месяце"
                              >
                                <Plus className="size-3.5" />5 КСП
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => void quickUserPasswordReset(u.id, u.email)}
                                title="Скопировать одноразовую ссылку сброса пароля"
                              >
                                <KeyRound className="size-3.5" />
                                Сброс
                              </Button>

                              <Button asChild size="sm" variant="ghost">
                                <Link prefetch={false} href={`/admin/users/${u.id}`}>
                                  Карточка →
                                </Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Пользователи по заданному фильтру не найдены.
                  </p>
                )}
              </div>

              {data.pages > 1 && (
                <nav
                  aria-label="Страницы пользователей"
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm"
                >
                  <span>
                    Страница <b>{data.query.page}</b> из <b>{data.pages}</b>
                  </span>
                  <div className="flex gap-2">
                    {data.query.page > 1 && (
                      <Button asChild variant="outline" size="sm">
                        <Link prefetch={false} href={pageHref("page", data.query.page - 1, "users")}>
                          ← Назад
                        </Link>
                      </Button>
                    )}
                    {data.query.page < data.pages && (
                      <Button asChild variant="outline" size="sm">
                        <Link prefetch={false} href={pageHref("page", data.query.page + 1, "users")}>
                          Далее →
                        </Link>
                      </Button>
                    )}
                  </div>
                </nav>
              )}
            </section>
          )}

          {/* ==================== 4. ПРОМОКОДЫ И БИЛЛИНГ ==================== */}
          {tab === "billing" && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-xl font-bold">Промокоды, ручная выдача Pro и доступ</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Создавайте одиночные коды для розничной оплаты Kaspi, пакеты промокодов в CSV для целой школы или начисляйте Pro напрямую по email.
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <CreateCodeForm />
                <BulkCodesForm />
                <GrantProForm />
                <AdminPasswordResetForm />
              </div>

              <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">
                      Реестр выпущенных кодов ({fmtNum(data.totalCodes)})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Активных: {data.stats.activeCodes} · Использовано: {data.stats.redeemedCodes} · Отозвано: {data.stats.revokedCodes}
                    </p>
                  </div>

                  <form action="/admin" method="get" className="flex items-center gap-2">
                    <input type="hidden" name="tab" value="billing" />
                    <input type="hidden" name="q" value={data.query.q} />
                    <select
                      name="status"
                      defaultValue={data.query.status}
                      aria-label="Статус промокодов"
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="all">Все статусы</option>
                      <option value="active">Активные</option>
                      <option value="redeemed">Использованные</option>
                      <option value="revoked">Отозванные</option>
                    </select>
                    <Button type="submit" size="sm" variant="outline">
                      Применить
                    </Button>
                  </form>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                        <th className="p-3">Срок / ID</th>
                        <th className="p-3">Статус</th>
                        <th className="p-3">Когда создан</th>
                        <th className="p-3">Кем активирован</th>
                        <th className="p-3 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.codes.map((c) => (
                        <tr key={c.id} className="border-b border-border last:border-0">
                          <td className="p-3">
                            <div className="font-semibold">
                              {c.type === "pro_1y"
                                ? "Pro · 1 год"
                                : c.type === "pro_3m"
                                  ? "Pro · Четверть (3 мес)"
                                  : "Pro · 1 месяц"}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">{c.id}</div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                c.status === "active"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : c.status === "redeemed"
                                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {c.status === "active"
                                ? "Активен"
                                : c.status === "redeemed"
                                  ? "Использован"
                                  : "Отозван"}
                            </span>
                          </td>
                          <td className="p-3 text-xs">
                            <div>{fmtKzDate(c.createdAt)}</div>
                            <div className="text-muted-foreground">
                              {resolveUserLabel(c.createdBy)}
                            </div>
                          </td>
                          <td className="p-3 text-xs">
                            {c.redeemedAt ? (
                              <>
                                <div className="font-medium text-foreground">
                                  {resolveUserLabel(c.redeemedBy)}
                                </div>
                                <div className="text-muted-foreground">
                                  {fmtKzDate(c.redeemedAt)}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {c.status === "active" ? <RevokeCodeButton id={c.id} /> : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.codes.length === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      Промокоды по выбранному фильтру не найдены.
                    </p>
                  )}
                </div>

                {data.codePages > 1 && (
                  <nav
                    aria-label="Страницы кодов"
                    className="flex items-center justify-between pt-2 text-sm"
                  >
                    <span>
                      Страница {data.query.codePage} из {data.codePages}
                    </span>
                    <div className="flex gap-2">
                      {data.query.codePage > 1 && (
                        <Button asChild variant="outline" size="sm">
                          <Link
                            prefetch={false}
                            href={pageHref("codePage", data.query.codePage - 1, "billing")}
                          >
                            ← Назад
                          </Link>
                        </Button>
                      )}
                      {data.query.codePage < data.codePages && (
                        <Button asChild variant="outline" size="sm">
                          <Link
                            prefetch={false}
                            href={pageHref("codePage", data.query.codePage + 1, "billing")}
                          >
                            Далее →
                          </Link>
                        </Button>
                      )}
                    </div>
                  </nav>
                )}
              </div>
            </section>
          )}

          {/* ==================== 5. ИИ И СИСТЕМА ==================== */}
          {tab === "ai" && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-xl font-bold">Статус ИИ-провайдеров и ключей окружения</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Безопасная диагностика подключённых сервисов (значения секретных ключей скрыты) и реальная статистика ответов каждой нейросети за последние 30 дней.
                </p>
              </div>

              {/* Карта подключённых переменных окружения */}
              <div className="grid gap-4 lg:grid-cols-3">
                {(
                  [
                    ["text_ai", "Текстовые ИИ-модели (КСП, СОР/СОЧ)"],
                    ["media_ai", "Картинки и презентации (.pptx)"],
                    ["infra", "Поиск учебников (RAG) и почта"],
                  ] as const
                ).map(([groupKey, groupTitle]) => (
                  <div
                    key={groupKey}
                    className="space-y-3 rounded-2xl border border-border bg-surface p-4"
                  >
                    <h3 className="text-sm font-bold">{groupTitle}</h3>
                    <div className="space-y-2.5">
                      {extras.envStatuses
                        .filter((item) => item.group === groupKey)
                        .map((item) => (
                          <div
                            key={item.key}
                            className="rounded-xl border border-border/80 bg-muted/25 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground">{item.name}</span>
                              {item.configured ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                                  <CheckCircle2 className="size-3" /> Активен
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                                  <XCircle className="size-3" /> Не задан
                                </span>
                              )}
                            </div>
                            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                              {item.key}
                            </div>
                            <p className="mt-1 text-muted-foreground">{item.hint}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Живая таблица телеметрии моделей */}
              <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
                <div>
                  <h3 className="text-lg font-bold">Живая телеметрия моделей за 30 дней</h3>
                  <p className="text-xs text-muted-foreground">
                    Показывает, какие провайдеры реально отвечают быстрее всего, а какие упираются в квоту (429 / 402).
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                        <th className="p-3">Провайдер / Модель</th>
                        <th className="p-3">Вызовов</th>
                        <th className="p-3">Надёжность</th>
                        <th className="p-3">Ср. время</th>
                        <th className="p-3">Последний вызов</th>
                        <th className="p-3">Последняя ошибка (если была)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extras.providerHealth.map((p) => (
                        <tr
                          key={`${p.provider}:${p.model}`}
                          className="border-b border-border last:border-0"
                        >
                          <td className="p-3">
                            <div className="font-semibold">{p.provider}</div>
                            <div className="font-mono text-xs text-muted-foreground">{p.model}</div>
                          </td>
                          <td className="p-3 tabular-nums">
                            <b>{fmtNum(p.calls)}</b>{" "}
                            <span className="text-xs text-muted-foreground">
                              (ок: {p.okCount}, сбоев: {p.failCount})
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full ${
                                    p.successRate >= 85
                                      ? "bg-emerald-500"
                                      : p.successRate >= 50
                                        ? "bg-amber-500"
                                        : "bg-rose-500"
                                  }`}
                                  style={{ width: `${p.successRate}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold tabular-nums">
                                {p.successRate}%
                              </span>
                            </div>
                          </td>
                          <td className="p-3 text-xs tabular-nums">
                            {(p.avgDurationMs / 1000).toFixed(2)} с
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {fmtKzDate(p.lastSeenAt)}
                          </td>
                          <td className="p-3 text-xs text-rose-600 dark:text-rose-400 max-w-xs truncate">
                            {p.lastError || <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {extras.providerHealth.length === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      За последние 30 дней телеметрия ИИ-вызовов пока пуста.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ==================== 6. УРОКИ, МОДЕРАЦИЯ И ШКОЛЫ ==================== */}
          {tab === "content" && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-xl font-bold">Модерация уроков, публичная библиотека и школы</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Управляйте жалобами, скрывайте/возвращайте любые планы из библиотеки в 1 клик и просматривайте подключённые организации.
                </p>
              </div>

              {/* Очередь жалоб и скрытые планы */}
              <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
                <h3 className="text-lg font-bold">
                  Жалобы пользователей ({queue.length}) и скрытые уроки ({hiddenPlans.length})
                </h3>
                <ModerationQueue items={queue} />
                <HiddenPlansList items={hiddenPlans} />
              </div>

              {/* Все последние уроки с прямой модерацией в 1 клик */}
              <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">Последние созданные КСП на платформе</h3>
                    <p className="text-xs text-muted-foreground">
                      Всего планов: {fmtNum(extras.counts.totalPlans)} · В публичной библиотеке:{" "}
                      {fmtNum(extras.counts.publicPlans)}
                    </p>
                  </div>
                  <div className="relative w-72 max-w-full">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={planSearch}
                      onChange={(e) => setPlanSearch(e.target.value)}
                      placeholder="Фильтр по теме или автору…"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                        <th className="p-3">Тема урока</th>
                        <th className="p-3">Автор</th>
                        <th className="p-3">Доступ</th>
                        <th className="p-3">Создан</th>
                        <th className="p-3 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlans.map((p) => (
                        <tr key={p.id} className="border-b border-border last:border-0">
                          <td className="p-3">
                            <Link
                              href={`/plans/${p.id}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 font-semibold hover:text-primary hover:underline"
                            >
                              {p.title}
                              <ExternalLink className="size-3 shrink-0" />
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {p.grade} кл. · {p.language === "kz" ? "ҚАЗ" : "РУС"} · просмотров{" "}
                              {p.viewsCount} · ★ {p.likesCount}
                            </div>
                          </td>
                          <td className="p-3 text-xs">
                            <div className="font-medium">{p.ownerName || "—"}</div>
                            <div className="text-muted-foreground">{p.ownerEmail || p.ownerId}</div>
                          </td>
                          <td className="p-3 text-xs">
                            {p.hidden ? (
                              <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 font-semibold text-rose-700 dark:text-rose-300">
                                Скрыт модератором
                              </span>
                            ) : p.visibility === "public" ? (
                              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                                В библиотеке
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                                Личный
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {fmtKzDate(p.createdAt)}
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyPlanId === p.id}
                              onClick={() => void togglePlanVisibility(p.id, p.hidden)}
                            >
                              {busyPlanId === p.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : p.hidden ? (
                                <Eye className="size-3.5 text-emerald-600" />
                              ) : (
                                <EyeOff className="size-3.5 text-rose-500" />
                              )}
                              {p.hidden ? "Вернуть" : "Скрыть"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Зарегистрированные школы */}
              <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
                <h3 className="text-lg font-bold">
                  Зарегистрированные школы ({extras.schools.length})
                </h3>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                        <th className="p-3">Школа</th>
                        <th className="p-3">Город / Регион</th>
                        <th className="p-3">Код приглашения</th>
                        <th className="p-3">Педагогов</th>
                        <th className="p-3">Учеников</th>
                        <th className="p-3">Дата создания</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extras.schools.map((sch) => (
                        <tr key={sch.id} className="border-b border-border last:border-0">
                          <td className="p-3 font-semibold">{sch.name}</td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {sch.city}, {sch.region} ({sch.academicYear})
                          </td>
                          <td className="p-3">
                            <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-bold">
                              {sch.code}
                            </code>
                          </td>
                          <td className="p-3 tabular-nums font-medium">{sch.membersCount}</td>
                          <td className="p-3 tabular-nums">{sch.studentsCount}</td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {fmtKzDate(sch.createdAt, false)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {extras.schools.length === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      Организации ещё не создавались.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ==================== 7. АУДИТ И ТРАФИК ==================== */}
          {tab === "audit" && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
                <div>
                  <h2 className="text-xl font-bold">Журнал действий администраторов и посещаемость</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Все ручные начисления Pro, выпуски промокодов, ссылки сброса пароля и статистика посещений разделов за 30 дней.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link prefetch={false} href="/admin/analytics">
                    Подробные графики событий →
                  </Link>
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <div className="text-xs text-muted-foreground">Просмотры страниц (30 дн.)</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {fmtNum(extras.siteAnalytics.pageViews30d)}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <div className="text-xs text-muted-foreground">Скачиваний документов (30 дн.)</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {fmtNum(extras.siteAnalytics.exports30d)}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <div className="text-xs text-muted-foreground">Возвращающиеся учителя (30 дн.)</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {fmtNum(extras.siteAnalytics.returningUsers30d)}
                  </div>
                </div>
              </div>

              {extras.siteAnalytics.topPages.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
                  <h3 className="text-base font-bold">Самые посещаемые разделы за 30 дней</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {extras.siteAnalytics.topPages.map((tp) => (
                      <div
                        key={tp.path}
                        className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2 text-xs"
                      >
                        <span className="truncate font-mono">{tp.path}</span>
                        <span className="ml-2 font-bold tabular-nums">{fmtNum(tp.views)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
                <h3 className="text-lg font-bold">Последние действия администраторов</h3>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                        <th className="p-3">Время (Алматы)</th>
                        <th className="p-3">Операция</th>
                        <th className="p-3">Кому / Объект</th>
                        <th className="p-3">Детали</th>
                        <th className="p-3">Администратор</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extras.auditRows.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                            {fmtKzDate(row.at)}
                          </td>
                          <td className="p-3">
                            <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                              {AUDIT_ACTION_LABEL[row.action] ?? row.action}
                            </span>
                          </td>
                          <td className="p-3 text-xs font-medium">
                            {row.targetEmail || row.targetUserId || "—"}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">{row.summary}</td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {row.adminEmail || row.adminId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {extras.auditRows.length === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      В журнале действий администратора пока нет записей.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
