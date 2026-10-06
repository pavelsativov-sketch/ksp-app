import { notFound, redirect } from "next/navigation";
import { getPlanById } from "@/lib/plans-repo";
import { getCurrentUser } from "@/lib/auth";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { LiveQuizHost } from "@/components/ksp/live-quiz-host";
import type { InteractiveTask } from "@/lib/ksp/tasks";
import type { HostResume } from "@/lib/ksp/live-quiz";

export const dynamic = "force-dynamic";

export default async function LiveQuizHostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/quiz/host/${id}`);

  const plan = await getPlanById(id);
  if (!plan) notFound();

  // Только владелец может запускать live-сессию.
  if (user.id !== plan.owner_id) {
    redirect(`/plans/${plan.id}`);
  }


  const tasks: InteractiveTask[] = [
    ...(plan.content.stages.beginning.tasks ?? []),
    ...(plan.content.stages.middle.tasks ?? []),
    ...(plan.content.stages.end.tasks ?? []),
  ];

  // Восстановление сессии: если у этого хоста уже есть активная комната для
  // плана (например, страница была обновлена), продолжаем её, а не создаём новую.
  let resume: HostResume | null = null;
  try {
    if (isMongoConfigured()) {
      const db = await getDb();
      const room = await db.collection(COL.quizRooms).findOne({
        ownerId: user.id,
        planId: id,
        expiresAt: { $gt: new Date() },
      });
      if (room && typeof room.code === "string") {
        const studentsMap = (room.students ?? {}) as Record<string, { name?: string; score?: number; answered?: number }>;
        const leaderboard = Object.entries(studentsMap)
          .map(([studentId, s]) => ({
            studentId,
            name: s.name || "Ученик",
            score: s.score ?? 0,
            answered: s.answered ?? 0,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 200);
        const endsAtRaw = room.questionEndsAt instanceof Date ? room.questionEndsAt.getTime() : Number(room.questionEndsAt) || 0;
        resume = {
          code: room.code,
          phase: (room.phase as HostResume["phase"]) ?? "lobby",
          currentIndex: typeof room.currentIndex === "number" ? room.currentIndex : -1,
          endsAt: endsAtRaw > Date.now() ? endsAtRaw : null,
          leaderboard,
        };
      }
    }
  } catch {
    // Без восстановления хост просто начнёт новую комнату.
  }

  return <LiveQuizHost tasks={tasks} planTitle={plan.title} planId={plan.id} resume={resume} />;
}
