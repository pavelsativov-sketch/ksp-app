import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminError } from "@/lib/admin/auth";
import { getAdminDashboard, type AdminSearchParams } from "@/lib/admin/queries";
import { listModerationQueue, type ModerationQueueItem } from "@/lib/moderation";
import { BulkCodesForm, CreateCodeForm, GrantProForm, RevokeCodeButton } from "@/components/admin/code-controls";
import { ModerationQueue } from "@/components/admin/moderation-controls";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Администрирование — Mekty", robots: { index: false, follow: false } };
const date = (value: string | null) => value ? new Date(value).toLocaleString("ru-RU", { timeZone: "UTC" }) : "—";
const statuses = { active: "Активен", redeemed: "Использован", revoked: "Отозван" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  let data: Awaited<ReturnType<typeof getAdminDashboard>>;
  let queue: ModerationQueueItem[] = [];
  try {
    data = await getAdminDashboard(await searchParams);
    try {
      queue = await listModerationQueue();
    } catch {
      queue = [];
    }
  } catch (error) {
    if (error instanceof AdminError && error.status === 401) redirect("/login?next=/admin");
    if (error instanceof AdminError && error.status === 403) notFound();
    return <main className="mx-auto max-w-3xl px-4 py-16"><h1 className="text-3xl">Администрирование</h1>
      <p role="alert" className="mt-4">{error instanceof AdminError ? error.message : "Данные временно недоступны. Попробуйте позже."}</p>
      <Link href="/admin" prefetch={false} className="mt-4 inline-block underline">Повторить</Link></main>;
  }
  const { query, stats } = data;
  const href = (key: "page" | "codePage", value: number) => `/admin?${new URLSearchParams({ q: query.q, page: String(query.page), codePage: String(query.codePage), status: query.status, [key]: String(value) })}`;
  const pagination = (key: "page" | "codePage", page: number, pages: number) => <nav aria-label={key === "page" ? "Страницы пользователей" : "Страницы кодов"} className="flex items-center gap-4 text-sm">
    {page > 1 && <Link prefetch={false} href={href(key, page - 1)} className="underline">Назад</Link>}
    <span>Страница {page} из {pages}</span>
    {page < pages && <Link prefetch={false} href={href(key, page + 1)} className="underline">Далее</Link>}
  </nav>;
  return <main className="mx-auto max-w-[1400px] space-y-10 px-4 py-12 md:px-6">
    <header><p className="editorial-kicker">Mekty</p><h1 className="editorial-display mt-3 text-4xl">Администрирование</h1>
      <p className="mt-3 text-sm text-muted-foreground">Просмотр пользователей и использования, модерация библиотеки, коды и ручная выдача Pro. Назначение прав недоступно.</p></header>
    <section aria-labelledby="stats-title" className="space-y-4">
      <h2 id="stats-title" className="text-2xl font-semibold">Статистика</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ["Пользователи", stats.totalUsers], ["Pro (действует)", stats.proUsers], ["Free", stats.freeUsers],
        ["КСП за месяц", stats.generations], ["Изображения за месяц", stats.images],
        ["Запросы к AI за месяц", stats.requests], ["Ошибки AI за месяц", stats.errors],
        ["Токены AI за месяц", stats.tokens], ["Среднее время AI, мс", stats.avgDuration],
        ["Активные коды", stats.activeCodes], ["Использованные коды", stats.redeemedCodes], ["Отозванные коды", stats.revokedCodes],
      ].map(([label, count]) => <div key={label} className="rounded-xl border border-border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{Number(count).toLocaleString("ru-RU")}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">Месяц: {stats.month}, UTC. КСП и изображения — записи учёта квоты (включая занятые слоты). Телеметрия провайдеров считается отдельно, без отзывов и двойного учёта слотов. Это не финансовая отчётность.</p>
    </section>
    <section aria-labelledby="users-title" className="space-y-4">
      <h2 id="users-title" className="text-2xl font-semibold">Пользователи ({data.matchedUsers})</h2>
      <form action="/admin" method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="status" value={query.status} />
        <label className="grid gap-1 text-sm">Поиск по имени, email или Mongo ID
          <input name="q" defaultValue={query.q} maxLength={100} className="w-80 max-w-full rounded-md border border-border bg-background p-2" />
        </label><Button type="submit">Найти</Button><Link prefetch={false} href="/admin" className="text-sm underline">Сбросить</Link>
      </form>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border">{["Пользователь / ID", "Регистрация (UTC)", "Тариф", "Окончание (UTC)", "КСП / месяц", "Изображения / месяц"].map((t) => <th key={t} className="p-3">{t}</th>)}</tr></thead>
        <tbody>{data.users.map((u) => <tr key={u.id} className="border-b border-border"><td className="p-3"><p>{u.name || "Без имени"}</p><p>{u.email}</p><p className="font-mono text-xs text-muted-foreground">{u.id}</p></td><td className="p-3">{date(u.createdAt)}</td><td className="p-3">{u.plan === "pro" ? "Pro" : "Free"}</td><td className="p-3">{date(u.expiresAt)}</td><td className="p-3">{u.generations}</td><td className="p-3">{u.images}</td></tr>)}</tbody>
      </table></div>{!data.users.length && <p>Пользователи не найдены.</p>}
      {pagination("page", query.page, data.pages)}
    </section>
    <section aria-labelledby="moderation-title" className="space-y-4">
      <h2 id="moderation-title" className="text-2xl font-semibold">Жалобы на планы ({queue.length})</h2>
      <p className="text-xs text-muted-foreground">Скрытый план пропадает из библиотеки и по прямым ссылкам для всех, кроме владельца. Действия пишутся в аудит.</p>
      <ModerationQueue items={queue} />
    </section>
    <section aria-labelledby="codes-title" className="space-y-4">
      <h2 id="codes-title" className="text-2xl font-semibold">Коды активации ({data.totalCodes})</h2>
      <CreateCodeForm />
      <BulkCodesForm />
      <GrantProForm />
      <form action="/admin" method="get" className="flex items-end gap-3">
        <input type="hidden" name="q" value={query.q} /><input type="hidden" name="page" value={query.page} />
        <label className="grid gap-1 text-sm">Статус<select name="status" defaultValue={query.status} className="rounded-md border border-border bg-background p-2"><option value="all">Все</option><option value="active">Активные</option><option value="redeemed">Использованные</option><option value="revoked">Отозванные</option></select></label><Button type="submit" variant="outline">Фильтр</Button>
      </form>
      <p className="text-xs text-muted-foreground">Только метаданные. Отзыв доступен для активных кодов и не меняет уже активированный тариф. Все даты — UTC.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border">{["ID / срок", "Статус", "Создан / администратор", "Использован / пользователь", "Отозван / администратор", "Действие"].map((t) => <th key={t} className="p-3">{t}</th>)}</tr></thead>
        <tbody>{data.codes.map((c) => <tr key={c.id} className="border-b border-border"><td className="p-3"><p className="font-mono text-xs">{c.id}</p><p>{c.type === "pro_1y" ? "Pro · 1 год" : c.type === "pro_3m" ? "Pro · четверть" : "Pro · 1 месяц"}</p></td><td className="p-3">{statuses[c.status] ?? "Неизвестен"}</td><td className="p-3">{date(c.createdAt)}<p className="font-mono text-xs">{c.createdBy ?? "—"}</p></td><td className="p-3">{date(c.redeemedAt)}<p className="font-mono text-xs">{c.redeemedBy ?? "—"}</p></td><td className="p-3">{date(c.revokedAt)}<p className="font-mono text-xs">{c.revokedBy ?? "—"}</p></td><td className="p-3">{c.status === "active" ? <RevokeCodeButton id={c.id} /> : "—"}</td></tr>)}</tbody>
      </table></div>{!data.codes.length && <p>Коды не найдены.</p>}
      {pagination("codePage", query.codePage, data.codePages)}
    </section>
  </main>;
}
