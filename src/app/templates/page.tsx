import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { listSubjects } from "@/lib/plans-repo";
import { listTemplates } from "@/lib/templates";
import { TemplatesManagerClient } from "@/components/templates/templates-manager-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Шаблоны КСП — Mekty" };

export default async function TemplatesPage() {
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
  if (!user) redirect("/login?next=/templates");

  const [templates, subjects] = await Promise.all([
    listTemplates(user.id).catch(() => []),
    listSubjects(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 md:px-6 md:py-16">
      <header className="border-b border-border pb-6">
        <p className="editorial-kicker">{c.templatesTitle}</p>
        <h1 className="editorial-display mt-3 text-4xl">{c.templatesTitle}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{c.templatesLead}</p>
      </header>
      <TemplatesManagerClient templates={templates} subjects={subjects} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как сохранить шаблон</CardTitle>
          <CardDescription>
            Откройте готовый КСП и нажмите «Сохранить как шаблон». Сохраняются цели, критерии и
            формулировки; тема, задания и домашняя работа остаются пустыми — их заполняете под новый урок.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className="text-sm underline">К моим планам</Link>
        </CardContent>
      </Card>
    </div>
  );
}
