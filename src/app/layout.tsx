import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { logoutAction } from "./actions/auth";
import { Button } from "@/components/ui/button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "КСП App — конструктор краткосрочных планов",
  description:
    "Сервис для учителей Казахстана: создание КСП по стандарту обновлённого содержания с помощью AI, экспорт в Word и PDF, библиотека готовых планов.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const configured = isSupabaseConfigured();
  let userEmail: string | null = null;
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }

  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900 flex flex-col">
        {!configured && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-4 py-2 text-center no-print">
            Режим демо: Supabase не настроен. Добавьте{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> и{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> в{" "}
            <code className="font-mono">.env.local</code>.
          </div>
        )}
        <header className="bg-white border-b border-slate-200 no-print">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
            <Link href="/" className="font-semibold text-lg">
              КСП<span className="text-blue-600">.app</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link className="hover:underline" href="/library">
                Библиотека
              </Link>
              {userEmail ? (
                <>
                  <Link className="hover:underline" href="/dashboard">
                    Мои КСП
                  </Link>
                  <span className="text-slate-500 hidden md:inline">
                    {userEmail}
                  </span>
                  <form action={logoutAction}>
                    <Button variant="outline" size="sm" type="submit">
                      Выйти
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <Link className="hover:underline" href="/login">
                    Войти
                  </Link>
                  <Button asChild size="sm">
                    <Link href="/register">Регистрация</Link>
                  </Button>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1 w-full">{children}</main>
        <footer className="bg-white border-t border-slate-200 text-xs text-slate-500 py-4 text-center no-print">
          КСП.app · Инструмент для учителей · Обновлённое содержание РК
        </footer>
      </body>
    </html>
  );
}
