import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getSchoolMembers, requireSchoolAccess } from "@/lib/school";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { director: "Директор", deputy: "Завуч", teacher: "Учитель", admin: "Администратор" };

/** Настройки: реальные данные школы и ваша роль. */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school || !school._id) return <NoSchool />;

  const schoolId = school._id.toString();
  const [member, members] = await Promise.all([
    requireSchoolAccess(user!.id, schoolId).catch(() => null),
    getSchoolMembers(schoolId).catch(() => []),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">Рабочая область</p>
        <h1 className="editorial-display mt-1 text-3xl">Настройки школы</h1>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{school.name}</CardTitle><CardDescription>{formatSchoolSubtitle(school)}</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Row label="Код для подключения учителей"><span className="font-mono font-semibold">{school.code}</span></Row>
            <Row label="Ваша роль"><span className="font-semibold">{member ? ROLE_LABEL[member.role] ?? member.role : "—"}</span></Row>
            <Row label="Язык обучения">{school.settings.language === "kk" ? "Қазақша" : "Русский"}</Row>
            <Row label="Система оценивания">{school.settings.grading_system === "5-point" ? "5-балльная" : "10-балльная"}</Row>
            <Row label="Смены">{school.settings.shifts}</Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Коллектив ({members.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {members.map((m) => (
              <p key={m._id?.toString()} className="flex items-center justify-between">
                <span className="truncate">{m.full_name}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABEL[m.role] ?? m.role}</span>
              </p>
            ))}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Новые учителя подключаются по коду школы на странице <Link href="/school/create" className="editorial-link font-semibold">создания/подключения</Link>.
        </p>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <p className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0"><span className="text-muted-foreground">{label}</span>{children}</p>;
}
