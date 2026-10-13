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
        const el = document.elementFromPoint(px, py) as HTMLElement | null;
        if (!el) return { label: "", tag: "", type: "", visible: false };

        // Убираем target="_blank", чтобы клики по 3 кнопкам дэшборда BilimClass
        // открывали КТП / Журнал / Журнал урока в этом же окне браузера.
        const blankLink = el.closest('a[target="_blank"]');
        if (blankLink) blankLink.removeAttribute("target");

        // Специальная разведка карточек дэшборда и журнала BilimClass
        const bcBlock = el.closest(".v-dashboard-schedule-block");
        if (bcBlock) {
          const cls = (bcBlock.querySelector(".v-dashboard-schedule-block__label.ol-upper") as HTMLElement | null)?.innerText?.trim() || "";
          const fields = Array.from(bcBlock.querySelectorAll(".v-dashboard-schedule-block__field")) as HTMLElement[];
          const statusField = fields.find((f) => /статус|мәртебесі/i.test(f.innerText || ""));
          const status = (statusField?.innerText || "").replace(/\s+/g, " ").trim();
          let day = "";
          const col = bcBlock.closest(".v-dashboard-schedule__col");
          const row = bcBlock.closest(".v-dashboard-schedule__row");
          const wrapper = bcBlock.closest(".v-dashboard-schedule__wrapper");
          if (col && row && wrapper) {
            const cols = Array.from(row.querySelectorAll(":scope > .v-dashboard-schedule__col"));
            const idx = cols.indexOf(col);
            const headCols = wrapper.querySelectorAll(".v-dashboard-schedule__head > .v-dashboard-schedule__col");
            if (idx >= 0 && headCols[idx]) {
              day = ((headCols[idx] as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
            }
          }
          const prefix = `[${[cls, day, status].filter(Boolean).join(" | ")}]`;
          const link = el.closest("a[href]");
          const href = link ? link.getAttribute("href") || "" : "";
          const icon =
            (el.querySelector("svg[data-icon-name]") || el.closest("button, a")?.querySelector("svg[data-icon-name]"))?.getAttribute(
              "data-icon-name",
            ) || "";

          let bcLabel = "";
          if (href.includes("/backoffice/ktp/") || icon === "list-alt") {
            bcLabel = `${prefix} Кнопка 1: Перейти в КТП`;
          } else if (href.includes("/control/journal/groups/") || icon === "menu-book") {
            bcLabel = `${prefix} Кнопка 2: Перейти в журнал (оценки и проведение)`;
          } else if ((href.includes("/schedule/") && href.includes("/lesson/")) || icon === "high-school") {
            bcLabel = `${prefix} Кнопка 3: Перейти в журнал урока`;
          } else if (icon.includes("home")) {
            bcLabel = `${prefix} Домашнее задание`;
          }

          if (bcLabel) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return {
              label: bcLabel.slice(0, 200),
              tag: link ? "a" : el.tagName.toLowerCase(),
              type: (el.getAttribute("type") || "").toLowerCase(),
              visible: style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0,
            };
          }
        }

        const journalCol = el.closest(".v-journal-page__table-column");
        if (journalCol) {
          const dateText = ((journalCol.querySelector(".v-journal-page__table-label-date") as HTMLElement | null)?.innerText || "")
            .replace(/\s+/g, " ")
            .trim();
          const sorText = ((journalCol.querySelector(".v-journal-page__table-label-summative") as HTMLElement | null)?.innerText || "")
            .replace(/\s+/g, " ")
            .trim();
          const tagDate = [dateText, sorText].filter(Boolean).join(" ") || "дату";
          if (el.closest(".v-jp__label-status--conduct")) {
            return {
              label: `Провести урок (отметка проведения в журнале за ${tagDate})`,
              tag: "button",
              type: "button",
              visible: true,
            };
          }
          if (el.closest(".v-jp__label-status--conducted")) {
            return {
              label: `Урок уже проведен (за ${tagDate})`,
              tag: "div",
              type: "",
              visible: true,
            };
          }
        }

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
 * Для BilimClass распознаёт карточки предметов на странице «Дэшборд учителя»
 * (.v-dashboard-schedule-block) и подписывает все 3 кнопки над каждым предметом
 * (1 — КТП, 2 — Журнал оценок и проведения, 3 — Журнал урока), а также иконки
 * проведения урока в шапке сводного журнала (.v-jp__label-status--conduct).
 */
export const INTERACTABLES_SCRIPT = `(() => {
  const isBilim = /(^|\\.)bilimclass\\.kz$/i.test(location.hostname);
  if (isBilim) {
    document.querySelectorAll('a[href][target="_blank"]').forEach((a) => a.removeAttribute("target"));
    document.querySelectorAll(".v-feedback-wishes-promo, .v-tour").forEach((el) => el.remove());
    if (/\\/lesson\\/[^/]+\\/journal/i.test(location.pathname) && window.scrollY < 40) {
      const conductBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        /провести\\s+урок|сабақты\\s+өткізу/i.test(b.innerText || "")
      );
      if (conductBtn) {
        const cr = conductBtn.getBoundingClientRect();
        if (cr.bottom > window.innerHeight) {
          window.scrollBy(0, Math.min(600, Math.round(cr.bottom - window.innerHeight + 80)));
        }
      }
    }
  }

  const SEL = "a[href], button, input, textarea, select, [role=button], [onclick], summary, label, .v-jp__label-status--conduct, .v-jp__label-status--conducted";
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const tag = el.tagName.toLowerCase();
    // Не дублируем <button>, вложенный внутрь <a href> (как в 3 кнопках карточек BilimClass)
    if (tag === "button" && el.closest("a[href]")) continue;

    // В свёрнутом левом меню BilimClass (.spa-app__left-menu.is-hide) текстовые ссылки перекрыты страницей
    if (
      isBilim &&
      el.closest(".spa-app__left-menu.is-hide") &&
      !el.classList.contains("spa-app__left-menu-close") &&
      el.getAttribute("data-tour") !== "toggleLeftMenu"
    ) {
      continue;
    }

    // Не засоряем список соцсетями и подвалом BilimClass
    if (isBilim && tag === "a") {
      const rawHref = el.getAttribute("href") || "";
      if (/youtube\\.com|instagram\\.com|t\\.me|zero\\.kz|^mailto:|bilimland\\.kz.*agreement|thank-you-page/i.test(rawHref)) {
        continue;
      }
    }

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    if (rect.width < 8 || rect.height < 8) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

    let text = "";
    const bcBlock = isBilim ? el.closest(".v-dashboard-schedule-block") : null;
    const journalCol = isBilim ? el.closest(".v-journal-page__table-column") : null;

    if (bcBlock) {
      const cls = (bcBlock.querySelector(".v-dashboard-schedule-block__label.ol-upper")?.innerText || "").trim();
      const fields = Array.from(bcBlock.querySelectorAll(".v-dashboard-schedule-block__field"));
      const statusField = fields.find((f) => /статус|мәртебесі/i.test(f.innerText || ""));
      const status = (statusField?.innerText || "").replace(/\\s+/g, " ").trim();
      let day = "";
      const col = bcBlock.closest(".v-dashboard-schedule__col");
      const row = bcBlock.closest(".v-dashboard-schedule__row");
      const wrapper = bcBlock.closest(".v-dashboard-schedule__wrapper");
      if (col && row && wrapper) {
        const cols = Array.from(row.querySelectorAll(":scope > .v-dashboard-schedule__col"));
        const idx = cols.indexOf(col);
        const headCols = wrapper.querySelectorAll(".v-dashboard-schedule__head > .v-dashboard-schedule__col");
        if (idx >= 0 && headCols[idx]) {
          day = (headCols[idx].innerText || "").replace(/\\s+/g, " ").trim();
        }
      }
      const prefix = \`[\${[cls, day, status].filter(Boolean).join(" | ")}]\`;
      const href = el.getAttribute("href") || el.closest("a[href]")?.getAttribute("href") || "";
      const icon = el.querySelector("svg[data-icon-name]")?.getAttribute("data-icon-name") || "";
      if (href.includes("/backoffice/ktp/") || icon === "list-alt") {
        text = \`\${prefix} Кнопка 1: Перейти в КТП\`;
      } else if (href.includes("/control/journal/groups/") || icon === "menu-book") {
        text = \`\${prefix} Кнопка 2: Перейти в журнал (оценки и проведение)\`;
      } else if ((href.includes("/schedule/") && href.includes("/lesson/")) || icon === "high-school") {
        text = \`\${prefix} Кнопка 3: Перейти в журнал урока\`;
      } else if (icon.includes("home")) {
        text = \`\${prefix} Домашнее задание\`;
      }
    } else if (journalCol) {
      const dateText = (journalCol.querySelector(".v-journal-page__table-label-date")?.innerText || "").replace(/\\s+/g, " ").trim();
      const sorText = (journalCol.querySelector(".v-journal-page__table-label-summative")?.innerText || "").replace(/\\s+/g, " ").trim();
      const tagDate = [dateText, sorText].filter(Boolean).join(" ") || "дату";
      if (el.classList.contains("v-jp__label-status--conduct") || el.closest(".v-jp__label-status--conduct")) {
        text = \`Провести урок (отметка проведения в журнале за \${tagDate})\`;
      } else if (el.classList.contains("v-jp__label-status--conducted") || el.closest(".v-jp__label-status--conducted")) {
        text = \`Урок уже проведен (за \${tagDate})\`;
      } else if (el.classList.contains("v-jp__table-multiset-butt") || el.closest(".v-jp__table-multiset-butt")) {
        text = \`Массовое выставление за \${tagDate}\`;
      }
    } else if (isBilim && (el.classList.contains("spa-app__left-menu-close") || el.getAttribute("data-tour") === "toggleLeftMenu")) {
      text = "Меню навигации BilimClass (развернуть/свернуть)";
    }

    if (!text) {
      text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.value || "")
        .replace(/\\s+/g, " ")
        .trim()
        .slice(0, 60);
    } else {
      text = text.slice(0, 110);
    }

    const cx = Math.round(((rect.left + rect.width / 2) / window.innerWidth) * 999);
    const cy = Math.round(((rect.top + rect.height / 2) / window.innerHeight) * 999);
    const kind = tag === "input" ? "поле" : tag === "a" ? "ссылка" : "кнопка";
    out.push(\`[\${out.length}] \${kind} (\${cx},\${cy}) \${text || "(без подписи)"}\`);
    if (out.length >= 45) break;
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
