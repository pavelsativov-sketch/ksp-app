import os from "node:os";
import { promises as fs } from "node:fs";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SchoolWorkspace, type OsTab } from "@/components/school/school-workspace";

export const dynamic = "force-dynamic";

/** Реальные характеристики машины для статус-бара рабочей области. */
async function sysInfo(): Promise<string> {
  const platform = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  const cpus = os.cpus().length;
  const ram = Math.max(1, Math.round(os.totalmem() / 1024 ** 3));
  let disk = "";
  try {
    const statfs = fs.statfs as unknown as ((p: string) => Promise<{ blocks: number; bsize: number }>) | undefined;
    if (typeof statfs === "function") {
      const st = await statfs(".").catch(() => undefined);
      if (st?.blocks && st?.bsize) disk = ` · ${Math.round((st.blocks * st.bsize) / 1024 ** 3)} GB SSD`;
    }
  } catch { /* опционально */ }
  return `${platform} · ${cpus} vCPU · ${ram} GB RAM${disk}`;
}

export default async function SchoolWorkspacePage({ searchParams }: { searchParams: Promise<{ os?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/school");

  const sp = await searchParams;
  const initialTab: OsTab = sp.os === "files" ? "files" : sp.os === "browser" ? "browser" : sp.os === "terminal" ? "terminal" : "os";

  return <SchoolWorkspace sysInfo={await sysInfo()} initialTab={initialTab} />;
}
