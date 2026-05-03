import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/profile/profile-form";
import { getMyProfile } from "@/app/actions/profile";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const profile = await getMyProfile();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Настройки</h1>
          <p className="text-slate-500 text-sm">
            Профиль учителя — школа, ФИО, класс. Эти поля будут автоматически
            подставляться в шапку каждого нового КСП.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">К моим КСП</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Профиль учителя</CardTitle>
          <CardDescription>
            Сохранённые данные подставляются в новые КСП и не отправляются никуда,
            кроме вашей собственной БД.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm initial={profile} email={user.email ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
