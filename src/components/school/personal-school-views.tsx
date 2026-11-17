"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  CalendarCheck,
  Download,
  GraduationCap,
  Loader2,
  RefreshCw,
  School,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TeacherJournalAnalytics } from "@/lib/journal";

function PersonalModeBanner() {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs">
      <div className="flex items-center gap-2">
        <School className="size-4 shrink-0 text-primary" />
        <span>
          <strong>Личный журнал и классы учителя</strong> — данные синхронизированы с Электронным журналом и домашними заданиями.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/gradebook" className="font-semibold text-primary underline">
          Открыть Электронный журнал
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/school/create" className="text-muted-foreground hover:text-foreground underline">
          Подключить организацию (для завуча/директора)
        </Link>
      </div>
    </div>
  );
}

export function PersonalSchoolDashboard({ data }: { data: TeacherJournalAnalytics }) {
  const avgQuality =
    data.subjects.length > 0
      ? Math.round(
          data.subjects.reduce((s, item) => s + item.qualityPercent, 0) / data.subjects.length,
        )
      : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <header className="mb-4">
        <p className="editorial-kicker">Кабинет педагога</p>
        <h1 className="editorial-display mt-1 text-3xl">Обзор классов, журнала и КТП</h1>
      </header>
      <PersonalModeBanner />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <CardDescription className="flex items-center gap-1.5">
            <Users className="size-4 text-primary" /> Учеников в базе
          </CardDescription>
          <CardTitle className="mt-1 text-2xl">{data.students.length}</CardTitle>
        </Card>
        <Card className="p-4">
          <CardDescription className="flex items-center gap-1.5">
            <School className="size-4 text-primary" /> Классов
          </CardDescription>
          <CardTitle className="mt-1 text-2xl">{data.classes.length}</CardTitle>
        </Card>
        <Card className="p-4">
          <CardDescription className="flex items-center gap-1.5">
            <GraduationCap className="size-4 text-primary" /> Качество знаний (≥7 б.)
          </CardDescription>
          <CardTitle className="mt-1 text-2xl">
            {avgQuality === null ? "—" : `${avgQuality}%`}
          </CardTitle>
        </Card>
        <Card className="p-4">
          <CardDescription className="flex items-center gap-1.5">
            <BookOpen className="size-4 text-primary" /> Планы КСП / КТП
          </CardDescription>
          <CardTitle className="mt-1 text-2xl">
            {data.plansCount} / {data.ktpCount}
          </CardTitle>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Посещаемость по журналу</CardTitle>
            <CardDescription>УП — уважительная, НП — неуважительная, Б — по болезни</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.attendance.total === 0 ? (
              <p className="text-muted-foreground">
                Отметок пока нет. Перейдите в{" "}
                <Link href="/gradebook" className="font-semibold text-primary underline">
                  Электронный журнал
                </Link>
                , чтобы выставить баллы (1–10) или пропуски (УП / НП / Б).
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-muted p-2.5">
                  <div className="text-xs text-muted-foreground">На уроке</div>
                  <div className="text-lg font-bold text-emerald-600">{data.attendance.present}</div>
                </div>
                <div className="rounded-lg bg-muted p-2.5">
                  <div className="text-xs text-muted-foreground">УП</div>
                  <div className="text-lg font-bold">{data.attendance.excused}</div>
                </div>
                <div className="rounded-lg bg-muted p-2.5">
                  <div className="text-xs text-muted-foreground">НП</div>
                  <div className="text-lg font-bold text-destructive">{data.attendance.unexcused}</div>
                </div>
                <div className="rounded-lg bg-muted p-2.5">
                  <div className="text-xs text-muted-foreground">По болезни (Б)</div>
                  <div className="text-lg font-bold">{data.attendance.sick}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Быстрые переходы</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["/gradebook", "Электронный журнал (10 б.)"],
              ["/school/students", "Список учеников"],
              ["/school/classes", "Мои классы"],
              ["/school/attendance", "Сводка посещаемости"],
              ["/school/sor-soch", "Генератор СОР и СОЧ"],
              ["/school/characteristics", "Характеристики"],
              ["/school/iom", "Маршруты ИОМ"],
              ["/school/reports", "Сводный отчёт"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href!}
                className="rounded-lg border border-border px-3 py-2 font-medium hover:bg-muted"
              >
                {label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export function PersonalStudentsView({
  initialData,
  initialClassFilter = "",
}: {
  initialData: TeacherJournalAnalytics;
  initialClassFilter?: string;
}) {
  const router = useRouter();
  const [classFilter, setClassFilter] = useState(initialClassFilter);
  const [className, setClassName] = useState(initialClassFilter || initialData.classes[0]?.className || "7А");
  const [namesText, setNamesText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = initialData.students.filter(
    (s) => !classFilter || s.className === classFilter,
  );

  async function addStudents(e: React.FormEvent) {
    e.preventDefault();
    const names = namesText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (names.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_students", className, names }),
      });
      const json = (await res.json().catch(() => null)) as { added?: number; error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "Не удалось добавить учеников");
      setNamesText("");
      setNotice(`Добавлено учеников: ${json?.added ?? names.length}`);
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  async function syncHomework() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_homework" }),
      });
      const json = (await res.json().catch(() => null)) as { added?: number; error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "Не удалось синхронизировать");
      setNotice(`Синхронизация с ДЗ завершена (новых учеников: ${json?.added ?? 0})`);
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Ошибка синхронизации");
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(studentId: string, fullName: string) {
    if (!window.confirm(`Удалить ученика «${fullName}» и его записи из личного журнала?`)) return;
    setBusy(true);
    try {
      await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_student", studentId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="editorial-kicker">Контингент</p>
          <h1 className="editorial-display mt-1 text-3xl">Ученики ({initialData.students.length})</h1>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void syncHomework()} disabled={busy}>
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          Подтянуть ФИО из ДЗ
        </Button>
      </header>
      <PersonalModeBanner />

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Добавить учеников (по одному или списком)</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addStudents} className="space-y-3 text-sm">
            <div className="max-w-xs">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Класс</label>
              <Input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Например: 7А"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                ФИО учеников (каждое с новой строки)
              </label>
              <Textarea
                rows={3}
                value={namesText}
                onChange={(e) => setNamesText(e.target.value)}
                placeholder={"Алимов Санжар\nБекова Аружан"}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                Добавить в класс
              </Button>
              {notice && <span className="text-xs text-muted-foreground">{notice}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      {initialData.classes.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setClassFilter("")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              classFilter === "" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            Все классы ({initialData.students.length})
          </button>
          {initialData.classes.map((c) => (
            <button
              key={c.className}
              type="button"
              onClick={() => setClassFilter(c.className)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                classFilter === c.className
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {c.className} ({c.studentsCount})
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            В базе пока нет учеников. Добавьте список класса выше или нажмите «Подтянуть ФИО из ДЗ».
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {visible.map((st, idx) => (
            <div key={st.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <span className="mr-2 text-xs text-muted-foreground">{idx + 1}.</span>
                <span className="font-medium">{st.fullName}</span>
                <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs">{st.className}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Ср. балл: <strong className="text-foreground">{st.averageScore ?? "—"}</strong>/10
                </span>
                <span>
                  Пропуски: УП {st.excusedCount} · НП {st.unexcusedCount} · Б {st.sickCount}
                </span>
                <button
                  type="button"
                  onClick={() => void removeStudent(st.id, st.fullName)}
                  aria-label={`Удалить ${st.fullName}`}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export function PersonalClassesView({ data }: { data: TeacherJournalAnalytics }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="mb-4">
        <p className="editorial-kicker">Учебная нагрузка</p>
        <h1 className="editorial-display mt-1 text-3xl">Мои классы</h1>
      </header>
      <PersonalModeBanner />

      {data.classes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Классы появятся автоматически, как только ученики выполнят ДЗ или вы добавите список класса в разделе{" "}
            <Link href="/school/students" className="font-semibold text-primary underline">
              Ученики
            </Link>{" "}
            либо в{" "}
            <Link href="/gradebook" className="font-semibold text-primary underline">
              Электронном журнале
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.classes.map((cls) => (
            <Card key={cls.className}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">{cls.className}</CardTitle>
                <CardDescription className="flex items-center gap-1.5">
                  <Users className="size-3.5" /> {cls.studentsCount} уч.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Средний балл (ФО 10 б.):</span>
                  <strong className="text-foreground">{cls.avgScore ?? "—"}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Качество знаний (≥7 б.):</span>
                  <strong className="text-foreground">
                    {cls.qualityPercent === null ? "—" : `${cls.qualityPercent}%`}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Посещаемость:</span>
                  <strong className="text-foreground">
                    {cls.attendanceRate === null ? "—" : `${Math.round(cls.attendanceRate * 100)}%`}
                  </strong>
                </div>
                <div className="flex gap-3 pt-2">
                  <Link
                    href={`/school/students?class=${encodeURIComponent(cls.className)}`}
                    className="font-semibold text-primary underline"
                  >
                    Состав класса
                  </Link>
                  <Link href="/gradebook" className="font-semibold text-primary underline">
                    Журнал →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

export function PersonalAttendanceView({ data }: { data: TeacherJournalAnalytics }) {
  const att = data.attendance;
  const pct = att.rate === null ? null : Math.round(att.rate * 100);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="editorial-kicker">Аналитика</p>
          <h1 className="editorial-display mt-1 text-3xl">Посещаемость по журналу</h1>
        </div>
        <Button asChild size="sm">
          <Link href="/gradebook">
            <CalendarCheck className="size-4" /> Отметить УП / НП / Б в журнале
          </Link>
        </Button>
      </header>
      <PersonalModeBanner />

      {att.total === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            В электронном журнале пока нет отметок посещаемости или оценок. Выставьте баллы (1–10) или пропуски (УП, НП, Б) в{" "}
            <Link href="/gradebook" className="font-semibold text-primary underline">
              Электронном журнале
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Card className="p-4">
              <CardDescription>Всего отметок</CardDescription>
              <CardTitle className="text-2xl">{att.total}</CardTitle>
            </Card>
            <Card className="p-4">
              <CardDescription>Присутствовали</CardDescription>
              <CardTitle className="text-2xl text-emerald-600">{att.present}</CardTitle>
            </Card>
            <Card className="p-4">
              <CardDescription>Уважительная (УП)</CardDescription>
              <CardTitle className="text-2xl">{att.excused}</CardTitle>
            </Card>
            <Card className="p-4">
              <CardDescription>Неуважительная (НП)</CardDescription>
              <CardTitle className="text-2xl text-destructive">{att.unexcused}</CardTitle>
            </Card>
            <Card className="p-4">
              <CardDescription>По болезни (Б)</CardDescription>
              <CardTitle className="text-2xl">{att.sick}</CardTitle>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Общая посещаемость уроков</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-primary/15">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct ?? 0}%` }} />
              </div>
              <span className="text-xl font-bold">{pct ?? 0}%</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">По классам</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.classes
                .filter((c) => c.attendanceRate !== null)
                .map((c) => {
                  const ratePct = Math.round((c.attendanceRate ?? 0) * 100);
                  return (
                    <div key={c.className} className="flex items-center gap-3 text-sm">
                      <span className="w-16 shrink-0 font-semibold">{c.className}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-primary/10">
                        <div
                          className={`h-full rounded-full ${ratePct < 85 ? "bg-red-400" : "bg-emerald-500"}`}
                          style={{ width: `${ratePct}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums">{ratePct}%</span>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

export function PersonalReportsView({ data }: { data: TeacherJournalAnalytics }) {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="editorial-kicker">Отчётность педагога</p>
          <h1 className="editorial-display mt-1 text-3xl">Сводный отчёт по успеваемости и посещаемости</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/journal/export?format=docx"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted"
          >
            <Download className="size-4" /> Скачать журнал (.docx)
          </a>
          <a
            href="/api/journal/export?format=csv"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted"
          >
            <Download className="size-4" /> Экспорт CSV
          </a>
        </div>
      </header>
      <PersonalModeBanner />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Качество знаний по предметам (шкала 10 баллов)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.subjects.length === 0 ? (
              <p className="text-muted-foreground">Оценок в электронном журнале пока нет.</p>
            ) : (
              data.subjects.map((sub) => (
                <div key={sub.subject} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium">{sub.subject}</span>
                    <span className="text-xs text-muted-foreground">
                      Ср. балл {sub.avgScore}/10 · Качество {sub.qualityPercent}% ({sub.entriesCount} оц.)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-primary/10">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${sub.qualityPercent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сводка по классам</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.classes.length === 0 ? (
              <p className="text-muted-foreground">Классы пока не добавлены.</p>
            ) : (
              data.classes.map((cls) => (
                <div
                  key={cls.className}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <span className="font-semibold">
                    {cls.className} ({cls.studentsCount} уч.)
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Ср. {cls.avgScore ?? "—"} · Качество {cls.qualityPercent === null ? "—" : `${cls.qualityPercent}%`} · Посещ.{" "}
                    {cls.attendanceRate === null ? "—" : `${Math.round(cls.attendanceRate * 100)}%`}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
