// Minimal RU/KZ dictionary for the most user-visible chrome strings.
// We localize the navigation, footer, primary CTAs and a handful of
// page-level labels — the rest of the UI (TipTap toolbar tooltips,
// pedagogical terms like "формативное оценивание", interactive task
// types, etc.) stays in Russian for now since those are domain-specific
// terms used across all languages of instruction in KZ schools.

export type Locale = "ru" | "kz";

export const LOCALE_STORAGE_KEY = "ksp.locale";

type Dict = Record<string, { ru: string; kz: string }>;

export const dict = {
  // Header / nav
  "nav.library": { ru: "Библиотека", kz: "Кітапхана" },
  "nav.myPlans": { ru: "Мои КСП", kz: "Менің ҚМЖ" },
  "nav.settings": { ru: "Настройки", kz: "Баптаулар" },
  "nav.logout": { ru: "Выйти", kz: "Шығу" },
  "nav.login": { ru: "Войти", kz: "Кіру" },
  "nav.register": { ru: "Регистрация", kz: "Тіркелу" },

  // Footer
  "footer.tagline": {
    ru: "КСП.app · Инструмент для учителей · Обновлённое содержание РК",
    kz: "ҚМЖ.app · Мұғалімдерге арналған құрал · ҚР жаңартылған мазмұн",
  },

  // Dashboard
  "dashboard.title": { ru: "Мои КСП", kz: "Менің ҚМЖ" },
  "dashboard.create": { ru: "Создать новый КСП", kz: "Жаңа ҚМЖ құру" },
  "dashboard.empty": {
    ru: "Пока нет планов. Создайте первый!",
    kz: "Әзірге жоспар жоқ. Біріншісін жасаңыз!",
  },
  "dashboard.series": { ru: "Серии уроков", kz: "Сабақтар сериясы" },
  "dashboard.lessonsCount": { ru: "уроков", kz: "сабақ" },

  // Library
  "library.title": { ru: "Библиотека КСП", kz: "ҚМЖ кітапханасы" },
  "library.search": {
    ru: "Поиск по названию, теме, целям, ходу урока…",
    kz: "Атауы, тақырыбы, мақсаттары, сабақ барысы бойынша іздеу…",
  },

  // Plan view
  "plan.history": { ru: "История", kz: "Тарих" },
  "plan.print": { ru: "PDF / печать", kz: "PDF / басып шығару" },
  "plan.docx": { ru: "Word", kz: "Word" },
  "plan.zip": { ru: "Скачать .zip", kz: ".zip жүктеу" },
  "plan.edit": { ru: "Редактировать", kz: "Өңдеу" },
  "plan.allInSeries": { ru: "Все уроки серии", kz: "Серияның барлық сабақтары" },

  // Settings
  "settings.title": { ru: "Настройки", kz: "Баптаулар" },
  "settings.profile": { ru: "Профиль учителя", kz: "Мұғалім профилі" },
  "settings.locale": { ru: "Язык интерфейса", kz: "Интерфейс тілі" },
  "settings.save": { ru: "Сохранить", kz: "Сақтау" },
  "settings.saved": { ru: "Сохранено", kz: "Сақталды" },

  // Forms
  "form.fullName": { ru: "ФИО", kz: "Аты-жөні" },
  "form.school": { ru: "Школа", kz: "Мектеп" },
  "form.city": { ru: "Город", kz: "Қала" },
  "form.defaultGrade": { ru: "Класс по умолчанию", kz: "Әдепкі сынып" },
} satisfies Dict;

export type DictKey = keyof typeof dict;

export function t(key: DictKey, locale: Locale): string {
  return dict[key][locale] ?? dict[key].ru;
}
