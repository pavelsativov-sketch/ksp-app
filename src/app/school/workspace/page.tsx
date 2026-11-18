import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sysInfo } from "@/lib/school/sys-info";
import { SchoolWorkspace, type OsTab } from "@/components/school/school-workspace";
import { Workspace } from "@/components/workspace/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Рабочая область — Mekty" };

/**
 * Рабочая область ОС:
 * - `?mode=desktop`, `?os=computer-use` или `?app=...` открывают полный
 *   плавающий рабочий стол ОС с окнами, панелью задач и «Работа с компьютером»;
 * - по умолчанию и с `?tab=...` / `?os=files` открывает двухпанельную
 *   рабочую область со вкладками ОС и чатом агента.
 */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; url?: string; os?: string; mode?: string; app?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/school/workspace");

  const sp = await searchParams;
  if (sp.mode === "desktop" || sp.os === "computer-use" || Boolean(sp.app)) {
    return <Workspace initialApp={sp.os ?? sp.app} initialUrl={sp.url} />;
  }

  const rawTab = sp.tab ?? sp.os;
  const initialTab: OsTab =
    !rawTab
      ? "os"
      : rawTab === "files"
        ? "files"
        : rawTab === "terminal"
          ? "terminal"
          : rawTab === "editor"
            ? "editor"
            : rawTab === "log"
              ? "log"
              : rawTab === "os"
                ? "os"
                : "browser";

  return (
    <SchoolWorkspace
      sysInfo={await sysInfo()}
      initialTab={initialTab}
      initialUrl={sp.url}
    />
  );
}
