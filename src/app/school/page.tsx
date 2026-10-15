import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sysInfo } from "@/lib/school/sys-info";
import { SchoolWorkspace, type OsTab } from "@/components/school/school-workspace";

export const dynamic = "force-dynamic";

export default async function SchoolWorkspacePage({ searchParams }: { searchParams: Promise<{ os?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/school");

  const sp = await searchParams;
  // Deep-link на конкретную вкладку ОС: с коннекторов (?os=browser) и
  // радиокнопок задач. Все значения OsTab, кроме computer-use, который
  // открывается как окно поверх рабочего стола.
  const TAB_BY_PARAM: Partial<Record<string, OsTab>> = {
    files: "files",
    browser: "browser",
    terminal: "terminal",
    editor: "editor",
    log: "log",
  };
  const initialTab: OsTab = TAB_BY_PARAM[sp.os ?? ""] ?? "os";
  const openComputerUse = sp.os === "computer-use";

  return <SchoolWorkspace sysInfo={await sysInfo()} initialTab={initialTab} openComputerUse={openComputerUse} />;
}

