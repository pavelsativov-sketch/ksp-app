import Link from "next/link";
import { LoginForm } from "./form";
import { getDict } from "@/lib/i18n/server";
import { AuthShell, authLinkClass, authNoteClass } from "@/components/auth/auth-shell";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { t, locale } = await getDict();
  const a = t.auth;
  // Куда вернуть пользователя после входа: только внутренние пути.
  const sp = await searchParams;
  const next = typeof sp.next === "string" && /^\/(?!\/)/.test(sp.next) ? sp.next : undefined;
  return (
    <AuthShell mode="login" locale={locale} title={a.loginTitle} lead={a.loginLead} formTitle={a.loginFormTitle}>
      <LoginForm next={next} />
      <p className={authNoteClass}><Link className={authLinkClass} href="/forgot-password">{a.forgot}</Link></p>
    </AuthShell>
  );
}
