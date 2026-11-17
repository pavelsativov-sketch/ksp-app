import type { Metadata } from "next";
import Link from "next/link";
import { listAdminUsers, type AdminUserList } from "@/lib/admin/users";
import type { AdminSearchParams } from "@/lib/admin/queries";
import { adminPageError } from "@/lib/admin/page-guard";
import { Button } from "@/components/ui/button";
import s from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Пользователи — Mekty", robots: { index: false, follow: false } };

const date = (value: string | null) => value ? new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" }) : "—";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  let data: AdminUserList;
  try {
    data = await listAdminUsers(await searchParams);
  } catch (error) {
    const message = adminPageError(error, "/admin/users");
    return <main className="mx-auto max-w-3xl px-4 py-16"><h1 className="text-3xl">Пользователи</h1>
      <p role="alert" className="mt-4">{message}</p>
      <Link href="/admin/users" prefetch={false} className="mt-4 inline-block underline">Повторить</Link></main>;
  }
  const href = (page: number) => `/admin/users?${new URLSearchParams({ q: data.q, page: String(page) })}`;
  return <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-12 md:px-6">
    <header><p className="editorial-kicker"><Link prefetch={false} href="/admin" className="underline">Администрирование</Link></p>
      <h1 className="editorial-display mt-3 text-4xl">Пользователи</h1>
      <p className="mt-3 text-sm text-muted-foreground">Найдено: {data.total.toLocaleString("ru-RU")}. Расход и лимит — КСП в текущем месяце UTC, с учётом бонусов.</p></header>
    <form action="/admin/users" method="get" role="search" className={s.form}>
      <label className={s.field}>Поиск по имени, email или ID
        <input name="q" defaultValue={data.q} maxLength={100} className={`${s.input} w-80 max-w-full`} />
      </label>
      <Button type="submit">Найти</Button>
      <Link prefetch={false} href="/admin/users" className="text-sm underline">Сбросить</Link>
    </form>
    <div className={`${s.panel} ${s.tableWrap}`}>
      <table className={s.table}>
        <thead><tr>{["Пользователь", "Регистрация", "Тариф", "КСП / лимит", "Планов", "Активность"].map((t) => <th key={t}>{t}</th>)}</tr></thead>
        <tbody>{data.users.map((u) => <tr key={u.id}>
          <td><Link prefetch={false} href={`/admin/users/${u.id}`} className={s.link}>{u.name || "Без имени"}</Link><p>{u.email}</p></td>
          <td>{date(u.createdAt)}</td>
          <td><span className={u.plan === "pro" ? `${s.pill} ${s.pillPro}` : s.pill}>{u.plan === "pro" ? "Pro" : "Free"}</span>
            {u.plan === "pro" && <p className={s.small}>{u.expiresAt ? `до ${date(u.expiresAt)}` : "бессрочно"}</p>}</td>
          <td className="tabular-nums">{u.generationsUsed} / {u.generationsLimit ?? "∞"}</td>
          <td className="tabular-nums">{u.plansCount}</td>
          <td>{date(u.lastActivity)}</td>
        </tr>)}</tbody>
      </table>
      {!data.users.length && <p className={s.muted}>Пользователи не найдены.</p>}
    </div>
    <nav aria-label="Страницы пользователей" className="flex items-center gap-4 text-sm">
      {data.page > 1 && <Link prefetch={false} href={href(data.page - 1)} className="underline">Назад</Link>}
      <span>Страница {data.page} из {data.pages}</span>
      {data.page < data.pages && <Link prefetch={false} href={href(data.page + 1)} className="underline">Далее</Link>}
    </nav>
  </main>;
}
