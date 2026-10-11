import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool } from "@/lib/school/active";
import { getSchoolMembers } from "@/lib/school";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { director: "Директор", deputy: "Завуч", teacher: "Учитель", admin: "Администратор" };

/** Педагоги школы: реальные участники из school_members. */
export default async function TeachersPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school || !school._id) return <NoSchool />;

  const members = await getSchoolMembers(school._id.toString());
  const roleOrder: Record<string, number> = { director: 0, admin: 1, deputy: 2, teacher: 3 };
  const sorted = [...members].sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.full_name.localeCompare(b.full_name, "ru"));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">Коллектив</p>
        <h1 className="editorial-display mt-1 text-3xl">Педагоги</h1>
        <p className="mt-1 text-sm text-muted-foreground">{members.length} человек · код школы для подключения: <span className="font-mono">{school.code}</span></p>
      </header>

      {members.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Пока только вы.</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => (
            <li key={m._id?.toString()} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate font-medium">{m.full_name}{m.subject ? <span className="text-muted-foreground"> · {m.subject}</span> : null}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${m.role === "director" ? "bg-primary-soft font-semibold text-primary" : "bg-muted text-muted-foreground"}`}>
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
