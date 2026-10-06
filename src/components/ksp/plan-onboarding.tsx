"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { fill } from "@/lib/i18n/dictionaries";
import { exampleHref, type PlanExample } from "@/lib/plan-examples";

/**
 * Блок онбординга конструктора.
 *
 * Клиентский компонент: читает словарь через `useUiLocale`, поэтому при смене
 * языка подписи перерисовываются мгновенно, без перезагрузки страницы.
 */
export function PlanOnboarding({ examples, dashboard = false, selectedKey }: { examples: PlanExample[]; dashboard?: boolean; selectedKey?: string }) {
  const { t } = useUiLocale();
  const ob = t.planEditor.onboarding;
  return <section aria-labelledby="onboarding-title" className="rounded-3xl border border-border bg-surface p-6 md:p-8">
    <h2 id="onboarding-title" className="editorial-display text-3xl">{dashboard ? ob.titleDash : ob.title}</h2>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{examples.length ? ob.textExamples : ob.textNoExamples}</p>
    <p className="mt-2 text-sm text-muted-foreground">{ob.noAi}</p>
    <div className="mt-5 flex flex-wrap gap-3">{examples.map((example) => <Button key={example.key} asChild variant={selectedKey === example.key ? "secondary" : "outline"}><Link href={exampleHref(example)} aria-current={selectedKey === example.key ? "true" : undefined}>{fill(ob.exampleLink, { subject: example.subjectName, grade: example.plan.grade })}</Link></Button>)}</div>
    {selectedKey && <p role="status" className="mt-4 text-sm">{ob.opened}</p>}
    <div className="mt-5"><Button asChild variant={dashboard ? "default" : "ghost"}><Link href="/plans/new">{dashboard ? ob.createManuallyDash : ob.createManually}</Link></Button></div>
  </section>;
}