import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { NoSchool } from "@/components/school/no-school";
import { VskSpravkaClient } from "@/components/school/vsk-spravka-client";

export const dynamic = "force-dynamic";

/** ВШК: Конструктор официальных аналитических справок по итогам контроля. */
export default async function VskPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <header>
        <p className="editorial-kicker text-rose-400">Внутришкольный контроль</p>
        <h1 className="editorial-display mt-1 text-3xl font-bold">Справки ВШК</h1>
        <p className="mt-2 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
        <p className="mt-1 text-xs text-muted-foreground/80">
          Быстрое составление официальных аналитических справок по направлениям ВШК (посещение уроков, проверка КСП, ведение тетрадей, адаптация классов) без ручной бумажной рутины.
        </p>
      </header>

      <VskSpravkaClient />
    </main>
  );
}
