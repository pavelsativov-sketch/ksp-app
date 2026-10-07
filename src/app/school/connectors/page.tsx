import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

/** External school systems are accessed through the owner's browser session. */
export default async function ConnectorsPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;

  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 md:px-6">
    <header>
      <p className="editorial-kicker">Внешние сервисы</p>
      <h1 className="editorial-display mt-1 text-3xl">Подключения</h1>
      <p className="mt-2 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
    </header>

    <div className="grid gap-4 sm:grid-cols-2">
      {[
        { name: "BilimClass", description: "Вход в личный кабинет BilimClass и работа с ним через браузерного агента.", url: "https://www.bilimclass.kz/login" },
        { name: "НОБД", description: "Вход в Национальную образовательную базу данных и работа с ней через браузерного агента.", url: "https://nobd.edu.kz/login" },
      ].map((service) => <Card key={service.name}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-muted"><ExternalLink className="size-5" /></span>
            <div><CardTitle className="text-base">{service.name}</CardTitle><CardDescription>Подключение через аккаунт пользователя</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">{service.description}</p>
          <p className="font-mono text-xs text-muted-foreground">{service.url}</p>
        </CardContent>
      </Card>)}
    </div>

    <Card>
      <CardContent className="space-y-4 pt-6 text-sm">
        <div className="flex items-start gap-2"><KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p>API-ключи сервисов не нужны. Пользователь входит в каждый сервис в рабочем браузере; пароль не передаётся в адресной строке или агенту.</p></div>
        <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p>Состояние входа хранится отдельно для вашего аккаунта в зашифрованном виде. Перед опасными действиями агент запрашивает подтверждение.</p></div>
        <Link href="/school/workspace" className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:opacity-90">
          Открыть рабочую область
        </Link>
      </CardContent>
    </Card>
  </main>;
}
