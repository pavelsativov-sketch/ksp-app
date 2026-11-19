"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Share2, ChevronsUpDown, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

/** Заголовки разделов для крошек. Незнакомый путь показывается как «Школа» / «Мектеп». */
const TITLES_RU: Record<string, string> = {
  "/school": "Рабочая область",
  "/school/dashboard": "Дашборд",
  "/school/agents": "Задачи агента",
  "/school/settings": "Настройки",
  "/school/students": "Ученики",
  "/school/teachers": "Педагоги",
  "/school/classes": "Классы",
  "/school/attendance": "Посещаемость",
  "/school/quality": "Качество знаний",
  "/school/curriculum": "КТП",
  "/school/sor-soch": "Анализ СОР и СОЧ",
  "/school/vsk": "Справки ВШК",
  "/school/characteristics": "Характеристики",
  "/school/homeroom": "Классное руководство",
  "/school/iom": "Маршруты ИОМ",
  "/school/reports": "Отчёты",
  "/school/connectors": "Подключения",
  "/school/workspace": "Рабочий стол",
  "/school/create": "Создание школы",
};

const TITLES_KK: Record<string, string> = {
  "/school": "Жұмыс кеңістігі",
  "/school/dashboard": "Дашборд",
  "/school/agents": "Агент тапсырмалары",
  "/school/settings": "Баптаулар",
  "/school/students": "Оқушылар",
  "/school/teachers": "Педагогтер",
  "/school/classes": "Сыныптар",
  "/school/attendance": "Қатысу",
  "/school/quality": "Білім сапасы",
  "/school/curriculum": "КТЖ",
  "/school/sor-soch": "БЖБ және ТЖБ талдауы",
  "/school/vsk": "Мектепішілік бақылау анықтамалары",
  "/school/characteristics": "Мінездемелер",
  "/school/homeroom": "Сынып жетекшілігі",
  "/school/iom": "ЖББ бағыттары",
  "/school/reports": "Есептер",
  "/school/connectors": "Қосылымдар",
  "/school/workspace": "Жұмыс үстелі",
  "/school/create": "Мектеп құру",
};

function titleFor(pathname: string, isKk: boolean): string {
  const map = isKk ? TITLES_KK : TITLES_RU;
  const exact = map[pathname];
  if (exact) return exact;
  const base = Object.keys(map)
    .filter((key) => key !== "/school" && pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];
  return base ? map[base]! : (isKk ? "Мектеп" : "Школа");
}

/**
 * Верхний бар рабочей области школы.
 *
 * Изменения:
 *  - Кнопка «Главная» (Home) — выход из раздела /school на лендинг.
 *  - Переключатель школы показывается даже при одной школе (для наглядности
 *    и будущего расширения).
 */
export function SchoolTopbar({ userName, userEmail }: { userName: string; userEmail: string }) {
  const pathname = usePathname() ?? "/school";
  const router = useRouter();
  const { locale } = useUiLocale();
  const isKk = locale === "kk";
  const { toast } = useToast();
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [activeSchoolId, setActiveSchoolId] = useState("");
  const [switching, setSwitching] = useState(false);
  const title = titleFor(pathname, isKk);
  const displayName = userName || userEmail;
  const initial = (displayName || "?").trim().charAt(0).toUpperCase();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/school", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { schools?: { _id?: string; name: string }[]; activeSchoolId?: string };
        if (!alive) return;
        setSchools((data.schools ?? []).flatMap((school) => school._id ? [{ id: school._id, name: school.name }] : []));
        setActiveSchoolId(data.activeSchoolId ?? "");
      } catch { /* selector is optional if schools endpoint is temporarily unavailable */ }
    })();
    return () => { alive = false; };
  }, []);

  async function selectSchool(schoolId: string) {
    if (!schoolId || switching || schoolId === activeSchoolId) return;
    setSwitching(true);
    try {
      const response = await fetch("/api/school", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId }) });
      if (!response.ok) throw new Error(isKk ? "Мектепті ауыстыру мүмкін болмады" : "Не удалось переключить школу");
      setActiveSchoolId(schoolId);
      router.refresh();
    } catch { toast.error(isKk ? "Мектепті ауыстыру мүмкін болмады" : "Не удалось переключить школу"); }
    finally { setSwitching(false); }
  }

  async function share() {
    const url = window.location.href;
    const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
    try {
      if (canShare) {
        await navigator.share({ title: "Mekty AI", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success(isKk ? "Сілтеме көшірілді" : "Ссылка скопирована");
    } catch {
      // Пользователь закрыл системное окно или буфер недоступен (http).
      toast.info(isKk ? "Мекенжайды браузер жолағынан көшіріңіз" : "Скопируйте адрес из строки браузера");
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0f0b26] px-3">
      <Link href="/school" className="flex shrink-0 items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 text-sm font-black text-white">M</span>
        <span className="hidden items-baseline gap-1 text-sm font-semibold text-white sm:flex">
          Mekty <span className="text-violet-400">AI</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Beta</span>
        </span>
      </Link>

      <nav aria-label={isKk ? "Навигация жолы" : "Хлебные крошки"} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <span className="hidden shrink-0 sm:inline">{isKk ? "Мектеп" : "Школа"}</span>
        <ChevronRight className="hidden size-3.5 shrink-0 sm:inline" aria-hidden />
        <span className="truncate font-medium text-white">{title}</span>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Переключатель между школами — показывается при наличии хотя бы одной */}
        {schools.length > 0 && (
          <label className="flex max-w-48 items-center gap-1 rounded-lg border border-white/15 px-2 text-xs text-muted-foreground">
            <ChevronsUpDown className="size-3 shrink-0" />
            <span className="sr-only">{isKk ? "Белсенді мектеп" : "Активная школа"}</span>
            <select
              aria-label={isKk ? "Белсенді мектеп" : "Активная школа"}
              disabled={switching}
              value={activeSchoolId}
              onChange={(event) => void selectSchool(event.target.value)}
              className="min-w-0 max-w-[120px] bg-transparent py-1.5 outline-none"
            >
              <option className="bg-foreground" value="">{isKk ? "Мектеп" : "Школа"}</option>
              {schools.map((school) => (
                <option className="bg-foreground" key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* ← Главная: выход из рабочей области школы на главное меню сайта */}
        <Link
          href="/"
          title={isKk ? "Басты бетке" : "На главную страницу"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
        >
          <Home className="size-3.5" />
          <span className="hidden sm:inline">{isKk ? "Басты бет" : "Главная"}</span>
        </Link>

        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
        >
          <Share2 className="size-3.5" /> <span className="hidden sm:inline">{isKk ? "Бөлісу" : "Поделиться"}</span>
        </button>
        <Link
          href="/school/settings"
          title={displayName}
          className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-violet-600 text-sm font-bold text-white"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}
