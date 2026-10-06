import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminUserId } from "@/lib/admin/auth";
import { getPlanForUser, utcMonthWindow } from "@/lib/billing/quota";
import { effectivePlan } from "@/lib/billing/plans";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { Button } from "@/components/ui/button";
import { RedeemForm } from "@/app/redeem/redeem-form";
import { DeleteAccountForm, PasswordForm, ProfileNameForm } from "@/components/profile/account-forms";
import { ClassesManager } from "@/components/profile/classes-manager";
import { listCurrentClasses } from "@/lib/classes";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Профиль — Mekty" };

export default async function ProfilePage() {
  if (!isMongoConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="editorial-display text-3xl">Профиль недоступен</h1>
        <p className="mt-3 text-sm text-muted-foreground">Настройте MONGODB_URI в .env.local.</p>
      </div>
    );
  }
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");
  const { t } = await getDict();
  const pf = t.profile;

  // Сбой биллинга не должен ломать страницу: показываем урезанный профиль с кодом активации.
  let billing: Awaited<ReturnType<typeof getPlanForUser>> | null = null;
  let billingError = false;
  try {
    billing = await getPlanForUser(user.id);
  } catch {
    billingError = true;
  }
  const isPro = billingError ? false : effectivePlan({ plan: billing!.plan, plan_expires_at: billing!.expiresAt }) === "pro";

  // Дата последнего платежного события (для подсказки, откуда тариф).
  let redeemedAt: string | null = null;
  try {
    const db = await getDb();
    const { start } = utcMonthWindow();
    const events = await db
      .collection(COL.planEvents)
      .find({ user_id: user.id, event: { $in: ["activation_code_redeemed", "manual_pro_grant"] } })
      .sort({ created_at: -1 })
      .limit(1)
      .toArray();
    void start;
    const last = events[0] as { created_at?: Date } | undefined;
    redeemedAt = last?.created_at ? last.created_at.toLocaleDateString("ru-RU") : null;
  } catch {
    // некритично
  }

  const usedPercent =
    !billing || billing.kspRemaining === null
      ? 100
      : Math.min(100, Math.round((billing.kspUsedThisMonth / (billing.limits.kspPerMonth || 1)) * 100));

  // Классы и группы учителя — для привязки планов.
  const classes = await listCurrentClasses(user.id).catch(() => []);

  const imageLabel = !billing
    ? null
    : billing.imagesRemaining === null
      ? `Использовано ${billing.imagesUsedThisMonth} · без лимита`
      : `Использовано ${billing.imagesUsedThisMonth} из ${billing.limits.images}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
      <p className="editorial-kicker">{pf.kicker}</p>
      <h1 className="editorial-display mt-3 text-4xl">{pf.title}</h1>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">{user.fullName ?? "Учитель"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
          </div>
          <span
            className={
              isPro
                ? "rounded-full border border-brand-yellow bg-yellow-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-foreground"
                : "rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground"
            }
          >
            {isPro ? "Учитель Pro" : "Старт"}
          </span>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Квота КСП</dt>
            <dd className="mt-1 text-sm font-medium">
              {billing ? quotaLabel(billing) : "Временно недоступно"}
            </dd>
            {billing && (
              <div className="mt-2 h-2 rounded-full bg-muted">
                <div
                  className={isPro ? "h-2 rounded-full bg-brand-cyan" : "h-2 rounded-full bg-primary"}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
            )}
            {imageLabel && (
              <p className="mt-2 text-xs text-muted-foreground">Изображения: {imageLabel}</p>
            )}
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {isPro ? "Действует до" : "Тариф"}
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {billing
                ? isPro
                  ? (billing.expiresAt ? billing.expiresAt.toLocaleDateString("ru-RU") : "бессрочно")
                  : "Бесплатный"
                : "Неизвестен"}
            </dd>
            {redeemedAt && (
              <p className="mt-1 text-xs text-muted-foreground">Последняя активация кода: {redeemedAt}</p>
            )}
          </div>
        </dl>

        {billingError && (
          <p className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-xs text-[#a84023]">
            Не удалось загрузить данные тарифа. Попробуйте обновить страницу позже.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {isAdminUserId(user.id) && <Button asChild variant="outline"><Link href="/admin">Администрирование</Link></Button>}
          {!billing ? (
            <Button asChild variant="outline"><Link href="/pricing">О тарифах</Link></Button>
          ) : isPro ? (
            <Button asChild variant="outline"><Link href="/pricing">О тарифах</Link></Button>
          ) : (
            <>
              <Button asChild><Link href="/pricing">Улучшить до Pro</Link></Button>
              <Button asChild variant="outline"><Link href="/redeem">У меня есть код</Link></Button>
            </>
          )}
        </div>
      </section>

      {billing && !isPro && (
        <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <h2 className="editorial-display text-2xl">{pf.activateCode}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{pf.activateLead}</p>
          <div className="mt-5"><RedeemForm /></div>
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <ClassesManager classes={classes} />
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <h2 className="editorial-display text-2xl">{pf.settings}</h2>
        <div className="mt-5 space-y-6">
          <ProfileNameForm defaultName={user.fullName ?? ""} />
          <div className="border-t border-border pt-5"><PasswordForm /></div>
          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-semibold">{pf.myData}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{pf.myDataLead}</p>
            <Button asChild variant="outline" className="mt-3">
              <a href="/api/profile/export" download>{pf.downloadData}</a>
            </Button>
          </div>
          <div className="border-t border-border pt-5"><DeleteAccountForm /></div>
        </div>
      </section>
    </div>
  );
}

function quotaLabel(billing: Awaited<ReturnType<typeof getPlanForUser>>): string {
  if (billing.kspRemaining === null) {
    return `Использовано ${billing.kspUsedThisMonth} · без лимита`;
  }
  return `Использовано ${billing.kspUsedThisMonth} из ${billing.limits.kspPerMonth}`;
}
