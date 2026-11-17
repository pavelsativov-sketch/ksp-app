import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getDict } from "@/lib/i18n/server";
import { VskSpravkaClient } from "@/components/school/vsk-spravka-client";

export const dynamic = "force-dynamic";

/** ВШК: Конструктор официальных аналитических справок по итогам контроля. */
export default async function VskPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/school/vsk");

  const [{ locale }, school] = await Promise.all([
    getDict(),
    getActiveSchool(user.id).catch(() => null),
  ]);
  const isKk = locale === "kk";

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <header>
        <p className="editorial-kicker text-rose-400">
          {isKk ? "Мектепішілік бақылау (МІБ)" : "Внутришкольный контроль"}
        </p>
        <h1 className="editorial-display mt-1 text-3xl font-bold">
          {isKk ? "МІБ аналитикалық анықтамалары" : "Справки ВШК"}
        </h1>
        {school && (
          <p className="mt-2 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground/80">
          {isKk
            ? "МІБ бағыттары бойынша (сабаққа қатысу, ҚМЖ тексеру, дәптер жүргізу, сыныптардың бейімделуі) ресми аналитикалық анықтамаларды Word форматымен жылдам дайындау."
            : "Быстрое составление официальных аналитических справок по направлениям ВШК (посещение уроков, проверка КСП, ведение тетрадей, адаптация классов) с выгрузкой в Word (.docx)."}
        </p>
      </header>

      <VskSpravkaClient locale={locale} />
    </main>
  );
}
