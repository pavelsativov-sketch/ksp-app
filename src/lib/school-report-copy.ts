import type { Locale } from "@/lib/i18n/dictionaries";

export const schoolReportCopy: Record<Locale, {
  reportTitle: string;
  section: string;
  field: string;
  value: string;
  note: string;
  source: string;
  metadata: string;
  school: string;
  period: string;
  allPeriod: string;
  filters: string;
  noFilters: string;
  exportedAt: string;
  timeZone: string;
  methodology: string;
  disclosure: string;
  sourceEntered: string;
  sourceComputed: string;
  noData: string;
  overview: string;
  students: string;
  teachers: string;
  classes: string;
  attendanceRate: string;
  qualityScore: string;
  curriculumProgress: string;
  attendanceSection: string;
  class: string;
  percent: string;
  attendanceCount: string;
  qualitySection: string;
  subject: string;
  averagePercent: string;
  curriculumSection: string;
  subjectClass: string;
  completedLessons: string;
  totalLessons: string;
  vskSection: string;
  inspection: string;
  score: string;
  status: string;
  noSubject: string;
  noTeacher: string;
  completed: string;
  draft: string;
  csvDownload: string;
  print: string;
  reportsTitle: string;
  reportsLead: string;
  schoolYear: string;
  reportsKicker: string;
  noReportData: string;
  noReportDataHint: string;
  summaryAria: string;
  attendanceNote: string;
  qualityNote: string;
  curriculumNote: string;
  attendanceEmpty: string;
  qualityEmpty: string;
  curriculumEmpty: string;
  vskEmpty: string;
  vskNote: string;
  restricted: string;
}> = {
  ru: {
    reportTitle: "Отчёт школы",
    section: "Раздел",
    field: "Показатель",
    value: "Значение",
    note: "Пояснение",
    source: "Источник данных",
    metadata: "Метаданные отчёта",
    school: "Школа",
    period: "Период",
    allPeriod: "Весь доступный период",
    filters: "Фильтры",
    noFilters: "Не применялись; включены все доступные записи",
    exportedAt: "Дата и время формирования",
    timeZone: "Часовой пояс",
    methodology: "Методика и происхождение",
    disclosure: "Сформировано из данных, внесённых пользователями приложения; не является официальной государственной выгрузкой.",
    sourceEntered: "Запись, внесённая пользователем в приложение",
    sourceComputed: "Расчёт приложения по сохранённым записям",
    noData: "Нет данных",
    overview: "Сводка",
    students: "Учащиеся",
    teachers: "Педагоги",
    classes: "Классы",
    attendanceRate: "Посещаемость",
    qualityScore: "Качество знаний",
    curriculumProgress: "Выполнение КТП",
    attendanceSection: "Посещаемость по классам",
    class: "Класс",
    percent: "Доля присутствующих",
    attendanceCount: "Количество отметок",
    qualitySection: "Результаты по предметам",
    subject: "Предмет",
    averagePercent: "Средний процент от максимального балла",
    curriculumSection: "Учебные программы",
    subjectClass: "Предмет · класс",
    completedLessons: "Пройдено уроков",
    totalLessons: "Всего уроков",
    vskSection: "Внутришкольный контроль",
    inspection: "Проверка",
    score: "Балл",
    status: "Статус",
    noSubject: "Без предмета",
    noTeacher: "Педагог",
    completed: "Завершено",
    draft: "Черновик",
    csvDownload: "Скачать CSV",
    print: "Печать",
    reportsTitle: "Отчёты",
    reportsLead: "Сводные показатели по данным школы. Идентификаторы учащихся и индивидуальные оценки в этот отчёт не включены.",
    schoolYear: "учебный год",
    reportsKicker: "Аналитика школы",
    noReportData: "Пока нет данных для отчёта",
    noReportDataHint: "Добавьте учащихся, отметки посещаемости, оценки или учебные программы. Отчёт обновится автоматически.",
    summaryAria: "Сводные показатели",
    attendanceNote: "Доля присутствующих среди сохранённых отметок",
    qualityNote: "Среднее score/max_score по сохранённым оценкам",
    curriculumNote: "Завершённые уроки / все уроки в КТП",
    attendanceEmpty: "Отметок посещаемости пока нет.",
    qualityEmpty: "Оценок пока нет.",
    curriculumEmpty: "Учебных программ пока нет.",
    vskEmpty: "Проверок пока нет.",
    vskNote: "Сводка завершённых проверок",
    restricted: "Доступ к сводным школьным отчётам ограничен полномочиями директора и заместителя.",
  },
  kk: {
    reportTitle: "Мектеп есебі",
    section: "Бөлім",
    field: "Көрсеткіш",
    value: "Мәні",
    note: "Түсіндірме",
    source: "Дереккөзі",
    metadata: "Есеп метадеректері",
    school: "Мектеп",
    period: "Кезең",
    allPeriod: "Қолжетімді толық кезең",
    filters: "Сүзгілер",
    noFilters: "Қолданылмады; барлық қолжетімді жазба қамтылды",
    exportedAt: "Жасалған күні мен уақыты",
    timeZone: "Уақыт белдеуі",
    methodology: "Әдістеме және дерек көзі",
    disclosure: "Қолданба пайдаланушылары енгізген деректерден жасалды; бұл мемлекеттік ресми есеп емес.",
    sourceEntered: "Қолданбаға пайдаланушы енгізген жазба",
    sourceComputed: "Сақталған жазбалар бойынша қолданба есептеген көрсеткіш",
    noData: "Дерек жоқ",
    overview: "Жиынтық",
    students: "Оқушылар",
    teachers: "Педагогтер",
    classes: "Сыныптар",
    attendanceRate: "Қатысу",
    qualityScore: "Білім сапасы",
    curriculumProgress: "КТЖ орындалуы",
    attendanceSection: "Сыныптар бойынша қатысу",
    class: "Сынып",
    percent: "Қатысқандар үлесі",
    attendanceCount: "Белгілер саны",
    qualitySection: "Пәндер бойынша нәтижелер",
    subject: "Пән",
    averagePercent: "Ең жоғары балға қатысты орташа пайыз",
    curriculumSection: "Оқу бағдарламалары",
    subjectClass: "Пән · сынып",
    completedLessons: "Өтілген сабақтар",
    totalLessons: "Барлық сабақ",
    vskSection: "Мектепішілік бақылау",
    inspection: "Тексеру",
    score: "Ұпай",
    status: "Мәртебе",
    noSubject: "Пән көрсетілмеген",
    noTeacher: "Педагог",
    completed: "Аяқталды",
    draft: "Жоба",
    csvDownload: "CSV жүктеу",
    print: "Басып шығару",
    reportsTitle: "Есептер",
    reportsLead: "Мектеп деректеріне негізделген жиынтық көрсеткіштер. Оқушы идентификаторлары мен жеке бағалар бұл есепке енгізілмеген.",
    schoolYear: "оқу жылы",
    reportsKicker: "Мектеп аналитикасы",
    noReportData: "Есепке әзірге дерек жоқ",
    noReportDataHint: "Оқушыларды, қатысу белгілерін, бағаларды немесе оқу бағдарламаларын қосыңыз. Есеп автоматты түрде жаңартылады.",
    summaryAria: "Жиынтық көрсеткіштер",
    attendanceNote: "Сақталған қатысу белгілерінің ішіндегі қатысқандар үлесі",
    qualityNote: "Сақталған бағалар бойынша score/max_score орташа мәні",
    curriculumNote: "Орындалған сабақтар / КТЖ-дегі барлық сабақ",
    attendanceEmpty: "Қатысу белгілері әзірге жоқ.",
    qualityEmpty: "Бағалар әзірге жоқ.",
    curriculumEmpty: "Оқу бағдарламалары әзірге жоқ.",
    vskEmpty: "Тексерулер әзірге жоқ.",
    vskNote: "Аяқталған тексерулердің жиынтығы",
    restricted: "Мектеп бойынша жиынтық есептерге директор мен орынбасардың өкілеттігімен ғана қол жеткізуге болады.",
  },
};
