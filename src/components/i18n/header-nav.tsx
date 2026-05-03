"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/use-locale";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "./locale-switcher";
import { logoutAction } from "@/app/actions/auth";

export function HeaderNav({ userEmail }: { userEmail: string | null }) {
  const t = useT();
  return (
    <nav className="flex items-center gap-4 text-sm">
      <Link className="hover:underline" href="/library">
        {t("nav.library")}
      </Link>
      {userEmail ? (
        <>
          <Link className="hover:underline" href="/dashboard">
            {t("nav.myPlans")}
          </Link>
          <Link className="hover:underline text-slate-600" href="/settings">
            {t("nav.settings")}
          </Link>
          <span className="text-slate-500 hidden md:inline">{userEmail}</span>
          <LocaleSwitcher />
          <form action={logoutAction}>
            <Button variant="outline" size="sm" type="submit">
              {t("nav.logout")}
            </Button>
          </form>
        </>
      ) : (
        <>
          <LocaleSwitcher />
          <Link className="hover:underline" href="/login">
            {t("nav.login")}
          </Link>
          <Button asChild size="sm">
            <Link href="/register">{t("nav.register")}</Link>
          </Button>
        </>
      )}
    </nav>
  );
}

export function FooterTagline() {
  const t = useT();
  return <>{t("footer.tagline")}</>;
}
