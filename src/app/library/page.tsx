import { getDb, isMongoConfigured } from "@/lib/mongo";
import { listSubjects } from "@/lib/plans-repo";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LibraryResults } from "@/components/ksp/library-results";
import { parseLibraryQuery, type LibrarySearchParams } from "@/lib/library-query";
import { listLibraryPlans } from "@/lib/library-repo";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<LibrarySearchParams> }) {
  const { t } = await getDict();
  const l = t.library;
  if (!isMongoConfigured()) return <div className="mx-auto max-w-3xl px-4 py-16"><Card><CardHeader><CardTitle className="editorial-display text-3xl">{l.noMongoTitle}</CardTitle><CardDescription>{l.noMongoText}</CardDescription></CardHeader></Card></div>;
  const query = parseLibraryQuery(await searchParams);
  const [db, subjects] = await Promise.all([getDb(), listSubjects()]);
  const result = await listLibraryPlans(db, query, subjects);
  return <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-12 md:px-6 md:py-16"><header className="border-b border-border pb-7"><p className="editorial-kicker">{l.kicker}</p><h1 className="editorial-display mt-3 text-5xl">{l.title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{l.lead}</p></header><LibraryResults query={query} subjects={subjects} {...result} /></div>;
}
