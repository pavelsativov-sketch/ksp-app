import Link from "next/link";
import { ForgotPasswordForm } from "./form";
import { getDict } from "@/lib/i18n/server";
import { AuthShell, authLinkClass, authNoteClass } from "@/components/auth/auth-shell";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const { locale } = await getDict();
  return (
    <AuthShell
      mode="recover"
      locale={locale}
      title="Вернём доступ к урокам"
      lead="Пришлём на почту ссылку для нового пароля. Уроки и материалы останутся на месте."
      formTitle="Забыли пароль?"
    >
      <ForgotPasswordForm />
      <p className={authNoteClass}>Вспомнили пароль? <Link className={authLinkClass} href="/login">Войти</Link></p>
    </AuthShell>
  );
}
