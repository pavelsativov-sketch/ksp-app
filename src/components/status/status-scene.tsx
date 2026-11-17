import Link from "next/link";
import type { ReactNode } from "react";
import s from "./status-scene.module.css";

/** Самолётик и пунктир летят по одной кривой: координаты общие для SVG и offset-path. */
const FLIGHT = "M 10 170 C 130 40, 250 230, 380 110 S 600 30, 710 120";

function LostPage() {
  return (
    <div className={s.scene} aria-hidden="true">
      <svg className={s.trail} width="720" height="220" viewBox="0 0 720 220">
        <path d={FLIGHT} />
      </svg>
      <span className={s.plane}>
        <svg viewBox="0 0 24 24" width="34" height="34"><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4Z" /></svg>
      </span>
      <div className={s.digits}>
        <span>4</span>
        <span className={s.orb}><i /><i /><b /></span>
        <span>4</span>
      </div>
    </div>
  );
}

function Unplugged() {
  return (
    <div className={`${s.scene} ${s.sceneSmall}`} aria-hidden="true">
      <svg className={s.plug} width="340" height="150" viewBox="0 0 340 150">
        <path className={s.cable} d="M0 92 C 40 92, 60 70, 110 75" />
        <g className={s.plugHead}>
          <rect x="104" y="58" width="52" height="34" rx="9" />
          <path d="M156 66h16M156 84h16" />
        </g>
        <g className={s.socket}>
          <rect x="190" y="52" width="52" height="46" rx="10" />
          <path d="M202 66h10M202 84h10" />
        </g>
        <path className={s.cable} d="M242 75 C 280 80, 300 100, 340 96" />
        <g className={s.spark}>
          <path d="M181 50l-4-14M181 104l-4 14M172 56l-12-8M172 96l-12 8" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Страницы «не найдено» и «не удалось открыть»: одна сцена с движением вместо
 * голого текста. Анимация только декоративная и выключается при reduced-motion.
 */
export function StatusScene({ kind, title, lead, children, code }: { kind: "not-found" | "error"; title: string; lead: string; children: ReactNode; code?: string }) {
  return (
    <section className={s.wrap} role={kind === "error" ? "alert" : undefined}>
      {kind === "not-found" ? <LostPage /> : <Unplugged />}
      <h1 className={s.title}>{title}</h1>
      <p className={s.lead}>{lead}</p>
      <div className={s.actions}>{children}</div>
      {code && <p className={s.code}>Код ошибки для поддержки: {code}</p>}
    </section>
  );
}

export function StatusLink({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  return <Link href={href} className={primary ? s.primary : s.secondary}>{children}</Link>;
}

export const statusButtonClass = s.primary;
