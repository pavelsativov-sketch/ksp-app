"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { AppNotificationView } from "@/lib/notification-types";
import { notificationCopy } from "@/lib/notification-copy";
import { TimeAgo } from "@/components/ksp/time-ago";

export function NotificationCenter({
  initialNotifications,
  initialUnreadCount,
  locale,
}: {
  initialNotifications: AppNotificationView[];
  initialUnreadCount: number;
  locale: Locale;
}) {
  const router = useRouter();
  const copy = notificationCopy[locale];
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function markRead(ids?: string[]): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : { all: true }),
      });
      if (!response.ok) throw new Error("notification update failed");
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => !ids || ids.includes(item.id)
        ? { ...item, read_at: item.read_at ?? readAt }
        : item));
      setUnreadCount((count) => Math.max(0, count - (ids
        ? notifications.filter((item) => ids.includes(item.id) && !item.read_at).length
        : count)));
      return true;
    } catch {
      setError(copy.error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openUnread(event: MouseEvent<HTMLAnchorElement>, item: AppNotificationView) {
    if (item.read_at) return;
    event.preventDefault();
    void (async () => {
      await markRead([item.id]);
      router.push(item.href);
    })();
  }

  return <section aria-labelledby="notifications-list-title" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="notifications-list-title" className="sr-only">{copy.title}</h2>
      <p className="text-sm text-muted-foreground" aria-live="polite">{copy.unreadCount(unreadCount)}</p>
      <Button type="button" variant="outline" className="min-h-11" disabled={busy || unreadCount === 0} onClick={() => void markRead()}>
        <CheckCheck aria-hidden="true" /> {copy.markAllRead}
      </Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notifications.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      <Bell className="mx-auto mb-3 size-6" aria-hidden="true" />{copy.empty}
    </div> : <ul className="space-y-2">
      {notifications.map((item) => <li key={item.id}>
        <Link
          href={item.href}
          onClick={(event) => openUnread(event, item)}
          className={`block min-h-16 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${item.read_at ? "border-border bg-surface" : "border-primary/40 bg-primary/5"}`}
        >
          <span className="flex items-start gap-3">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read_at ? "bg-muted-foreground/30" : "bg-primary"}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block break-words font-semibold">{copy.kinds[item.kind]}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {copy.createdAt}: <TimeAgo iso={item.created_at} locale={locale} />
              </span>
            </span>
            <span className="sr-only">{item.read_at ? "" : (locale === "kk" ? "Оқылмаған" : "Непрочитано")}</span>
          </span>
        </Link>
      </li>)}
    </ul>}
  </section>;
}
