import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool } from "@/lib/school/active";
import { getSchoolStudents } from "@/lib/school";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

/** Классы школы: собираются из реального контингента учеников. */
export default async function ClassesPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school || !school._id) return <NoSchool />;

  const students = await getSchoolStudents(school._id.toString());
  const byClass = new Map<string, { total: number; boys: number; girls: number }>();
  for (const s of students) {
    const c = byClass.get(s.class_name) ?? { total: 0, boys: 0, girls: 0 };
    c.total += 1;
    if (s.gender === "M") c.boys += 1; else c.girls += 1;
    byClass.set(s.class_name, c);
  }
  const classes = [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b, "kk", { numeric: true }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">Контингент</p>
        <h1 className="editorial-display mt-1 text-3xl">Классы</h1>
      </header>

      {classes.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Классы появятся, когда в школе появятся ученики.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map(([name, c]) => (
            <Card key={name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{name}</CardTitle>
                <CardDescription className="flex items-center gap-1.5"><Users className="size-3.5" /> {c.total} учеников</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {c.boys} мальчиков · {c.girls} девочек
                <Link href={`/school/students?class=${encodeURIComponent(name)}`} className="ml-2 editorial-link font-semibold text-primary">Открыть</Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
