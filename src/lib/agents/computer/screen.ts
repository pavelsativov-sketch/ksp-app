import type { Page } from "playwright";

/**
 * Экран агента: снимок, размеры и разведка элементов.
 *
 * Всё, что агент знает о странице, приходит отсюда. Нам важно, чтобы модель
 * получала ровно то, на что потом кликает: если подпись элемента определена
 * по одной системе координат, а клик — по другой, агент подтвердит одно и
 * нажмёт другое.
 */

/** Размер вьюпорта: по нему модель предсказывает координаты. */
export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 800;

/** Нормализованная сетка координат: модель предсказывает 0–999. */
export const NORMALIZED_MAX = 999;

/**
 * Переводит нормализованную координату в пиксель экрана.
 *
 * Модель возвращает 0–999, а Playwright ждёт пиксели. Деление на 999, а не
 * на 1000: при 1000 крайний правый край экрана уезжал бы за вьюпорт.
 */
export function denormalize(value: number, screenSize: number): number {
  const clamped = Math.min(NORMALIZED_MAX, Math.max(0, Math.trunc(value)));
  return Math.round((clamped / NORMALIZED_MAX) * (screenSize - 1));
}

/** Переводит пиксель в нормализованную координату — для логов и проверок. */
export function normalize(value: number, screenSize: number): number {
  if (screenSize <= 1) return 0;
  const clamped = Math.min(screenSize - 1, Math.max(0, Math.trunc(value)));
  return Math.round((clamped / (screenSize - 1)) * NORMALIZED_MAX);
}

/** Что удалось узнать об элементе под точкой. */
export interface ElementProbe {
  /** Подпись: текст элемента и ближайших предков, до 200 символов. */
  label: string;
  /** Тег и роль — помогают понять, поле это или кнопка. */
  tag: string;
  type: string;
  /** Виден ли элемент пользователю. */
  visible: boolean;
}

/**
 * Разведка элемента под точкой.
 *
 * Возвращает пустую разведку, если страница недоступна: агент должен
 * получить «не знаю» и спросить, а не упасть с ошибкой в цикле.
 */
export async function probeElement(page: Page, x: number, y: number): Promise<ElementProbe> {
  try {
    const probe = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        if (!el) return { label: "", tag: "", type: "", visible: false };
        const parts: string[] = [];
        let node = el as HTMLElement | null;
        for (let i = 0; i < 4 && node; i++) {
          // Подниматься выше <body> нельзя: его innerText — это весь текст
          // страницы, и тогда любая кнопка на ней выглядит как «Отправить».
          // Агент кликает по пустому месту чаще, чем кажется, и без этой
          // остановки он получал бы подтверждение на каждый чих.
          const tag = node.tagName.toLowerCase();
          if (tag === "body" || tag === "html") break;
          const own = (
            node.innerText ||
            node.getAttribute("aria-label") ||
            node.getAttribute("title") ||
            (node as HTMLInputElement).value ||
            ""
          )
            .trim()
            .replace(/\s+/g, " ");
          if (own) parts.push(own);
          node = node.parentElement;
        }
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          label: parts.join(" | ").slice(0, 200),
          tag: el.tagName.toLowerCase(),
          type: (el.getAttribute("type") || "").toLowerCase(),
          visible:
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            rect.width > 0 &&
            rect.height > 0,
        };
      },
      [x, y] as [number, number],
    );
    return probe as ElementProbe;
  } catch {
    return { label: "", tag: "", type: "", visible: false };
  }
}

/** Текст страницы — для обнаружения попыток внедрения инструкций. */
export async function readPageText(page: Page): Promise<string> {
  try {
    const text = await page.evaluate(() => {
      const doc = document.body;
      return doc ? (doc.innerText || "").replace(/\s+/g, " ").slice(0, 8000) : "";
    });
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

/**
 * Список интерактивных элементов страницы.
 *
 * Одного снимка мало: проверено вживую — модель по картинке 1280×800
 * промахивалась мимо кнопок и кликала заголовок вместо нужного пункта
 * меню. Подпись элемента с его координатами даёт точность, которой на
 * пикселях не добиться: модель выбирает «Упражнения» из списка, а не
 * угадывает пиксель.
 *
 * Список ограничен 40 строками: длинный перебор переполняет контекст и
 * модель начинает путаться в нумерации.
 */
export const INTERACTABLES_SCRIPT = `(() => {
  const SEL = "a[href], button, input, textarea, select, [role=button], [onclick], summary, label";
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    if (rect.width < 8 || rect.height < 8) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.value || "")
      .replace(/\\s+/g, " ").trim().slice(0, 60);
    const cx = Math.round(((rect.left + rect.width / 2) / window.innerWidth) * 999);
    const cy = Math.round(((rect.top + rect.height / 2) / window.innerHeight) * 999);
    const kind = el.tagName.toLowerCase() === "input" ? "поле" : el.tagName.toLowerCase() === "a" ? "ссылка" : "кнопка";
    out.push(\`[\${out.length}] \${kind} (\${cx},\${cy}) \${text || "(без подписи)"}\`);
    if (out.length >= 40) break;
  }
  return out.join("\\n");
})()`;

/** Интерактивные элементы страницы как текст (пустая строка при ошибке). */
export async function readInteractables(page: Page): Promise<string> {
  try {
    const text = await page.evaluate(INTERACTABLES_SCRIPT);
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

/** Текущий адрес страницы; при ошибке — пустая строка. */
export async function currentUrl(page: Page): Promise<string> {
  try {
    return page.url();
  } catch {
    return "";
  }
}
