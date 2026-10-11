"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Share2, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

/** Заголовки разделов для крошек. Незнакомый путь показывается как «Школа». */
const TITLES: Record<string, string> = {
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
  "/school/vsk": "ВШК",
  "/school/reports": "Отчёты",
  "/school/connectors": "Подключения",
  "/school/workspace": "Рабочий стол",
  "/school/create": "Создание школы",
};

function titleFor(pathname: string): string {
  const exact = TITLES[pathname];
  if (exact) return exact;
  const base = Object.keys(TITLES)
    .filter((key) => key !== "/school" && pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];
  return base ? TITLES[base]! : "Школа";
}

/**
 * Верхний бар рабочей области: бренд, крошки «Школа / раздел», «Поделиться»
 * (копирует ссылку или отдаёт её в системное меню) и аватар пользователя.
 */
export function SchoolTopbar({ userName, userEmail }: { userName: string; userEmail: string }) {
  const pathname = usePathname() ?? "/school";
  const router = useRouter();
  const { toast } = useToast();
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [activeSchoolId, setActiveSchoolId] = useState("");
  const [switching, setSwitching] = useState(false);
  const title = titleFor(pathname);
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
      if (!response.ok) throw new Error("Не удалось переключить школу");
      setActiveSchoolId(schoolId);
      router.refresh();
    } catch { toast.error("Не удалось переключить школу"); }
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
      toast.success("Ссылка скопирована");
    } catch {
      // Пользователь закрыл системное окно или буфер недоступен (http).
      toast.info("Скопируйте адрес из строки браузера");
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0b0d13] px-3">
      <Link href="/school" className="flex shrink-0 items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-sm font-black text-white">M</span>
        <span className="hidden items-baseline gap-1 text-sm font-semibold text-slate-100 sm:flex">
          Mekty <span className="text-sky-400">AI</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">Beta</span>
        </span>
      </Link>

      <nav aria-label="Хлебные крошки" className="flex min-w-0 items-center gap-1 text-xs text-slate-400">
        <span className="hidden shrink-0 sm:inline">Школа</span>
        <ChevronRight className="hidden size-3.5 shrink-0 sm:inline" aria-hidden />
        <span className="truncate font-medium text-slate-200">{title}</span>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {schools.length > 1 && <label className="flex max-w-40 items-center gap-1 rounded-lg border border-white/15 px-2 text-xs text-slate-300"><ChevronsUpDown className="size-3 shrink-0" /><span className="sr-only">Активная школа</span><select aria-label="Активная школа" disabled={switching} value={activeSchoolId} onChange={(event) => void selectSchool(event.target.value)} className="min-w-0 bg-transparent py-1.5 outline-none"><option className="bg-slate-900" value="">Школа</option>{schools.map((school) => <option className="bg-slate-900" key={school.id} value={school.id}>{school.name}</option>)}</select></label>}
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Share2 className="size-3.5" /> <span className="hidden sm:inline">Поделиться</span>
        </button>
        <Link
          href="/school/settings"
          title={displayName}
          className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}
