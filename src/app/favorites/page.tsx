import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb, COL, toObjectId } from "@/lib/mongo";
import type { PlanDoc } from "@/lib/plans-repo";
import { getDict } from "@/lib/i18n/server";
import { appCopy } from "@/components/app/copy";

export const dynamic = "force-dynamic";

/** Избранное: планы из библиотеки, которые учитель отметил лайком. */
export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/favorites");
  const { locale } = await getDict();
  const c = appCopy(locale);

  const db = await getDb();
  const likes = await db.collection(COL.planLikes).find({ user_id: user.id }, { projection: { plan_id: 1 } }).sort({ createdAt: -1 }).limit(200).toArray();
  const ids = likes.map((l) => toObjectId(String(l.plan_id))).filter((id) => id !== null);
  const plans = ids.length
    ? await db.collection<PlanDoc>(COL.plans).find({ _id: { $in: ids }, visibility: { $ne: "private" } }, { projection: { title: 1, grade: 1, "content.topic": 1 } }).toArray()
    : [];

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-6 md:px-6">
      <header>
        <h1 className="text-4xl font-extrabold tracking-tight">{c.favoritesPage}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{c.favoritesLead}</p>
      </header>
      {plans.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-8">
          <p className="text-sm text-muted-foreground">{c.emptyFavorites}</p>
          <Link href="/library" className="mt-3 inline-block text-sm font-bold text-primary">{c.nav.library}</Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => (
            <li key={String(plan._id)}>
              <Link href={`/plans/${String(plan._id)}`} className="block rounded-card border border-border bg-surface p-4 shadow-card transition-transform hover:-translate-y-0.5">
                <span className="block font-bold">{plan.content?.topic || plan.title}</span>
                <span className="text-sm text-muted-foreground">{plan.grade} {c.grade}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
