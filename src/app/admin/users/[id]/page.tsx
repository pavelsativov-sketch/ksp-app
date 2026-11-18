import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUserDetail, type AdminUserDetail } from "@/lib/admin/users";
import { adminPageError } from "@/lib/admin/page-guard";
import { BonusForm, SubscriptionForm } from "@/components/admin/user-actions";
import s from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Пользователь — Mekty", robots: { index: false, follow: false } };

const date = (value: string | null) => value ? new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" }) : "—";
const ACTIONS: Record<string, string> = {
  grant_tokens: "Бонус КСП",
  set_subscription: "Подписка",
  grant_pro: "Выдача Pro",
  password_reset_link: "Ссылка сброса пароля",
};

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return <div className={s.card}>
    <p className={s.cardLabel}>{label}</p>
    <p className={s.cardValue}>{used} <span className="text-base font-semibold text-muted-foreground">/ {limit ?? "∞"}</span></p>
    {limit !== null && <div className={s.meter}><span style={{ width: `${Math.min(100, limit ? (used / limit) * 100 : 100)}%` }} /></div>}
  </div>;
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user: AdminUserDetail;
  try {
    user = await getAdminUserDetail(id);
  } catch (error) {
    const message = adminPageError(error, `/admin/users/${encodeURIComponent(id)}`);
    return <main className="mx-auto max-w-3xl px-4 py-16"><h1 className="text-3xl">Пользователь</h1>
      <p role="alert" className="mt-4">{message}</p>
      <Link href="/admin/users" prefetch={false} className="mt-4 inline-block underline">К списку</Link></main>;
  }
  return <main className="mx-auto max-w-[1200px] space-y-6 px-4 py-10 md:px-6">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
        <Link prefetch={false} href="/admin?tab=users" className="rounded-lg border border-border bg-surface px-3 py-1.5 hover:bg-muted">← В Админ-панель (Пользователи)</Link>
        <Link prefetch={false} href="/admin" className="text-muted-foreground underline hover:text-foreground">Дашборд</Link>
      </div>
      <h1 className="editorial-display mt-2 text-3xl sm:text-4xl">{user.name || "Без имени"}</h1>
      <p className="text-sm text-muted-foreground">{user.email} · ID <span className="tabular-nums">{user.id}</span> · регистрация {date(user.createdAt)}</p>
    </header>

    <section aria-label="Расход в текущем месяце" className={s.cards}>
      <div className={s.card}><p className={s.cardLabel}>Тариф</p><p className={s.cardValue}>{user.plan === "pro" ? "Pro" : "Free"}</p>
        <p className={s.cardHint}>{user.plan === "pro" ? (user.expiresAt ? `до ${date(user.expiresAt)}` : "бессрочно") : user.storedPlan === "pro" ? `истёк ${date(user.expiresAt)}` : "без подписки"}</p></div>
      <Usage label="КСП в месяце" used={user.usage.generations.used} limit={user.usage.generations.limit} />
      <Usage label="AI-операции" used={user.usage.assist.used} limit={user.usage.assist.limit} />
      <Usage label="Изображения" used={user.usage.images.used} limit={user.usage.images.limit} />
      <div className={s.card}><p className={s.cardLabel}>Бонус КСП</p><p className={s.cardValue}>+{user.bonusPermanent + user.bonusThisMonth}</p>
        <p className={s.cardHint}>ежемесячно {user.bonusPermanent}, в этом месяце {user.bonusThisMonth}</p></div>
      <div className={s.card}><p className={s.cardLabel}>Планов всего</p><p className={s.cardValue}>{user.plansCount}</p></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className={s.panel}><h2 className={s.panelTitle}>Выдать КСП</h2>
        <p className={s.muted}>Бонус прибавляется к месячному лимиту КСП. На Pro лимита нет — бонус начнёт действовать после окончания подписки.</p>
        <BonusForm userId={user.id} email={user.email} /></div>
      <div className={s.panel}><h2 className={s.panelTitle}>Подписка</h2>
        <p className={s.muted}>Продление считается от текущего окончания Pro, как при активации кода. Все изменения пишутся в журнал.</p>
        <SubscriptionForm userId={user.id} email={user.email} isPro={user.plan === "pro"} /></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className={`${s.panel} ${s.tableWrap}`}><h2 className={s.panelTitle}>Последние планы</h2>
        <table className={s.table}><thead><tr><th>Название</th><th>Изменён (UTC)</th></tr></thead>
          <tbody>{user.recentPlans.map((p) => <tr key={p.id}><td>{p.title}</td><td>{date(p.updatedAt)}</td></tr>)}</tbody></table>
        {!user.recentPlans.length && <p className={s.muted}>Планов нет.</p>}</div>
      <div className={`${s.panel} ${s.tableWrap}`}><h2 className={s.panelTitle}>Последние AI-события</h2>
        <table className={s.table}><thead><tr><th>Задача</th><th>Тип</th><th>Итог</th><th>Время (UTC)</th></tr></thead>
          <tbody>{user.recentEvents.map((e) => <tr key={e.id}><td>{e.task}</td><td>{e.kind}</td><td>{e.ok ? "успех" : "сбой"}</td><td>{date(e.at)}</td></tr>)}</tbody></table>
        {!user.recentEvents.length && <p className={s.muted}>Событий за 90 дней нет.</p>}</div>
    </section>

    <section className={`${s.panel} ${s.tableWrap}`}><h2 className={s.panelTitle}>Журнал действий администратора</h2>
      <table className={s.table}><thead><tr><th>Время (UTC)</th><th>Действие</th><th>Администратор</th><th>Данные</th></tr></thead>
        <tbody>{user.actions.map((a) => <tr key={a.id}><td>{date(a.at)}</td><td>{ACTIONS[a.action] ?? a.action}</td><td className={s.small}>{a.adminId}</td><td className={`${s.small} break-all`}>{a.payload}</td></tr>)}</tbody></table>
      {!user.actions.length && <p className={s.muted}>Действий пока не было.</p>}
    </section>
  </main>;
}
