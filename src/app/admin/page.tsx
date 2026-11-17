import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminError } from "@/lib/admin/auth";
import { getAdminDashboard, type AdminSearchParams } from "@/lib/admin/queries";
import {
  listHiddenPlans,
  listModerationQueue,
  type HiddenPlanItem,
  type ModerationQueueItem,
} from "@/lib/moderation";
import { getFeedback } from "@/lib/feedback";
import { getUserNames } from "@/lib/comments";
import {
  AdminPasswordResetForm,
  BulkCodesForm,
  CreateCodeForm,
  GrantProForm,
  RevokeCodeButton,
} from "@/components/admin/code-controls";
import { HiddenPlansList, ModerationQueue } from "@/components/admin/moderation-controls";
import { FeedbackInbox, type AdminFeedbackRow } from "@/components/admin/feedback-inbox";
import { AdminOverviewPanel } from "@/components/admin/admin-overview";
import { getAdminOverview, type AdminOverview } from "@/lib/admin/users";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "Администрирование — Mekty",
  robots: { index: false, follow: false },
};
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("ru-RU", { timeZone: "UTC" }) : "—";
const statuses = { active: "Активен", redeemed: "Использован", revoked: "Отозван" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  let data: Awaited<ReturnType<typeof getAdminDashboard>>;
  let queue: ModerationQueueItem[] = [];
  let hiddenPlans: HiddenPlanItem[] = [];
  let overview: AdminOverview | null = null;
  let feedbackRows: AdminFeedbackRow[] = [];

  try {
    data = await getAdminDashboard(await searchParams);
    const [q, h, ov, fb] = await Promise.all([
      listModerationQueue().catch(() => []),
      listHiddenPlans().catch(() => []),
      getAdminOverview().catch(() => null),
      getFeedback("admin", { limit: 40 }).catch(() => ({ feedback: [], total: 0 })),
    ]);
    queue = q;
    hiddenPlans = h;
    overview = ov;

    if (fb.feedback.length > 0) {
      const names = await getUserNames(fb.feedback.map((f) => f.user_id)).catch(() => new Map());
      feedbackRows = fb.feedback.map((f) => ({
        id: String(f._id ?? ""),
        userId: f.user_id,
        userEmail: names.get(f.user_id)?.email ?? null,
        contactName: f.contact_name ?? null,
        contactInfo: f.contact_info ?? null,
        organization: f.organization ?? null,
        rating: f.rating,
        comment: f.comment,
        category: f.category,
        status: f.status,
        response: f.response,
        createdAt: f.created_at instanceof Date ? f.created_at.toISOString() : new Date().toISOString(),
      }));
    }
  } catch (error) {
    if (error instanceof AdminError && error.status === 401) redirect("/login?next=/admin");
    if (error instanceof AdminError && error.status === 403) notFound();
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl">Администрирование</h1>
        <p role="alert" className="mt-4">
          {error instanceof AdminError
            ? error.message
            : "Данные временно недоступны. Попробуйте позже."}
        </p>
        <Link href="/admin" prefetch={false} className="mt-4 inline-block underline">
          Повторить
        </Link>
      </main>
    );
  }

  const { query, stats } = data;
  const newFeedbackCount = feedbackRows.filter((f) => f.status === "new").length;
  const href = (key: "page" | "codePage", value: number) =>
    `/admin?${new URLSearchParams({
      q: query.q,
      page: String(query.page),
      codePage: String(query.codePage),
      status: query.status,
      [key]: String(value),
    })}`;

  const pagination = (key: "page" | "codePage", page: number, pages: number) => (
    <nav
      aria-label={key === "page" ? "Страницы пользователей" : "Страницы кодов"}
      className="flex items-center gap-4 text-sm"
    >
      {page > 1 && (
        <Link prefetch={false} href={href(key, page - 1)} className="underline">
          Назад
        </Link>
      )}
      <span>
        Страница {page} из {pages}
      </span>
      {page < pages && (
        <Link prefetch={false} href={href(key, page + 1)} className="underline">
          Далее
        </Link>
      )}
    </nav>
  );

  return (
    <main className="mx-auto max-w-[1400px] space-y-10 px-4 py-10 md:px-6">
      <header className="space-y-4 border-b border-border pb-6">
        <div>
          <p className="editorial-kicker">Mekty · Панель управления</p>
          <h1 className="editorial-display mt-2 text-4xl">Администрирование платформы</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Мониторинг ИИ-провайдеров и квот, управление пользователями и подписками, промокоды для учителей и школ, заявки на подключение и модерация библиотеки.
          </p>
        </div>

        <nav
          aria-label="Разделы администрирования"
          className="flex flex-wrap items-center gap-2 text-xs font-semibold"
        >
          <a href="#overview" className="rounded-lg bg-muted px-3 py-1.5 hover:bg-primary/15">
            Обзор и ИИ
          </a>
          <a href="#users-section" className="rounded-lg bg-muted px-3 py-1.5 hover:bg-primary/15">
            Пользователи ({data.matchedUsers})
          </a>
          <a href="#feedback-section" className="rounded-lg bg-muted px-3 py-1.5 hover:bg-primary/15">
            Заявки школ и отзывы ({newFeedbackCount} новых)
          </a>
          <a href="#moderation-section" className="rounded-lg bg-muted px-3 py-1.5 hover:bg-primary/15">
            Модерация ({queue.length})
          </a>
          <a href="#codes-section" className="rounded-lg bg-muted px-3 py-1.5 hover:bg-primary/15">
            Промокоды и Pro ({data.totalCodes})
          </a>
          <Link
            prefetch={false}
            href="/admin/users"
            className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary hover:bg-primary/20"
          >
            Детальные квоты и бонусы →
          </Link>
          <Link
            prefetch={false}
            href="/admin/analytics"
            className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted"
          >
            Аналитика событий →
          </Link>
        </nav>
      </header>

      <div id="overview" className="space-y-6">
        {overview ? (
          <AdminOverviewPanel data={overview} />
        ) : (
          <p role="alert" className="text-sm">
            Обзор временно недоступен.
          </p>
        )}

        <section aria-labelledby="stats-title" className="space-y-4">
          <h2 id="stats-title" className="text-2xl font-semibold">
            Ключевые метрики месяца ({stats.month}, UTC)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Пользователи", stats.totalUsers],
              ["Pro (действует)", stats.proUsers],
              ["Free", stats.freeUsers],
              ["КСП за месяц", stats.generations],
              ["Изображения за месяц", stats.images],
              ["Запросы к AI за месяц", stats.requests],
              ["Ошибки AI за месяц", stats.errors],
              ["Токены AI за месяц", stats.tokens],
              ["Среднее время AI, мс", stats.avgDuration],
              ["Активные коды", stats.activeCodes],
              ["Использованные коды", stats.redeemedCodes],
              ["Отозванные коды", stats.revokedCodes],
            ].map(([label, count]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {Number(count).toLocaleString("ru-RU")}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section id="users-section" aria-labelledby="users-title" className="space-y-4">
        <h2 id="users-title" className="text-2xl font-semibold">
          Пользователи ({data.matchedUsers})
        </h2>
        <form action="/admin" method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="status" value={query.status} />
          <label className="grid gap-1 text-sm">
            Поиск по имени, email или Mongo ID
            <input
              name="q"
              defaultValue={query.q}
              maxLength={100}
              className="w-80 max-w-full rounded-md border border-border bg-background p-2"
            />
          </label>
          <Button type="submit">Найти</Button>
          <Link prefetch={false} href="/admin" className="text-sm underline">
            Сбросить
          </Link>
        </form>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {[
                  "Пользователь / ID",
                  "Регистрация (UTC)",
                  "Тариф",
                  "Окончание (UTC)",
                  "КСП / месяц",
                  "Изображения / месяц",
                ].map((t) => (
                  <th key={t} className="p-3">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="p-3">
                    <Link
                      prefetch={false}
                      href={`/admin/users/${u.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {u.name || "Без имени"}
                    </Link>
                    <p>{u.email}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{u.id}</p>
                  </td>
                  <td className="p-3">{date(u.createdAt)}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        u.plan === "pro"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {u.plan === "pro" ? "Pro" : "Free"}
                    </span>
                  </td>
                  <td className="p-3">{date(u.expiresAt)}</td>
                  <td className="p-3 tabular-nums">{u.generations}</td>
                  <td className="p-3 tabular-nums">{u.images}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.users.length && <p>Пользователи не найдены.</p>}
        {pagination("page", query.page, data.pages)}
      </section>

      <section id="feedback-section" aria-labelledby="feedback-title" className="space-y-4">
        <div>
          <h2 id="feedback-title" className="text-2xl font-semibold">
            Заявки школ и обращения пользователей ({feedbackRows.length})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Все заявки со страницы «Тариф для школы» (/pricing → /feedback) и отзывы педагогов.
          </p>
        </div>
        <FeedbackInbox initialItems={feedbackRows} />
      </section>

      <section id="moderation-section" aria-labelledby="moderation-title" className="space-y-4">
        <h2 id="moderation-title" className="text-2xl font-semibold">
          Модерация библиотеки ({queue.length})
        </h2>
        <p className="text-xs text-muted-foreground">
          Скрытый план пропадает из библиотеки и по прямым ссылкам для всех, кроме владельца. Все действия пишутся в аудит.
        </p>
        <ModerationQueue items={queue} />
        <HiddenPlansList items={hiddenPlans} />
      </section>

      <section id="codes-section" aria-labelledby="codes-title" className="space-y-4">
        <h2 id="codes-title" className="text-2xl font-semibold">
          Коды активации и выдача Pro ({data.totalCodes})
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <CreateCodeForm />
          <BulkCodesForm />
          <GrantProForm />
          <AdminPasswordResetForm />
        </div>
        <form action="/admin" method="get" className="flex items-end gap-3 pt-2">
          <input type="hidden" name="q" value={query.q} />
          <input type="hidden" name="page" value={query.page} />
          <label className="grid gap-1 text-sm">
            Статус кодов
            <select
              name="status"
              defaultValue={query.status}
              className="rounded-md border border-border bg-background p-2"
            >
              <option value="all">Все</option>
              <option value="active">Активные</option>
              <option value="redeemed">Использованные</option>
              <option value="revoked">Отозванные</option>
            </select>
          </label>
          <Button type="submit" variant="outline">
            Фильтр
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          В таблице отображаются только метаданные (хеши кодов не раскрываются). Отзыв доступен для активных кодов.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {[
                  "ID / срок",
                  "Статус",
                  "Создан / администратор",
                  "Использован / пользователь",
                  "Отозван / администратор",
                  "Действие",
                ].map((t) => (
                  <th key={t} className="p-3">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.codes.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <p className="text-xs tabular-nums">{c.id}</p>
                    <p>
                      {c.type === "pro_1y"
                        ? "Pro · 1 год"
                        : c.type === "pro_3m"
                          ? "Pro · четверть"
                          : "Pro · 1 месяц"}
                    </p>
                  </td>
                  <td className="p-3">{statuses[c.status] ?? "Неизвестен"}</td>
                  <td className="p-3">
                    {date(c.createdAt)}
                    <p className="text-xs tabular-nums text-muted-foreground">{c.createdBy ?? "—"}</p>
                  </td>
                  <td className="p-3">
                    {date(c.redeemedAt)}
                    <p className="text-xs tabular-nums text-muted-foreground">{c.redeemedBy ?? "—"}</p>
                  </td>
                  <td className="p-3">
                    {date(c.revokedAt)}
                    <p className="text-xs tabular-nums text-muted-foreground">{c.revokedBy ?? "—"}</p>
                  </td>
                  <td className="p-3">
                    {c.status === "active" ? <RevokeCodeButton id={c.id} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.codes.length && <p>Коды не найдены.</p>}
        {pagination("codePage", query.codePage, data.codePages)}
      </section>
    </main>
  );
}
