import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sysInfo } from "@/lib/school/sys-info";
import { SchoolWorkspace, type OsTab } from "@/components/school/school-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Рабочая область — Mekty" };

/**
 * Рабочая область — настоящий Playwright-браузер, терминал, файловый менеджер.
 *
 * Поддерживает deep-link из коннекторов:
 *   /school/workspace?tab=browser&url=https://www.bilimclass.kz/login
 */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; url?: string; os?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/school/workspace");

  const sp = await searchParams;
  const tabParam = sp.tab ?? sp.os ?? "browser";
  const initialTab: OsTab =
    tabParam === "files"
      ? "files"
      : tabParam === "terminal"
        ? "terminal"
        : tabParam === "editor"
          ? "editor"
          : tabParam === "os"
            ? "os"
            : "browser"; // default → браузер

  return (
    <SchoolWorkspace
      sysInfo={await sysInfo()}
      initialTab={initialTab}
      initialUrl={sp.url}
    />
  );
}