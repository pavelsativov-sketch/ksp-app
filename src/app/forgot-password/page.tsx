import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-11rem)] max-w-[1200px] items-start px-4 py-16 md:px-6 md:py-24">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <p className="editorial-kicker">Восстановление доступа</p>
          <CardTitle className="editorial-display mt-3 text-3xl">Забыли пароль?</CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
          <p className="mt-6 text-sm text-[#5f5751]">
            Вспомнили пароль?{" "}
            <Link className="editorial-link font-semibold" href="/login">
              Войти
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}