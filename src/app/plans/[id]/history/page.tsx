import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPlanHistory } from "@/lib/plan-versions";
import { PlanHistory } from "@/components/ksp/plan-history";

export const dynamic = "force-dynamic";

export default async function PlanHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/plans/${id}/history`);

  let history;
  try {
    history = await getPlanHistory(id, user.id);
  } catch {
    return <div className="mx-auto max-w-[1200px] px-4 py-12"><h1 className="text-2xl">История изменений</h1><p role="alert" className="my-4">Не удалось загрузить историю. Попробуйте обновить страницу позже.</p><Link href={`/plans/${id}`}>Вернуться к плану</Link></div>;
  }
  if (!history) notFound();

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-12 md:px-6 md:py-16">
      <header className="border-b border-[#ddd5cb] pb-7">
        <p className="editorial-kicker">История изменений</p>
        <h1 className="editorial-display mt-3 text-5xl">{history.current.title}</h1>
        <p className="mt-3 text-sm text-[#5f5751]">
          Последние 30 снимков плана. Восстановленная версия не меняет видимость плана.
        </p>
        <p className="mt-1 text-xs text-[#745329]">Время снимков отображается в часовом поясе устройства.</p>
        <p className="mt-3">
          <Link href={`/plans/${history.current.id}`} className="text-sm underline underline-offset-4">
            ← Вернуться к плану
          </Link>
        </p>
      </header>
      <PlanHistory
        planId={history.current.id}
        currentUpdatedAt={history.current.updated_at}
        currentPlan={history.current}
        versions={history.versions}
      />
    </div>
  );
}
