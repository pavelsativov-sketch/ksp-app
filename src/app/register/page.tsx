import Link from "next/link";
import { RegisterForm } from "./form";
import { getDict } from "@/lib/i18n/server";
import { AuthShell, authLinkClass, authNoteClass } from "@/components/auth/auth-shell";

export default async function RegisterPage() {
  const { locale } = await getDict();
  return (
    <AuthShell
      mode="register"
      locale={locale}
      title="Первый урок готов через пару минут"
      lead="Один аккаунт: уроки, материалы и презентации сохраняются и открываются с любого устройства."
      formTitle="Создайте аккаунт"
    >
      <RegisterForm />
      <p className={authNoteClass}>Уже есть аккаунт? <Link className={authLinkClass} href="/login">Войти</Link></p>
    </AuthShell>
  );
}
