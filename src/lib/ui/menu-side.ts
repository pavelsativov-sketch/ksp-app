/** Отступ от края экрана, ближе которого меню не подходит. */
const EDGE = 8;

/**
 * С какой стороны от кнопки раскрыть выпадающее меню шириной `width`.
 * Меню материалов прижато к правому краю кнопки и в левой колонке узкого окна
 * уходило за левый край экрана: тогда раскрываем его вправо от кнопки.
 */
export function menuSide(button: Pick<HTMLElement, "getBoundingClientRect">, width = 320): "left-0" | "right-0" {
  return button.getBoundingClientRect().right - width < EDGE ? "left-0" : "right-0";
}
