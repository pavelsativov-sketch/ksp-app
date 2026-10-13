import { redirect } from "next/navigation";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { getCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { listNotifications } from "@/lib/notifications";
import { notificationCopy } from "@/lib/notification-copy";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");
  const { locale } = await getDict();
  const data = await listNotifications(user.id);
  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
    <header className="space-y-2 border-b border-border pb-5">
      <p className="editorial-kicker">{notificationCopy[locale].unreadCount(data.unreadCount)}</p>
      <h1 className="editorial-display break-words text-4xl sm:text-5xl">{notificationCopy[locale].title}</h1>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{notificationCopy[locale].lead}</p>
    </header>
    <NotificationCenter initialNotifications={data.notifications} initialUnreadCount={data.unreadCount} locale={locale} />
  </div>;
}
