// RU/KZ dictionary covering the user-facing chrome of the app.
// Pedagogical / domain terms (формативное оценивание, критерии оценивания,
// дескрипторы, кумулятивная беседа, этапы урока) intentionally stay in
// Russian — these are the official KZ Ministry of Education terms used
// across all languages of instruction.

export type Locale = "ru" | "kz";

export const LOCALE_STORAGE_KEY = "ksp.locale";

type Dict = Record<string, { ru: string; kz: string }>;

export const dict = {
  // ─── Header / nav ────────────────────────────────────────────────
  "nav.library": { ru: "Библиотека", kz: "Кітапхана" },
  "nav.myPlans": { ru: "Мои КСП", kz: "Менің ҚМЖ" },
  "nav.settings": { ru: "Настройки", kz: "Баптаулар" },
  "nav.logout": { ru: "Выйти", kz: "Шығу" },
  "nav.login": { ru: "Войти", kz: "Кіру" },
  "nav.register": { ru: "Регистрация", kz: "Тіркелу" },

  // ─── Footer ──────────────────────────────────────────────────────
  "footer.tagline": {
    ru: "КСП.app · Инструмент для учителей · Обновлённое содержание РК",
    kz: "ҚМЖ.app · Мұғалімдерге арналған құрал · ҚР жаңартылған мазмұн",
  },

  // ─── Dashboard ───────────────────────────────────────────────────
  "dashboard.title": { ru: "Мои КСП", kz: "Менің ҚМЖ" },
  "dashboard.create": { ru: "Создать новый КСП", kz: "Жаңа ҚМЖ құру" },
  "dashboard.empty": {
    ru: "Пока нет планов. Создайте первый!",
    kz: "Әзірге жоспар жоқ. Біріншісін жасаңыз!",
  },
  "dashboard.series": { ru: "Серии уроков", kz: "Сабақтар сериясы" },
  "dashboard.lessonsCount": { ru: "уроков", kz: "сабақ" },

  // ─── Library ─────────────────────────────────────────────────────
  "library.title": { ru: "Библиотека КСП", kz: "ҚМЖ кітапханасы" },
  "library.search": {
    ru: "Поиск по названию, теме, целям, ходу урока…",
    kz: "Атауы, тақырыбы, мақсаттары, сабақ барысы бойынша іздеу…",
  },
  "library.noResults": { ru: "Ничего не найдено", kz: "Ештеңе табылмады" },

  // ─── Plan view (top-bar buttons) ─────────────────────────────────
  "plan.history": { ru: "История", kz: "Тарих" },
  "plan.print": { ru: "PDF / печать", kz: "PDF / басып шығару" },
  "plan.docx": { ru: "Word", kz: "Word" },
  "plan.zip": { ru: "Скачать .zip", kz: ".zip жүктеу" },
  "plan.edit": { ru: "Редактировать", kz: "Өңдеу" },
  "plan.delete": { ru: "Удалить", kz: "Жою" },
  "plan.duplicate": { ru: "Создать копию", kz: "Көшірме жасау" },
  "plan.allInSeries": { ru: "Все уроки серии", kz: "Серияның барлық сабақтары" },

  // ─── Plan view (section titles) ──────────────────────────────────
  "plan.section.objectives": { ru: "Цели обучения", kz: "Оқу мақсаттары" },
  "plan.section.lessonObjectives": { ru: "Цели урока", kz: "Сабақ мақсаттары" },
  "plan.section.criteria": { ru: "Критерии оценивания", kz: "Бағалау критерийлері" },
  "plan.section.pointsScale": {
    ru: "Шкала оценивания за урок (10 баллов)",
    kz: "Сабақ ішіндегі бағалау шкаласы (10 балл)",
  },
  "plan.section.langGoals": { ru: "Языковые цели", kz: "Тілдік мақсаттар" },
  "plan.section.values": { ru: "Привитие ценностей", kz: "Құндылықтарды дарыту" },
  "plan.section.crossCurr": { ru: "Межпредметные связи", kz: "Пәнаралық байланыстар" },
  "plan.section.priorKnowledge": {
    ru: "Предшествующие знания",
    kz: "Алдыңғы білімдер",
  },
  "plan.section.flow": { ru: "Ход урока", kz: "Сабақ барысы" },
  "plan.section.evaluation": {
    ru: "Оценивание и рефлексия",
    kz: "Бағалау және рефлексия",
  },

  // Plan stages
  "plan.stage.beginning": { ru: "Начало урока", kz: "Сабақтың басы" },
  "plan.stage.middle": { ru: "Середина урока", kz: "Сабақтың ортасы" },
  "plan.stage.end": { ru: "Конец урока", kz: "Сабақтың аяғы" },

  // Stage subblocks
  "stage.keyQuestions": { ru: "Ключевые вопросы", kz: "Кілт сұрақтары" },
  "stage.descriptors": { ru: "Дескрипторы оценивания", kz: "Бағалау дескрипторлары" },
  "stage.assessmentMethod": { ru: "Метод оценивания", kz: "Бағалау әдісі" },
  "stage.summary": { ru: "Итог урока", kz: "Сабақ қорытындысы" },
  "stage.reflection": { ru: "Рефлексия", kz: "Рефлексия" },
  "stage.homework": { ru: "Домашнее задание", kz: "Үй тапсырмасы" },
  "stage.tasks": { ru: "Интерактивные задания", kz: "Интерактивті тапсырмалар" },

  // ─── Settings ────────────────────────────────────────────────────
  "settings.title": { ru: "Настройки", kz: "Баптаулар" },
  "settings.profile": { ru: "Профиль учителя", kz: "Мұғалім профилі" },
  "settings.locale": { ru: "Язык интерфейса", kz: "Интерфейс тілі" },
  "settings.localeHint": {
    ru: "Эту настройку приложение будет использовать на всех ваших устройствах.",
    kz: "Бұл баптауды қосымша барлық құрылғыларыңызда қолданады.",
  },
  "settings.save": { ru: "Сохранить", kz: "Сақтау" },
  "settings.saved": { ru: "Сохранено", kz: "Сақталды" },

  // ─── Form labels ─────────────────────────────────────────────────
  "form.fullName": { ru: "ФИО", kz: "Аты-жөні" },
  "form.school": { ru: "Школа", kz: "Мектеп" },
  "form.city": { ru: "Город", kz: "Қала" },
  "form.defaultGrade": { ru: "Класс по умолчанию", kz: "Әдепкі сынып" },
  "form.title": { ru: "Название КСП", kz: "ҚМЖ атауы" },
  "form.subject": { ru: "Предмет", kz: "Пән" },
  "form.grade": { ru: "Класс", kz: "Сынып" },
  "form.quarter": { ru: "Четверть", kz: "Тоқсан" },
  "form.section": { ru: "Раздел программы", kz: "Бағдарлама бөлімі" },
  "form.visibility": { ru: "Видимость", kz: "Көріну" },
  "form.language": { ru: "Язык КСП", kz: "ҚМЖ тілі" },
  "form.series": { ru: "Серия уроков", kz: "Сабақтар сериясы" },
  "form.position": { ru: "Номер урока в серии", kz: "Серияда сабақ нөмірі" },
  "form.topic": { ru: "Тема урока", kz: "Сабақ тақырыбы" },
  "form.date": { ru: "Дата", kz: "Күні" },
  "form.studentsPresent": { ru: "Присутствовало", kz: "Қатысқандар саны" },
  "form.studentsAbsent": { ru: "Отсутствовало", kz: "Болмағандар саны" },
  "form.values": { ru: "Привитие ценностей", kz: "Құндылықтарды дарыту" },
  "form.crossCurr": { ru: "Межпредметные связи", kz: "Пәнаралық байланыстар" },
  "form.priorKnowledge": { ru: "Предшествующие знания", kz: "Алдыңғы білімдер" },

  // Visibility values
  "visibility.private": { ru: "Приватный", kz: "Жеке" },
  "visibility.unlisted": { ru: "По ссылке", kz: "Сілтеме бойынша" },
  "visibility.public": { ru: "Публичный", kz: "Көпшілікке ашық" },

  // ─── Tabs (plan editor) ──────────────────────────────────────────
  "tab.meta": { ru: "Метаданные", kz: "Метадеректер" },
  "tab.header": { ru: "Шапка", kz: "Тақырыпша" },
  "tab.objectives": { ru: "Цели", kz: "Мақсаттар" },
  "tab.beginning": { ru: "Начало", kz: "Басы" },
  "tab.middle": { ru: "Середина", kz: "Ортасы" },
  "tab.end": { ru: "Конец", kz: "Аяғы" },
  "tab.evaluation": { ru: "Оценивание", kz: "Бағалау" },

  // ─── Common buttons ──────────────────────────────────────────────
  "btn.save": { ru: "Сохранить", kz: "Сақтау" },
  "btn.cancel": { ru: "Отмена", kz: "Болдырмау" },
  "btn.delete": { ru: "Удалить", kz: "Жою" },
  "btn.add": { ru: "Добавить", kz: "Қосу" },
  "btn.confirm": { ru: "Подтвердить", kz: "Растау" },
  "btn.close": { ru: "Закрыть", kz: "Жабу" },
  "btn.aiHelp": { ru: "AI-помощь", kz: "AI көмегі" },
  "btn.generating": { ru: "Генерируем…", kz: "Дайындалуда…" },
  "btn.uploadImage": { ru: "Загрузить картинку", kz: "Сурет жүктеу" },

  // ─── Status / autosave ───────────────────────────────────────────
  "status.savingCloud": { ru: "Сохраняем в облако…", kz: "Бұлтқа сақтаудамыз…" },
  "status.savedCloud": { ru: "Сохранено в облаке", kz: "Бұлтқа сақталды" },
  "status.draftSaved": { ru: "Черновик сохранён", kz: "Жоба сақталды" },
  "status.saving": { ru: "Сохраняем…", kz: "Сақтаудамыз…" },
  "status.error": { ru: "Ошибка", kz: "Қате" },

  // ─── Version history ─────────────────────────────────────────────
  "history.title": { ru: "История изменений", kz: "Өзгерістер тарихы" },
  "history.empty": {
    ru: "История пуста — ещё не было правок этого плана.",
    kz: "Тарих бос — бұл жоспар әлі өңделмеген.",
  },
  "history.restore": { ru: "Восстановить", kz: "Қалпына келтіру" },
  "history.restoreConfirm": {
    ru: "Восстановить эту версию? Текущее состояние сохранится в истории как новая запись.",
    kz: "Бұл нұсқаны қалпына келтіресіз бе? Қазіргі күй тарихта жаңа жазба ретінде сақталады.",
  },

  // ─── Errors / fallback ───────────────────────────────────────────
  "error.unauthenticated": {
    ru: "Сессия истекла. Войдите заново.",
    kz: "Сессия аяқталды. Қайта кіріңіз.",
  },
  "error.network": {
    ru: "Сетевая ошибка. Проверьте подключение.",
    kz: "Желілік қате. Қосылымды тексеріңіз.",
  },
} satisfies Dict;

export type DictKey = keyof typeof dict;

export function t(key: DictKey, locale: Locale): string {
  return dict[key][locale] ?? dict[key].ru;
}
