import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./form";
import { getDict } from "@/lib/i18n/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { t } = await getDict();
  const a = t.auth;
  // Куда вернуть пользователя после входа: только внутренние пути.
  const sp = await searchParams;
  const next = typeof sp.next === "string" && /^\/(?!\/)/.test(sp.next) ? sp.next : undefined;
  return <div className="sky-night auth-stage"><div className="mx-auto grid min-h-[calc(100vh-11rem)] max-w-[1200px] items-start gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-12">
    <section className="lg:col-span-5"><p className="editorial-kicker">{a.loginKicker}</p><h1 className="editorial-display mt-4 text-5xl">{a.loginTitle}</h1><p className="mt-5 max-w-sm text-base leading-7 text-muted-foreground">{a.loginLead}</p><BookOpen className="mt-9 size-6 text-cyan-foreground" /></section>
    <Card className="lg:col-span-5 lg:col-start-8"><CardHeader><p className="editorial-kicker">{a.loginFormKicker}</p><CardTitle className="editorial-display mt-3 text-3xl">{a.loginFormTitle}</CardTitle></CardHeader><CardContent><LoginForm next={next} /><p className="mt-8 text-sm text-muted-foreground">{a.noAccount} <Link className="editorial-link font-semibold" href="/register">{t.nav.register} <ArrowRight className="inline size-3.5" /></Link></p><p className="mt-2 text-sm text-muted-foreground"><Link className="editorial-link font-semibold" href="/forgot-password">{a.forgot}</Link></p></CardContent></Card>
  </div></div>;
}
