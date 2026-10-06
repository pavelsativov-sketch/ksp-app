import { Suspense } from "react";
import { LiveQuizStudent } from "@/components/ksp/live-quiz-student";

export const dynamic = "force-dynamic";

export default async function QuizJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  const code = (sp.code ?? "").replace(/\D/g, "").slice(0, 6);
  return (
    <Suspense>
      <LiveQuizStudent initialCode={code} />
    </Suspense>
  );
}
