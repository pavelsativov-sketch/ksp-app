import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Workspace } from "@/components/workspace/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Рабочая область — Mekty" };

/**
 * Страница рабочей области.
 *
 * Раньше пункт меню «Рабочая область» в сайдбаре школы вёл на
 * /school/workspace, но самого роута в проекте не было — страница отдавала
 * 404, а компоненты окон (desktop / taskbar / window) остались неиспользуемыми.
 */
export default async function WorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/school/workspace");

  return <Workspace />;
}