import s from "./loading.module.css";

/**
 * Экран загрузки любой страницы: Next показывает его сразу после клика, пока сервер
 * готовит страницу. Без него старая страница стояла неподвижно по нескольку секунд,
 * и казалось, что сайт «думает» или завис.
 */
export default function Loading() {
  return (
    <div className={s.wrap} role="status" aria-live="polite">
      <div className={s.banner} aria-hidden="true">
        <div className={s.bannerLines}><span /><span /><span /></div>
      </div>
      <p className={s.label}>
        Открываем страницу
        <span className={s.dots} aria-hidden="true"><i /><i /><i /></span>
      </p>
      <div className={s.grid} aria-hidden="true">
        <div className={s.card} />
        <div className={s.card} />
        <div className={s.card} />
        <div className={`${s.card} ${s.wide}`} />
      </div>
    </div>
  );
}
