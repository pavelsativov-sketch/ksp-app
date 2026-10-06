'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  BarChart2,
  TrendingUp,
  BookOpen,
  School,
  Users,
  GraduationCap,
  ClipboardCheck,
  PenTool,
  Bot,
  History,
  Monitor,
  Link2,
  FileText,
  Settings,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Dict } from '@/lib/i18n/dictionaries';
import styles from './school-layout.module.css';

/** Компонент объявлен вне Sidebar: создание компонентов во время рендера
 * запрещено правилом react-hooks (каждый рендер давал бы новую сущность). */
function NavItem({ href, icon: Icon, label, pathname, onNavigate }: {
  href: string;
  icon: LucideIcon;
  label: string;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`${styles.navLink} ${active ? styles.active : ''}`}
      onClick={onNavigate}
    >
      <Icon className={styles.icon} />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ t }: { t: Dict }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <button
        className={`md:hidden absolute top-[18px] left-4 z-40 p-2 bg-surface border border-border rounded-md ${mobileOpen ? 'hidden' : 'block'}`}
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={20} />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={closeMobile}
        />
      )}

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ''}`}>
        <div className={styles.schoolHeader}>
          <div className="flex justify-between items-center">
            <h2 className={styles.schoolName}>Школа №25</h2>
            <button className="md:hidden" onClick={closeMobile}>
              <X size={20} className="text-muted-foreground" />
            </button>
          </div>
          <div className={styles.schoolSubtitle}>Костанайская область</div>
        </div>

        <nav className={styles.nav}>
          <NavItem href="/school" icon={Home} label={t.school.nav.home} pathname={pathname} onNavigate={closeMobile} />

          <div className={styles.section}>
            <div className={styles.sectionHeader}>{t.school.nav.analytics}</div>
            <NavItem href="/school/attendance" icon={BarChart2} label={t.school.nav.attendance} pathname={pathname} onNavigate={closeMobile} />
            <NavItem href="/school/quality" icon={TrendingUp} label={t.school.nav.quality} pathname={pathname} onNavigate={closeMobile} />
            <NavItem href="/school/curriculum" icon={BookOpen} label={t.school.nav.curriculum} pathname={pathname} onNavigate={closeMobile} />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>{t.school.nav.school}</div>
            <NavItem href="/school/classes" icon={School} label={t.school.nav.classes} pathname={pathname} onNavigate={closeMobile} />
            <NavItem href="/school/teachers" icon={Users} label={t.school.nav.teachers} pathname={pathname} onNavigate={closeMobile} />
            <NavItem href="/school/students" icon={GraduationCap} label={t.school.nav.students} pathname={pathname} onNavigate={closeMobile} />
          </div>

          <div className={styles.section}>
            <NavItem href="/school/vsk" icon={ClipboardCheck} label={t.school.nav.vsk} pathname={pathname} onNavigate={closeMobile} />
            <NavItem href="/plans/new" icon={PenTool} label={t.school.nav.ksp} pathname={pathname} onNavigate={closeMobile} />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>{t.school.nav.agents}</div>
            <NavItem href="/school/agents" icon={Bot} label={t.school.nav.tasks} pathname={pathname} onNavigate={closeMobile} />
            <NavItem href="/school/agents/history" icon={History} label={t.school.nav.history} pathname={pathname} onNavigate={closeMobile} />
          </div>

          <div className={styles.section}>
            <NavItem href="/school/workspace" icon={Monitor} label={t.school.nav.workspace} pathname={pathname} onNavigate={closeMobile} />
            <NavItem href="/school/connectors" icon={Link2} label={t.school.nav.connectors} pathname={pathname} onNavigate={closeMobile} />
            <NavItem href="/school/reports" icon={FileText} label={t.school.nav.reports} pathname={pathname} onNavigate={closeMobile} />
            <NavItem href="/school/settings" icon={Settings} label={t.school.nav.settings} pathname={pathname} onNavigate={closeMobile} />
          </div>
        </nav>
      </aside>
    </>
  );
}
