import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sysInfo } from "@/lib/school/sys-info";
import { SchoolWorkspace, type OsTab } from "@/components/school/school-workspace";

export const dynamic = "force-dynamic";

export default async function SchoolWorkspacePage({ searchParams }: { searchParams: Promise<{ os?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/school");

  const sp = await searchParams;
  const initialTab: OsTab = sp.os === "files" ? "files" : sp.os === "browser" ? "browser" : sp.os === "terminal" ? "terminal" : "os";

  return <SchoolWorkspace sysInfo={await sysInfo()} initialTab={initialTab} />;
}
