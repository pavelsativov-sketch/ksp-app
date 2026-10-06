import type { Metadata } from "next";
import { Inter, Lora, Geist_Mono, Manrope, Nunito } from "next/font/google";
import Link from "next/link";
import { Menu } from "lucide-react";
import Image from "next/image";
import "./globals.css";
import { isMongoConfigured } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "./actions/auth";
import { SITE_NAME, SITE_DESCRIPTION, siteUrl } from "@/lib/site";
import { getDict } from "@/lib/i18n/server";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { ThemeToggle, themeScript } from "@/components/i18n/theme-toggle";
import { AnalyticsTracker } from "@/components/analytics/tracker";
import { HeaderScrollEffect } from "@/components/landing/header-scroll";
import { MarketingChrome } from "@/components/landing/marketing-chrome";
import { ToastProvider } from "@/components/ui/toast";
import { FirstRunOnboarding } from "@/components/onboarding/first-run";
import styles from "@/components/landing/site-chrome.module.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"], display: "swap" });
const lora = Lora({ variable: "--font-lora", subsets: ["latin", "cyrillic"], style: ["normal", "italic"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "cyrillic"], display: "swap" });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"], display: "swap" });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${SITE_NAME} — комплект к уроку за 5 минут`,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ru_RU",
    url: "/",
    title: `${SITE_NAME} — комплект к уроку за 5 минут`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — комплект к уроку за 5 минут`,
    description: SITE_DESCRIPTION,
  },
};

const navClass = styles.navLink;
const accountClass = styles.signup;
const logoutClass = styles.logout;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const configured = isMongoConfigured();
  const user = await getCurrentUser();
  const { locale, t } = await getDict();
  const authed = user ? <><Link className={navClass} href="/profile">{t.nav.profile}</Link><Link className={navClass} href="/school">{t.school.nav.school}</Link><Link className={navClass} href="/dashboard">{t.nav.plans}</Link><Link className={navClass} href="/kits">{t.nav.kits}</Link><Link className={navClass} href="/templates">{t.nav.templates}</Link><Link className={navClass} href="/textbooks">{t.nav.materials}</Link><form action={logoutAction}><button className={logoutClass} type="submit">{t.nav.logout}</button></form></> : <><Link className={navClass} href="/login">{t.nav.login}</Link><Link className={accountClass} href="/register">{t.nav.register}</Link></>;

  const demoBanner = !configured && (
    <div className="border-b border-[#dbc7a7] bg-[#f8eedc] px-4 py-2 text-center text-sm text-[#745329] no-print">
      {t.demoBanner} <code className="font-mono">MONGODB_URI</code> {t.demoBannerIn} <code className="font-mono">.env.local</code>.
    </div>
  );

  const header = (
    <header className={`${styles.header} no-print`}>
      <div className={styles.headerInner}>
        <Link href="/" aria-label={t.nav.home} className={styles.brand}>
          <span className={styles.brandIcon}><Image src="/mekty-icon.svg" alt="" width={44} height={44} /></span>
          <span className={styles.brandCopy}>
            <span className={styles.brandName}>Mekty</span>
            <span className={styles.tagline}>{t.brand.tagline}</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher locale={locale} />
          <ThemeToggle />
        </div>
        <nav aria-label={t.nav.main} className={styles.desktopNav}>
          <Link className={navClass} href="/library">{t.nav.library}</Link>
          <Link className={navClass} href="/pricing">{t.nav.pricing}</Link>
          {authed}
        </nav>
        <details className={styles.mobileMenu}>
          <summary aria-label={t.nav.menu} className={styles.menuToggle}><Menu aria-hidden="true" size={21} /></summary>
          <nav aria-label={t.nav.mobile} className={styles.mobileNav}>
            <LocaleSwitcher locale={locale} />
            <ThemeToggle />
            <Link className={navClass} href="/library">{t.nav.library}</Link>
            <Link className={navClass} href="/pricing">{t.nav.pricing}</Link>
            {authed}
          </nav>
        </details>
      </div>
    </header>
  );

  const footer = (
    <footer className={`${styles.footer} no-print`}>
      <div className={styles.footerInner}>
        <div className={styles.footerIdentity}>
          <Link href="/" aria-label={t.nav.home} className={styles.brand}>
            <span className={styles.brandIcon}><Image src="/mekty-icon.svg" alt="" width={44} height={44} /></span>
            <span className={styles.brandName}>Mekty</span>
          </Link>
          <p className={styles.footerDescription}>{t.footer.descriptionA}<br />{t.footer.descriptionB}</p>
        </div>
        <nav aria-label={t.nav.footerNav} className={styles.footerNav}>
          <Link href="/library" className={navClass}>{t.nav.library}</Link>
          <Link href="/pricing" className={navClass}>{t.nav.pricing}</Link>
          <Link href="/login" className={navClass}>{t.nav.login}</Link>
        </nav>
      </div>
    </footer>
  );

  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning className={`${inter.variable} ${lora.variable} ${geistMono.variable} ${manrope.variable} ${nunito.variable} h-full antialiased`}>
      <head>
        {/* Тема применяется до первой отрисовки — иначе при перезагрузке
            страница на мгновение показывается светлой. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <LocaleProvider initialLocale={locale}>
        <ToastProvider>
          <AnalyticsTracker />
          <HeaderScrollEffect />
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3">{t.skip}</a>
          {/* Внутри /school маркетинговый хедер и футер не рендерятся: там
              своя оболочка на весь экран (см. app/school/layout.tsx). */}
          <MarketingChrome
            chrome={<>{demoBanner}{header}</>}
            content={<main id="main-content" tabIndex={-1} className="w-full flex-1">{children}</main>}
            footer={footer}
          />
          {user && <FirstRunOnboarding />}
        </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
