import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sysInfo } from "@/lib/school/sys-info";
import { SchoolRail } from "@/components/school/school-rail";
import { SchoolStatusBar } from "@/components/school/school-status-bar";
import { SchoolTopbar } from "@/components/school/school-topbar";

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

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#080a10]">
      <SchoolTopbar userName={user.fullName ?? ""} userEmail={user.email} />
      <div className="flex min-h-0 flex-1">
        <SchoolRail />
        {/* Контентная часть остаётся в теме приложения: внутри /school живут
            и тёмная рабочая область, и светлые страницы аналитики. */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-background text-foreground">{children}</div>
      </div>
      <SchoolStatusBar sysInfo={info} />
    </div>
  );
}
