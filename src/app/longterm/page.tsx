import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { listLongTermPlans, type LongTermPlan } from "@/lib/longterm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";
import type { Dict } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function LongTermListPage() {
  const { t } = await getDict();
  const d = t.longterm;

  if (!isMongoConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="editorial-display text-3xl">{d.noMongoTitle}</CardTitle>
            <CardDescription>{d.noMongoText}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/longterm");

  const plans = await listLongTermPlans(user.id);

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-12 md:px-6 md:py-16">
      <header className="grid gap-5 border-b border-border pb-7 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="editorial-kicker">{d.kicker}</p>
          <h1 className="editorial-display mt-3 text-5xl">{d.title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{d.lead}</p>
        </div>
        <Button asChild>
          <Link href="/longterm/new">
            <Plus /> {d.createNew}
          </Link>
        </Button>
      </header>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-18 text-center space-y-4">
            <p className="text-muted-foreground">{d.empty}</p>
            <Button asChild>
              <Link href="/longterm/new">
                <Plus /> {d.createNew}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <LongTermCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}

function LongTermCard({ plan }: { plan: LongTermPlan }) {
  const totalHours = plan.sections.reduce(
    (sum, s) => sum + s.topics.reduce((tsum, t) => tsum + t.hours, 0),
    0,
  );
  const totalTopics = plan.sections.reduce((sum, s) => sum + s.topics.length, 0);

  return (
    <Link
      href={`/longterm/${plan.id}`}
      className="group flex min-h-[12rem] flex-col rounded-3xl border border-border bg-surface p-6 transition-[box-shadow,border-color] hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-cyan-foreground">
          {plan.subject}
        </p>
        <span className="font-mono text-xs text-muted-foreground">
          {plan.grade} кл. · {plan.year}
        </span>
      </div>
      <h2 className="mt-4 text-xl font-bold leading-6 tracking-[-0.025em] group-hover:text-primary">
        {plan.subject} — {plan.grade} класс
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {totalTopics} {totalTopics === 1 ? "тема" : totalTopics < 5 ? "темы" : "тем"} · {totalHours} ч.
      </p>
      <div className="mt-auto flex items-end justify-between border-t border-border pt-4">
        <div className="text-xs text-muted-foreground">
          <p>{plan.sections.length} {plan.sections.length === 1 ? "раздел" : "разделов"}</p>
        </div>
      </div>
    </Link>
  );
}
