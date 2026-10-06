import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminError, requireAdmin } from "@/lib/admin/auth";
import { getAnalyticsSummary, getUsageOverTime, getErrorRates, getEngagementMetrics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Аналитика — Mekty", robots: { index: false, follow: false } };

const DAYS = 30;

export default async function AdminAnalyticsPage() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminError && error.status === 401) redirect("/login?next=/admin/analytics");
    if (error instanceof AdminError && error.status === 403) notFound();
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl">Аналитика</h1>
        <p role="alert" className="mt-4">
          {error instanceof AdminError ? error.message : "Данные временно недоступны."}
        </p>
        <Link href="/admin" className="mt-4 inline-block underline">← К администрированию</Link>
      </main>
    );
  }

  const [summary, usageOverTime, errorRates, engagement] = await Promise.all([
    getAnalyticsSummary(DAYS),
    getUsageOverTime(DAYS),
    getErrorRates(DAYS),
    getEngagementMetrics(DAYS),
  ]);

  const maxUsage = Math.max(
    1,
    ...usageOverTime.map((d) => d.pageViews + d.planCreations + d.aiGenerations),
  );

  return (
    <main className="mx-auto max-w-[1400px] space-y-10 px-4 py-12 md:px-6">
      <header>
        <p className="editorial-kicker">Mekty</p>
        <h1 className="editorial-display mt-3 text-4xl">Аналитика</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Использование приложения за последние {DAYS} дней.
        </p>
      </header>

      {/* Summary Cards */}
      <section aria-labelledby="summary-title" className="space-y-4">
        <h2 id="summary-title" className="text-2xl font-semibold">Обзор</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Всего событий", value: summary.totalEvents, color: "text-blue-600" },
            { label: "Просмотры страниц", value: summary.pageViews, color: "text-green-600" },
            { label: "Создано планов", value: summary.planCreations, color: "text-purple-600" },
            { label: "AI-генерации", value: summary.aiGenerations, color: "text-orange-600" },
            { label: "Экспорты", value: summary.exports, color: "text-teal-600" },
            { label: "Ошибки", value: summary.errors, color: "text-red-600" },
            { label: "Среднее событий/пользователь", value: engagement.avgEventsPerUser, color: "text-indigo-600" },
            { label: "Возвращающиеся пользователи", value: engagement.returningUsers, color: "text-pink-600" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${card.color}`}>
                {Number(card.value).toLocaleString("ru-RU")}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Usage Over Time Chart */}
      <section aria-labelledby="usage-title" className="space-y-4">
        <h2 id="usage-title" className="text-2xl font-semibold">Использование по дням</h2>
        <div className="rounded-xl border border-border p-4">
          <div className="flex h-48 items-end gap-1">
            {usageOverTime.map((day) => {
              const total = day.pageViews + day.planCreations + day.aiGenerations;
              const height = Math.max(4, (total / maxUsage) * 100);
              return (
                <div
                  key={day._id}
                  className="group relative flex-1"
                  title={`${day._id}: ${total} событий`}
                >
                  <div
                    className="w-full rounded-t bg-primary/80 transition-all group-hover:bg-primary"
                    style={{ height: `${height}%` }}
                  />
                  <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-background px-2 py-1 text-xs opacity-0 shadow transition-opacity group-hover:opacity-100">
                    {day._id}: {total}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{usageOverTime[0]?._id ?? "—"}</span>
            <span>{usageOverTime[usageOverTime.length - 1]?._id ?? "—"}</span>
          </div>
        </div>
      </section>

      {/* Top Pages */}
      <section aria-labelledby="pages-title" className="space-y-4">
        <h2 id="pages-title" className="text-2xl font-semibold">Популярные страницы</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3">Страница</th>
                <th className="p-3">Просмотры</th>
                <th className="p-3">% от общего</th>
              </tr>
            </thead>
            <tbody>
              {summary.topPages.map((page) => (
                <tr key={page._id} className="border-b border-border">
                  <td className="p-3 font-mono text-xs">{page._id}</td>
                  <td className="p-3">{page.count.toLocaleString("ru-RU")}</td>
                  <td className="p-3">
                    {summary.pageViews > 0
                      ? ((page.count / summary.pageViews) * 100).toFixed(1)
                      : "0.0"}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top Events */}
      <section aria-labelledby="events-title" className="space-y-4">
        <h2 id="events-title" className="text-2xl font-semibold">Популярные события</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3">Событие</th>
                <th className="p-3">Количество</th>
                <th className="p-3">% от общего</th>
              </tr>
            </thead>
            <tbody>
              {summary.topEvents.map((event) => (
                <tr key={event._id} className="border-b border-border">
                  <td className="p-3 font-mono text-xs">{event._id}</td>
                  <td className="p-3">{event.count.toLocaleString("ru-RU")}</td>
                  <td className="p-3">
                    {summary.totalEvents > 0
                      ? ((event.count / summary.totalEvents) * 100).toFixed(1)
                      : "0.0"}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Error Rates */}
      <section aria-labelledby="errors-title" className="space-y-4">
        <h2 id="errors-title" className="text-2xl font-semibold">Уровень ошибок</h2>
        <div className="rounded-xl border border-border p-4">
          <div className="flex h-32 items-end gap-1">
            {errorRates.map((day) => {
              const height = Math.max(4, Math.min(100, day.errorRate));
              return (
                <div
                  key={day._id}
                  className="group relative flex-1"
                  title={`${day._id}: ${day.errorRate.toFixed(1)}% ошибок`}
                >
                  <div
                    className="w-full rounded-t bg-red-500/80 transition-all group-hover:bg-red-500"
                    style={{ height: `${height}%` }}
                  />
                  <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-background px-2 py-1 text-xs opacity-0 shadow transition-opacity group-hover:opacity-100">
                    {day._id}: {day.errorRate.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{errorRates[0]?._id ?? "—"}</span>
            <span>{errorRates[errorRates.length - 1]?._id ?? "—"}</span>
          </div>
        </div>
      </section>

      {/* Engagement Metrics */}
      <section aria-labelledby="engagement-title" className="space-y-4">
        <h2 id="engagement-title" className="text-2xl font-semibold">Вовлечённость</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Среднее событий на пользователя</p>
            <p className="mt-2 text-2xl font-semibold">{engagement.avgEventsPerUser}</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Средняя длительность сессии</p>
            <p className="mt-2 text-2xl font-semibold">
              {Math.round(engagement.avgSessionDurationMs / 1000)}с
            </p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Возвращающиеся пользователи</p>
            <p className="mt-2 text-2xl font-semibold">{engagement.returningUsers}</p>
          </div>
        </div>
      </section>

      {/* Export */}
      <section aria-labelledby="export-title" className="space-y-4">
        <h2 id="export-title" className="text-2xl font-semibold">Экспорт данных</h2>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <a href={`/api/analytics?days=${DAYS}`} download="analytics.json">
              Скачать JSON
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin">← К администрированию</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
