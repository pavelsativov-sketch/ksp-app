import Link from "next/link";
import type { ReactNode } from "react";
import { FileText, Layers, Presentation } from "lucide-react";
import { ThreeStage } from "@/components/three/three-stage";
import s from "./auth.module.css";

type Mode = "login" | "register" | "recover";

const COPY = {
  ru: {
    login: "Вход",
    register: "Регистрация",
    switchLabel: "Вход или регистрация",
    perks: [
      { icon: FileText, text: "КСП по ГОСО за пару минут: цели, ход урока, оценивание" },
      { icon: Layers, text: "Рабочий лист, карточки и лист ООП собираются вместе с уроком" },
      { icon: Presentation, text: "Word и презентация с теми же заданиями и баллами" },
    ],
  },
  kk: {
    login: "Кіру",
    register: "Тіркелу",
    switchLabel: "Кіру немесе тіркелу",
    perks: [
      { icon: FileText, text: "МЖМБС бойынша ҚМЖ бірнеше минутта: мақсат, сабақ барысы, бағалау" },
      { icon: Layers, text: "Жұмыс парағы, карточкалар және ЕБҚ парағы сабақпен бірге жасалады" },
      { icon: Presentation, text: "Word және презентация сол тапсырмалар мен балдармен" },
    ],
  },
} as const;

/**
 * Общая сцена входа, регистрации и восстановления: слева лавандовая панель с
 * роботом и тем, что получит учитель, справа форма. На телефоне панель сжимается
 * в шапку, чтобы форма была видна без прокрутки.
 */
export function AuthShell({ mode, locale, title, lead, formTitle, children }: { mode: Mode; locale: "ru" | "kk"; title: string; lead: string; formTitle: string; children: ReactNode }) {
  const t = COPY[locale];
  return (
    <div className={s.stage}>
      <div className={s.card}>
        <aside className={s.art}>
          <div className={s.robot} aria-hidden="true"><ThreeStage scene="robot" className={s.fill} /></div>
          <div className={s.artCopy}>
            <h1 className={s.title}>{title}</h1>
            <p className={s.lead}>{lead}</p>
          </div>
          <ul className={s.perks}>
            {t.perks.map(({ icon: Icon, text }) => (
              <li key={text}><span aria-hidden="true"><Icon /></span>{text}</li>
            ))}
          </ul>
        </aside>
        <section className={s.panel} aria-labelledby="auth-form-title">
          {mode !== "recover" && (
            <nav className={s.switch} aria-label={t.switchLabel}>
              <Link href="/login" aria-current={mode === "login" ? "page" : undefined}>{t.login}</Link>
              <Link href="/register" aria-current={mode === "register" ? "page" : undefined}>{t.register}</Link>
              <span className={s.switchThumb} data-mode={mode} aria-hidden="true" />
            </nav>
          )}
          <h2 id="auth-form-title" className={s.formTitle}>{formTitle}</h2>
          {children}
        </section>
      </div>
    </div>
  );
}

export const authLinkClass = s.link;
export const authNoteClass = s.note;
