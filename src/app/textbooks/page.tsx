import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listSubjects } from "@/lib/plans-repo";
import { TextbooksManager } from "@/components/ksp/textbooks-manager";

export const dynamic = "force-dynamic";

export default async function TextbooksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/textbooks");
  const subjects = await listSubjects();
  return <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-12 md:px-6 md:py-16"><header className="border-b border-[#ddd5cb] pb-7"><p className="editorial-kicker">Контекст для плана</p><h1 className="editorial-display mt-3 text-5xl">Учебники и материалы</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f5751]">Загрузите PDF учебника, чтобы при создании КСП учитывать содержание и терминологию выбранного источника.</p></header><TextbooksManager subjects={subjects} /></div>;
}
