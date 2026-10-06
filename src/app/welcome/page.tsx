import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb, COL, isMongoConfigured, toObjectId } from "@/lib/mongo";
import { listSubjects } from "@/lib/plans-repo";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/welcome");
  let initial = { school: "", subjects: [] as string[], grades: [] as number[], topic: "" };
  let subjects: Array<{ id: string; name: string }> = [];
  if (isMongoConfigured()) {
    try {
      const oid = toObjectId(user.id);
      const [dbSubjects, me] = await Promise.all([
        listSubjects(),
        (async () => {
          if (!oid) return null;
          const db = await getDb();
          return db.collection(COL.users).findOne(
            { _id: oid },
            { projection: { school: 1, subjects_taught: 1, grades_taught: 1 } },
          );
        })(),
      ]);
      subjects = dbSubjects.map((s) => ({ id: s.id, name: s.name_ru }));
      initial = {
        school: (me?.school as string) ?? "",
        subjects: (me?.subjects_taught as string[]) ?? [],
        grades: (me?.grades_taught as number[]) ?? [],
        topic: "",
      };
    } catch {
      // Покажем пустую форму — онбординг не должен падать.
    }
  }
  return <WelcomeWizard subjects={subjects} initial={initial} />;
}
