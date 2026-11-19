import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getDict } from "@/lib/i18n/server";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, KeyRound, ShieldCheck, Globe, BookOpen, Users } from "lucide-react";
import { BrowserWarmupLink } from "@/components/school/browser-warmup-link";

export const dynamic = "force-dynamic";

const CONNECTORS = [
  {
    name: "BilimClass",
    descriptionRu: "Дэшборд учителя, КТП, расписание, журнал и отметка о проведении уроков. Вход через рабочий браузер — пароль не покидает ваш аккаунт.",
    descriptionKk: "Мұғалім дашборды, КТЖ, кесте, журнал және сабақ өткізу белгілері. Жұмыс браузері арқылы кіру — құпиясөз тек өз аккаунтыңызда сақталады.",
    url: "https://www.bilimclass.kz/2026/frontoffice/dashboard",
    icon: BookOpen,
    color: "from-violet-500 to-violet-600",
  },
  {
    name: "Kundelik.kz",
    descriptionRu: "Электронный дневник — посещаемость, домашние задания и связь с родителями.",
    descriptionKk: "Электрондық күнделік — қатысу, үй тапсырмалары және ата-аналармен байланыс.",
    url: "https://login.kundelik.kz",
    icon: Users,
    color: "from-emerald-500 to-violet-600",
  },
  {
    name: "НОБД",
    nameKk: "ҰБДҚ (НОБД)",
    descriptionRu: "Национальная образовательная база данных. Статистика контингента, педагогических работников и организаций.",
    descriptionKk: "Ұлттық білім беру деректер қоры. Контингент, педагог қызметкерлер және ұйымдар статистикасы.",
    url: "https://nobd.edu.kz/login",
    icon: Globe,
    color: "from-violet-500 to-violet-600",
  },
];

/** External school systems are accessed through the owner's browser session. */
export default async function ConnectorsPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;
  const { locale } = await getDict();
  const isKk = locale === "kk";

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 md:px-6">
      <header>
        <p className="editorial-kicker">{isKk ? "Сыртқы сервистер" : "Внешние сервисы"}</p>
        <h1 className="editorial-display mt-1 text-3xl">{isKk ? "Қосылымдар" : "Подключения"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONNECTORS.map((service) => {
          const Icon = service.icon;
          const workspaceHref = `/school/workspace?tab=browser&url=${encodeURIComponent(service.url)}`;
          const title = isKk && "nameKk" in service && service.nameKk ? service.nameKk : service.name;

          return (
            <Card key={service.name} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className={`grid size-10 place-items-center rounded-xl bg-gradient-to-br ${service.color} text-white`}>
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{isKk ? "Қауіпсіз браузер арқылы" : "Через безопасный браузер"}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between space-y-3 text-sm">
                <p className="text-muted-foreground">{isKk ? service.descriptionKk : service.descriptionRu}</p>
                <p className="tabular-nums text-xs text-muted-foreground/70">{service.url}</p>
                <div className="flex gap-2 pt-1">
                  <BrowserWarmupLink
                    href={workspaceHref}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Globe className="size-3.5" />
                    {isKk ? "Браузерде ашу" : "Открыть в браузере"}
                  </BrowserWarmupLink>
                  <a
                    href={service.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs text-muted-foreground hover:bg-muted"
                    title={isKk ? "Жаңа қойындыда ашу" : "Открыть в новой вкладке браузера"}
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
            <p>
              {isKk
                ? "Сервистердің API кілттері қажет емес. Сіз әр жүйеге жұмыс браузері арқылы тікелей кіресіз — экрандағы логин/құпиясөз өрісіне басып теріңіз."
                : "API-ключи сервисов не нужны. Вы входите в каждый сервис напрямую в рабочем браузере — просто кликните на поле логина/пароля на экране и начните печатать."}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>
              {isKk
                ? "Кіру сессиясы сіздің аккаунтыңыз үшін бөлек әрі шифрланған күйде сақталады. Келесі жолы бірден кірген күйде ашылады."
                : "Состояние входа хранится отдельно для вашего аккаунта в зашифрованном виде. В следующий раз откроется сразу как авторизованный пользователь."}
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
