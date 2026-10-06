import Link from "next/link";
import s from "@/components/landing/landing.module.css";

export const metadata = { title: "Страница не найдена — Mekty" };

export default function NotFound() {
  return (
    <div className={s.landing}>
      <section className={`${s.shell} ${s.section}`} style={{ display: "grid", justifyItems: "center", textAlign: "center", paddingTop: "72px", paddingBottom: "96px" }}>
        <p className={s.kicker}>ОШИБКА 404</p>
        <h1 className={s.notFoundTitle}>Страница не найдена.<br /><span>Вернёмся к урокам?</span></h1>
        <p className={s.heroLead} style={{ marginTop: "18px" }}>Возможно, ссылка устарела или адрес введён с опечаткой.<br />Начните с главной — там всё на своих местах.</p>
        <div className={s.heroActions} style={{ marginTop: "26px" }}>
          <Link className={s.primary} href="/">На главную</Link>
          <Link className={s.secondary} href="/library">Библиотека</Link>
        </div>
      </section>
    </div>
  );
}
