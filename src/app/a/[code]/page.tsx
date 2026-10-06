import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicAssignment } from "@/lib/assignments";
import { HomeworkRunner } from "@/components/assignments/homework-runner";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// Дедупликация: generateMetadata и страница зовут один запрос вместо двух.
const getAssignment = cache((code: string) => getPublicAssignment(code).catch(() => null));

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const assignment = await getAssignment(code);
  return { title: assignment ? `${assignment.title} — домашнее задание` : "Домашнее задание" };
}

export default async function AssignmentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const assignment = await getAssignment(code);
  if (!assignment) notFound();
  const { t } = await getDict();
  if (assignment.closed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="editorial-kicker">{t.runner.kicker}</p>
        <h1 className="editorial-display mt-3 text-3xl">{assignment.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t.runner.closedMsg}</p>
      </div>
    );
  }
  return <HomeworkRunner assignment={assignment} />;
}
