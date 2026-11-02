import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sysInfo } from "@/lib/school/sys-info";
import { SchoolStatusBar } from "@/components/school/school-status-bar";

export const dynamic = "force-dynamic";

/**
 * Оболочка рабочей области: своя шапка с крошками, левый рельс и статус-бар.
 * Маркетинговый хедер сайта на /school не рендерится (MarketingChrome).
 */
export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/school");
  }
  const info = await sysInfo();

  // Шапка и меню общие с кабинетом (AppShell); внизу остаётся только статус рабочей области.
  return (
    <div className="flex h-[calc(100dvh-76px)] min-h-0 flex-col overflow-hidden rounded-tl-2xl">
      <div className="min-h-0 flex-1 overflow-y-auto bg-background text-foreground">{children}</div>
      <SchoolStatusBar sysInfo={info} />
    </div>
  );
}
