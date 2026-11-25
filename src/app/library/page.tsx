import type { Metadata } from "next";
import Link from "next/link";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { listSubjects } from "@/lib/plans-repo";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LibraryResults } from "@/components/ksp/library-results";
import { parseLibraryQuery, type LibrarySearchParams } from "@/lib/library-query";
import { listLibraryPlans } from "@/lib/library-repo";
import { getDict } from "@/lib/i18n/server";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

const LIBRARY_TITLE = `Библиотека КСП — ${SITE_NAME}`;
const LIBRARY_DESCRIPTION = "Публичные КСП учителей Казахстана: возьмите идею, посмотрите структуру урока или начните свой вариант.";

export const metadata: Metadata = {
  title: LIBRARY_TITLE,
  description: LIBRARY_DESCRIPTION,
  alternates: { canonical: "/library" },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "ru_RU", url: "/library", title: LIBRARY_TITLE, description: LIBRARY_DESCRIPTION },
};

export default async function LibraryPage({ searchParams }: { searchParams: Promise<LibrarySearchParams> }) {
  const { t } = await getDict();
  const l = t.library;
  if (!isMongoConfigured()) return <div className="mx-auto max-w-3xl px-4 py-16"><Card><CardHeader><CardTitle className="editorial-display text-3xl">{l.noMongoTitle}</CardTitle><CardDescription>{l.noMongoText}</CardDescription></CardHeader></Card></div>;
  const query = parseLibraryQuery(await searchParams);
  const [db, subjects] = await Promise.all([getDb(), listSubjects()]);
  const result = await listLibraryPlans(db, query, subjects);
  return <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-12 md:px-6 md:py-16">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-7">
      <div><p className="editorial-kicker">{l.kicker}</p><h1 className="editorial-display mt-3 text-5xl">{l.title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{l.lead}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild><Link href="/textbooks">{t.nav.materials}</Link></Button>
        <Button variant="outline" size="sm" asChild><Link href="/kits">{t.nav.kits}</Link></Button>
        <Button variant="outline" size="sm" asChild><Link href="/templates">{t.nav.templates}</Link></Button>
      </div>
    </header>
    <LibraryResults query={query} subjects={subjects} {...result} />
  </div>;
}
