import type { Locale } from "@/lib/i18n/dictionaries";

export const assignmentPreviewCopy: Record<Locale, {
  previewBtn: string;
  previewing: string;
  previewTitle: string;
  previewHint: string;
  previewBack: string;
  issueBtn: string;
  previewErr: string;
  issueErr: string;
  answerField: string;
  booleanTrue: string;
  booleanFalse: string;
  hintLabel: string;
  taskOf: (current: number, total: number) => string;
  points: (points: number) => string;
  daysValid: (days: number) => string;
  readyTitle: string;
  clipboardError: string;
  manageResults: string;
  qrTitle: string;
  qrLead: string;
  feedbackTitle: string;
  feedbackNone: string;
  feedbackCorrectOnly: string;
  safeIncorrect: string;
  feedbackDisabled: string;
  reissueBtn: string;
  reissueTitle: string;
  reissueLead: string;
  titleLabel: string;
  questionLabel: string;
  editHintLabel: string;
  reissueErr: string;
  reissueStale: string;
}> = {
  ru: {
    previewBtn: "Предпросмотр для ученика",
    previewing: "Готовим предпросмотр…",
    previewTitle: "Так задание увидит ученик",
    previewHint: "Проверьте формулировки и варианты. Правильные ответы в этом окне не показываются.",
    previewBack: "Вернуться к настройке",
    issueBtn: "Создать выдачу",
    previewErr: "Не удалось подготовить предпросмотр выбранных заданий.",
    issueErr: "Не удалось создать выдачу. Проверьте соединение и повторите попытку.",
    answerField: "Поле для ответа",
    booleanTrue: "Верно",
    booleanFalse: "Неверно",
    hintLabel: "Подсказка:",
    taskOf: (current, total) => `Задание ${current} из ${total}`,
    points: (points) => `${points} б.`,
    daysValid: (days) => `Срок: ${days} дн.`,
    readyTitle: "Выдача готова",
    clipboardError: "Не удалось скопировать ссылку. Скопируйте её вручную.",
    manageResults: "Открыть результаты учителя",
    qrTitle: "QR-код для учеников",
    qrLead: "Отсканируйте код или отправьте ссылку. Вход в систему не требуется.",
    feedbackTitle: "Обратная связь ученику",
    feedbackNone: "Не показывать разбор ответов",
    feedbackCorrectOnly: "Показывать разбор только после верного ответа",
    safeIncorrect: "Проверьте подсказку и попробуйте ещё раз. Правильный ответ не раскрывается.",
    feedbackDisabled: "Учитель отключил показ разбора для этой выдачи.",
    reissueBtn: "Подготовить исправленную повторную выдачу",
    reissueTitle: "Повторная практика с правками учителя",
    reissueLead: "Измените формулировки и подсказки, проверьте предпросмотр и подтвердите создание нового кода. Ответы берутся из исходного задания и не редактируются здесь.",
    titleLabel: "Название новой выдачи",
    questionLabel: "Формулировка задания",
    editHintLabel: "Подсказка (необязательно)",
    reissueErr: "Не удалось подготовить новую выдачу. Исходная выдача не изменена.",
    reissueStale: "Исходная выдача изменилась. Обновите страницу, заново проверьте задания и повторите попытку.",
  },
  kk: {
    previewBtn: "Оқушы ретінде көру",
    previewing: "Алдын ала қарау дайындалуда…",
    previewTitle: "Оқушы тапсырманы осылай көреді",
    previewHint: "Сұрақтар мен жауап нұсқаларын тексеріңіз. Дұрыс жауаптар бұл терезеде көрсетілмейді.",
    previewBack: "Параметрлерге қайту",
    issueBtn: "Тапсырманы тарату",
    previewErr: "Таңдалған тапсырмаларды алдын ала көрсету мүмкін болмады.",
    issueErr: "Тапсырманы тарату мүмкін болмады. Байланысты тексеріп, қайталап көріңіз.",
    answerField: "Жауап өрісі",
    booleanTrue: "Дұрыс",
    booleanFalse: "Бұрыс",
    hintLabel: "Көмек:",
    taskOf: (current, total) => `${current}-тапсырма, барлығы ${total}`,
    points: (points) => `${points} ұпай`,
    daysValid: (days) => `Мерзімі: ${days} күн`,
    readyTitle: "Тапсырма дайын",
    clipboardError: "Сілтемені көшіру мүмкін болмады. Оны қолмен көшіріңіз.",
    manageResults: "Мұғалім нәтижелерін ашу",
    qrTitle: "Оқушыларға арналған QR-код",
    qrLead: "Кодты сканерлеңіз немесе сілтемені жіберіңіз. Жүйеге кіру қажет емес.",
    feedbackTitle: "Оқушыға кері байланыс",
    feedbackNone: "Жауаптардың түсіндірмесін көрсетпеу",
    feedbackCorrectOnly: "Түсіндірмені тек дұрыс жауаптан кейін көрсету",
    safeIncorrect: "Көмек мәтінін қарап, қайта көріңіз. Дұрыс жауап көрсетілмейді.",
    feedbackDisabled: "Мұғалім бұл тапсырма үшін түсіндірмені көрсетуді өшірді.",
    reissueBtn: "Өңделген қайталау тапсырмасын дайындау",
    reissueTitle: "Мұғалім түзеткен қайталау тапсырмасы",
    reissueLead: "Сұрақ мәтіні мен көмекті өзгертіп, алдын ала тексеріп, жаңа код жасауды растаңыз. Дұрыс жауаптар бастапқы тапсырмадан алынады және бұл жерде өзгертілмейді.",
    titleLabel: "Жаңа тапсырманың атауы",
    questionLabel: "Тапсырма мәтіні",
    editHintLabel: "Көмек (міндетті емес)",
    reissueErr: "Жаңа тапсырманы дайындау мүмкін болмады. Бастапқы тапсырма өзгертілмейді.",
    reissueStale: "Бастапқы тапсырма өзгерді. Бетті жаңартып, тапсырмаларды қайта тексеріп, тағы бір рет көріңіз.",
  },
};

export const assignmentAnalyticsCopy: Record<Locale, {
  title: string;
  lead: string;
  noData: string;
  noResponses: string;
  taskSection: string;
  objectiveSection: string;
  objectiveLabel: string;
  unlinkedObjective: string;
  participants: string;
  responses: string;
  attempts: string;
  omitted: string;
  correct: string;
  incorrect: string;
  accuracy: string;
  suppressed: (min: number) => string;
  privacyNote: string;
  bestResult: string;
  lastResult: string;
  expiredStatus: string;
  sourceLead: string;
  sourceOpen: string;
  rowsLimited: (shown: number, total: number) => string;
}> = {
  ru: {
    title: "Ошибки по заданиям и целям",
    lead: "Показатели рассчитаны по лучшему сохранённому результату участника. Знаменатель включает все записи заданий в результате, в том числе пропущенные; пропуски указаны отдельно. Отправки включают повторы. В старых записях пропуски могут быть неизвестны.",
    noData: "Пока нет результатов для анализа.",
    noResponses: "Для этого задания пока нет ответов.",
    taskSection: "По заданиям",
    objectiveSection: "По целям обучения",
    objectiveLabel: "Цель",
    unlinkedObjective: "Без привязки к цели обучения",
    participants: "Участников",
    responses: "Записей заданий, включая пропуски",
    attempts: "Отправок по заданиям",
    omitted: "Пропусков",
    correct: "Верно",
    incorrect: "Не полностью верно (включая пропуски)",
    accuracy: "Доля полностью верных от всех записей",
    suppressed: (min) => `Статистика группы скрыта: для показа нужно не менее ${min} участников.`,
    privacyNote: "Один участник — одна запись по введённому имени (личность не подтверждается); имена в агрегатах не выводятся. Группы меньше 5 не раскрываются.",
    bestResult: "Лучший результат",
    lastResult: "Последний результат",
    expiredStatus: "Срок истёк",
    sourceLead: "Повторная выдача создана из предыдущей.",
    sourceOpen: "Открыть источник",
    rowsLimited: (shown, total) => `Показаны первые ${shown} из ${total} записей; сводные показатели рассчитаны по всем участникам.`,
  },
  kk: {
    title: "Тапсырмалар мен оқу мақсаттары бойынша қателер",
    lead: "Көрсеткіштер қатысушының сақталған ең үздік нәтижесі бойынша есептеледі. Бөлім санына тапсырманың барлық жазбалары, соның ішінде бос жауаптар кіреді; бос жауаптар бөлек көрсетіледі. Жіберілімдерге қайталау әрекеттері де кіреді. Ескі жазбаларда бос жауап туралы ақпарат болмауы мүмкін.",
    noData: "Талдауға арналған нәтиже әлі жоқ.",
    noResponses: "Бұл тапсырма бойынша жауап әлі жоқ.",
    taskSection: "Тапсырмалар бойынша",
    objectiveSection: "Оқу мақсаттары бойынша",
    objectiveLabel: "Мақсат",
    unlinkedObjective: "Оқу мақсатымен байланыстырылмаған",
    participants: "Қатысушылар",
    responses: "Бос жауаптарды қоса алғандағы тапсырма жазбалары",
    attempts: "Тапсырмалар бойынша жіберілімдер",
    omitted: "Жауапсыз",
    correct: "Дұрыс",
    incorrect: "Толық дұрыс емес (бос жауаптарды қоса)",
    accuracy: "Барлық жазбадағы толық дұрыс жауаптардың үлесі",
    suppressed: (min) => `Топ статистикасы жасырылды: көрсету үшін кемінде ${min} қатысушы қажет.`,
    privacyNote: "Бір қатысушы — енгізілген аты бар бір жазба (тұлға расталмайды); жиынтықта есімдер көрсетілмейді. 5-тен аз топтар жасырын.",
    bestResult: "Ең үздік нәтиже",
    lastResult: "Соңғы нәтиже",
    expiredStatus: "Мерзімі өтті",
    sourceLead: "Қайталау тапсырмасы алдыңғы нұсқадан жасалды.",
    sourceOpen: "Бастапқы нұсқаны ашу",
    rowsLimited: (shown, total) => `${total} жазбаның алғашқы ${shown}-і көрсетілді; жиынтық көрсеткіштер барлық қатысушы бойынша есептелді.`,
  },
};
