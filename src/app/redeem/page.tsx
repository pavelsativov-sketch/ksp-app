import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RedeemForm } from "./redeem-form";

export const metadata = { title: "Активация кода — Mekty" };

export default async function RedeemPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/redeem");

  return (
    <div className="mx-auto max-w-md px-4 py-16 md:py-20">
      <p className="editorial-kicker">Тарифы</p>
      <h1 className="editorial-display mt-3 text-4xl">Активация кода</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Введите код, полученный после оплаты, чтобы включить тариф «Учитель Pro».
      </p>
      <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-card">
        <RedeemForm />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Ещё нет кода?{" "}
        <Link href="/pricing" className="editorial-link">Посмотреть тарифы</Link>
      </p>
    </div>
  );
}
