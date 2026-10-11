import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getSchoolOverview } from "@/lib/school-analytics";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, AlertTriangle, GraduationCap, School, Users, ClipboardCheck, BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Дашборд школы на реальных данных: посещаемость, качество знаний,
 * прогресс КТП и ВШК агрегируются из коллекций (см. getSchoolOverview).
 */
export default async function SchoolDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const school = await getActiveSchool(user.id);
  if (!school) return <NoSchool />;

  const schoolId = school._id!.toString();
  const overview = await getSchoolOverview(schoolId);

  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">Школа</p>
        <h1 className="editorial-display mt-1 text-3xl">{school.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
      </header>

      {!overview.hasData ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <School className="size-8 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Школа создана, но в ней пока нет рабочих данных. Добавьте учащихся, затем отмечайте посещаемость и оценки — показатели обновятся автоматически.
            </p>
            <div className="flex flex-wrap justify-center gap-2"><Link className="rounded-lg border border-border px-3 py-2 text-sm font-semibold" href="/school/students">Добавить учащихся</Link><Link className="rounded-lg border border-border px-3 py-2 text-sm font-semibold" href="/school/attendance">Отметить посещаемость</Link><Link className="rounded-lg border border-border px-3 py-2 text-sm font-semibold" href="/school/quality">Добавить оценки</Link></div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Кольцо состояния + счётчики */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <Card className="flex flex-col items-center justify-center p-6">
              <CardDescription className="mb-2">Состояние школы</CardDescription>
              <HealthRing score={overview.score} />
              <p className="mt-2 text-xs text-muted-foreground">посещаемость · качество · КТП</p>
            </Card>
            <Stat icon={<Users className="size-5 text-primary" />} label="Учеников" value={overview.students} href="/school/students" />
            <Stat icon={<GraduationCap className="size-5 text-primary" />} label="Педагогов" value={overview.teachers} href="/school/teachers" />
            <Stat icon={<School className="size-5 text-primary" />} label="Классов" value={overview.classes} href="/school/classes" />
          </div>

          {/* Ключевые показатели */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard href="/school/attendance" title="Посещаемость · 60 дней" value={pct(overview.attendanceRate)} icon={<Users className="size-4" />} />
            <MetricCard href="/school/quality" title="Качество знаний" value={pct(overview.qualityScore)} icon={<GraduationCap className="size-4" />} />
            <MetricCard href="/school/vsk" title="Средний балл ВШК" value={overview.vskAverage === null ? "—" : `${Math.round(overview.vskAverage)}/100`} icon={<ClipboardCheck className="size-4" />} />
          </div>

          {/* Проблемы и предупреждения */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Проблемы и предупреждения</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {overview.issues.length === 0 && overview.warnings.length === 0 && (
                  <p className="text-sm text-muted-foreground">Всё в норме — критичных отклонений нет.</p>
                )}
                {overview.issues.map((i, idx) => (
                  <p key={idx} className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" /> {i.description}
                  </p>
                ))}
                {overview.warnings.map((i, idx) => (
                  <p key={idx} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {i.description}
                  </p>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Разделы</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                <Tile href="/school/attendance" label="Посещаемость" />
                <Tile href="/school/quality" label="Успеваемость" />
                <Tile href="/school/curriculum" label="КТП" />
                <Tile href="/school/vsk" label="ВШК" />
                <Tile href="/school/students" label="Ученики" />
                <Tile href="/school/classes" label="Классы" />
              </CardContent>
            </Card>
          </div>

          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <BookOpen className="size-3.5" /> Данные агрегируются из коллекций школы в реальном времени.
          </p>
        </>
      )}
    </main>
  );
}

function HealthRing({ score }: { score: number }) {
  const r = 45;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex size-32 items-center justify-center">
      <svg className="size-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-primary/15" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
          className="text-primary transition-all duration-1000"
        />
      </svg>
      <span className="absolute text-2xl font-bold">{score}%</span>
    </div>
  );
}

function Stat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="group">
      <Card className="flex h-full flex-col justify-center p-5 transition-colors group-hover:border-primary/40">
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-3xl font-bold">{value}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </Card>
    </Link>
  );
}

function MetricCard({ href, title, value, icon }: { href: string; title: string; value: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="group">
      <Card className="transition-colors group-hover:border-primary/40">
        <CardHeader className="pb-1">
          <CardDescription className="flex items-center gap-1.5">{icon} {title}</CardDescription>
          <CardTitle className="text-2xl">{value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

function Tile({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-lg border border-border px-3 py-2 text-center hover:border-primary/40 hover:text-primary">
      {label}
    </Link>
  );
}
