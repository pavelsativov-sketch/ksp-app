import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, KeyRound, ShieldCheck, Globe, BookOpen, Users } from "lucide-react";

export const dynamic = "force-dynamic";

const CONNECTORS = [
  {
    name: "BilimClass",
    description: "Дэшборд учителя, КТП, расписание, журнал и отметка о проведении уроков. Вход через рабочий браузер — пароль не покидает ваш аккаунт.",
    url: "https://www.bilimclass.kz/2026/frontoffice/dashboard",
    icon: BookOpen,
    color: "from-sky-500 to-blue-600",
  },
  {
    name: "Kundelik.kz",
    description: "Электронный дневник — посещаемость, домашние задания и связь с родителями.",
    url: "https://login.kundelik.kz",
    icon: Users,
    color: "from-emerald-500 to-teal-600",
  },
  {
    name: "НОБД",
    description: "Национальная образовательная база данных. Статистика контингента, педагогических работников и организаций.",
    url: "https://nobd.edu.kz/login",
    icon: Globe,
    color: "from-violet-500 to-indigo-600",
  },
];

/** External school systems are accessed through the owner's browser session. */
export default async function ConnectorsPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 md:px-6">
      <header>
        <p className="editorial-kicker">Внешние сервисы</p>
        <h1 className="editorial-display mt-1 text-3xl">Подключения</h1>
        <p className="mt-2 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONNECTORS.map((service) => {
          const Icon = service.icon;
          // Ссылка на рабочую область с авто-навигацией на нужный портал
          const workspaceHref = `/school/workspace?tab=browser&url=${encodeURIComponent(service.url)}`;

          return (
            <Card key={service.name} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className={`grid size-10 place-items-center rounded-xl bg-gradient-to-br ${service.color} text-white`}>
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base">{service.name}</CardTitle>
                    <CardDescription>Через безопасный браузер</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between space-y-3 text-sm">
                <p className="text-muted-foreground">{service.description}</p>
                <p className="font-mono text-xs text-muted-foreground/70">{service.url}</p>
                <div className="flex gap-2 pt-1">
                  {/* Открыть в рабочей области — браузер сразу переходит на нужный URL */}
                  <Link
                    href={workspaceHref}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Globe className="size-3.5" />
                    Открыть в браузере
                  </Link>
                  {/* Открыть сайт напрямую в новой вкладке браузера */}
                  <a
                    href={service.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs text-muted-foreground hover:bg-muted"
                    title="Открыть в новой вкладке браузера"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6 text-sm">
          <div className="flex items-start gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>API-ключи сервисов не нужны. Вы входите в каждый сервис напрямую в рабочем браузере — просто кликните на поле логина/пароля на экране и начните печатать.</p>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>Состояние входа хранится отдельно для вашего аккаунта в зашифрованном виде. В следующий раз откроется сразу как авторизованный пользователь.</p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
