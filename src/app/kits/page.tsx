import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { listKits } from "@/lib/kits";
import { listSubjects } from "@/lib/plans-repo";
import { classNameMap } from "@/lib/classes";
import { KitList } from "@/components/kits/kit-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Комплекты материалов — Mekty" };

export default async function KitsPage() {
  const { t } = await getDict();
  const c = t.nav;
  if (!isMongoConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card><CardHeader><CardTitle className="editorial-display text-3xl">{t.dashboard.noMongoTitle}</CardTitle></CardHeader></Card>
      </div>
    );
  }
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/kits");

  const [kits, subjects, classNames] = await Promise.all([
    listKits(user.id).catch(() => []),
    listSubjects(),
    classNameMap(user.id).catch(() => ({})),
  ]);
  const subjectNames: Record<string, string> = Object.fromEntries(
    subjects
      .filter((s) => typeof s.name_ru === "string" && s.name_ru !== "")
      .map((s) => [s.id, s.name_ru]),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 md:px-6 md:py-16">
      <header className="border-b border-border pb-6">
        <p className="editorial-kicker">{c.kitsTitle}</p>
        <h1 className="editorial-display mt-3 text-4xl">{c.kitsTitle}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{c.kitsLead}</p>
      </header>

      <KitList kits={kits} subjectNames={subjectNames} className={classNames} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как сохранить комплект</CardTitle>
          <CardDescription>
            Создайте рабочий лист, памятки или кроссворд из урока и нажмите «Сохранить комплект»
            в предпросмотре. Дальше комплект можно скачать одним Word-файлом и использовать
            в следующем году — без повторной генерации и без траты AI-квоты.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="text-sm underline">К моим планам</Link>
          <Link href="/templates" className="text-sm underline">Шаблоны КСП</Link>
        </CardContent>
      </Card>
    </div>
  );
}
