import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb, COL, isMongoConfigured, toObjectId } from "@/lib/mongo";
import type { PlanDoc } from "@/lib/plans-repo";
import { localSubjects } from "@/lib/goso/local";
import { isAnyProviderConfigured } from "@/lib/ai/providers";
import { listCredentialDomains } from "@/lib/agents/browser-autologin";
import { Home, type HomePlan } from "@/components/app/home";

export const dynamic = "force-dynamic";

function toHomePlan(p: PlanDoc): HomePlan {
  return {
    id: p._id ? p._id.toString() : "",
    title: p.title,
    topic: p.content?.topic ?? "",
    grade: p.grade,
    updatedAt: p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
  };
}

const PROJECTION = { title: 1, grade: 1, updated_at: 1, "content.topic": 1 };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const startLesson = (await searchParams).new === "1";

  const subjects = localSubjects().map((x) => ({ name: x.name_ru, min: x.grade_min, max: x.grade_max }));
  let recent: HomePlan[] = [];
  let favorites: HomePlan[] = [];
  let bilimConnected = false;

  // Главная открывается и при сбое базы: учитель всё равно может начать новый урок.
  if (isMongoConfigured()) {
    try {
      const db = await getDb();
      const plans = db.collection<PlanDoc>(COL.plans);
      const [own, likes, domains] = await Promise.all([
        plans.find({ owner_id: user.id, is_draft: { $ne: true } }, { projection: PROJECTION }).sort({ updated_at: -1 }).limit(8).toArray(),
        db.collection(COL.planLikes).find({ user_id: user.id }, { projection: { plan_id: 1 } }).sort({ createdAt: -1 }).limit(8).toArray(),
        listCredentialDomains(user.id).catch(() => [] as string[]),
      ]);
      recent = own.map(toHomePlan);
      bilimConnected = domains.includes("bilimclass.kz");
      const ids = likes.map((l) => toObjectId(String(l.plan_id))).filter((id) => id !== null);
      if (ids.length > 0) {
        const liked = await plans.find({ _id: { $in: ids }, visibility: { $ne: "private" } }, { projection: PROJECTION }).toArray();
        favorites = liked.map(toHomePlan);
      }
    } catch (error) {
      console.error("[dashboard] не удалось загрузить данные", error);
    }
  }

  return (
    <Home
      key={String(startLesson)}
      startLesson={startLesson}
      subjects={subjects}
      recent={recent}
      favorites={favorites}
      bilimConnected={bilimConnected}
      agentOnline={isAnyProviderConfigured()}
    />
  );
}
