import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { RegisterForm } from "./form";

export default async function RegisterPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Регистрация</CardTitle>
        </CardHeader>
        <CardContent>
          <RegisterForm />
          <p className="text-sm text-slate-500 mt-6 text-center">
            Уже есть аккаунт?{" "}
            <Link className="text-blue-600 hover:underline" href="/login">
              Войти
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
