import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";

  return (
    <div className="mx-auto grid min-h-[calc(100vh-11rem)] max-w-[1200px] items-start px-4 py-16 md:px-6 md:py-24">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <p className="editorial-kicker">Новый пароль</p>
          <CardTitle className="editorial-display mt-3 text-3xl">Сброс пароля</CardTitle>
        </CardHeader>
        <CardContent>
          {sp.sent === "1" && !token && (
            <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Если такой email зарегистрирован, письмо со ссылкой отправлено.
            </p>
          )}
          <ResetPasswordForm token={token} />
          <p className="mt-6 text-sm text-[#5f5751]">
            <Link className="editorial-link font-semibold" href="/login">
              Вернуться ко входу
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}