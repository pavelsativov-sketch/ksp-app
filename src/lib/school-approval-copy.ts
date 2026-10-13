import type { Locale } from "@/lib/i18n/dictionaries";
import type { PlanSection } from "@/lib/plan-versions";
import type { SchoolApprovalAction, SchoolApprovalStatus } from "@/lib/school-approvals";

export const schoolApprovalCopy: Record<Locale, {
  queueTitle: string;
  queueDescription: string;
  open: string;
  emptyQueue: string;
  plan: string;
  schoolClass: string;
  selectClass: string;
  noClasses: string;
  subject: string;
  grade: string;
  cycle: string;
  status: string;
  submittedAt: string;
  snapshotNotice: string;
  snapshotHash: string;
  history: string;
  comments: string;
  topic: string;
  objectives: string;
  beginning: string;
  middle: string;
  end: string;
  teacherActions: string;
  studentActions: string;
  tasks: string;
  lessonObjectives: string;
  criteria: string;
  languageObjectives: string;
  terms: string;
  phrases: string;
  values: string;
  crossCurricularLinks: string;
  priorKnowledge: string;
  time: string;
  resources: string;
  evaluation: string;
  formativeAssessment: string;
  differentiation: string;
  healthAndSafety: string;
  reflection: string;
  startReview: string;
  submit: string;
  resubmit: string;
  approve: string;
  requestChanges: string;
  addComment: string;
  section: string;
  comment: string;
  commentPlaceholder: string;
  chooseSection: string;
  enterComment: string;
  ownerDescription: string;
  versionChanged: string;
  noSchool: string;
  restricted: string;
  loading: string;
  error: string;
  draft: string;
  noCycle: string;
  saved: string;
  statusLabels: Record<SchoolApprovalStatus, string>;
  eventLabels: Record<SchoolApprovalAction, string>;
  sectionLabels: Record<PlanSection, string>;
}> = {
  ru: {
    queueTitle: "Согласование КСП",
    queueDescription: "Очередь показывает неизменяемые версии, отправленные авторами на проверку.",
    open: "Открыть проверку",
    emptyQueue: "Нет планов, ожидающих проверки.",
    plan: "План",
    schoolClass: "Школьный класс",
    selectClass: "Выберите класс школы",
    noClasses: "Нет назначенных или доступных школьных классов. Обратитесь к директору школы.",
    subject: "Предмет",
    grade: "Класс",
    cycle: "Цикл",
    status: "Статус",
    submittedAt: "Отправлен",
    snapshotNotice: "Проверяется сохранённый снимок. Поздние изменения автора не меняют эту версию.",
    snapshotHash: "Идентификатор снимка",
    history: "История согласования",
    comments: "Комментарии по разделам",
    topic: "Тема",
    objectives: "Цели обучения",
    beginning: "Начало урока",
    middle: "Середина урока",
    end: "Завершение урока",
    teacherActions: "Действия педагога",
    studentActions: "Действия учеников",
    tasks: "Задания",
    lessonObjectives: "Цели урока",
    criteria: "Критерии оценивания",
    languageObjectives: "Языковые цели",
    terms: "Термины",
    phrases: "Ключевые фразы",
    values: "Прививаемые ценности",
    crossCurricularLinks: "Межпредметные связи",
    priorKnowledge: "Предшествующие знания",
    time: "Время",
    resources: "Ресурсы",
    evaluation: "Оценивание и рефлексия",
    formativeAssessment: "Формативное оценивание",
    differentiation: "Дифференциация",
    healthAndSafety: "Здоровье и безопасность",
    reflection: "Рефлексия",
    startReview: "Начать проверку",
    submit: "Отправить на согласование",
    resubmit: "Отправить исправленную версию",
    approve: "Согласовать снимок",
    requestChanges: "Вернуть на доработку",
    addComment: "Добавить комментарий",
    section: "Раздел плана",
    comment: "Комментарий",
    commentPlaceholder: "Опишите замечание по выбранному разделу. Не добавляйте сведения об учениках.",
    chooseSection: "Выберите раздел",
    enterComment: "Введите комментарий к разделу.",
    ownerDescription: "На проверку отправляется сохранённая версия КСП. После возврата сначала сохраните исправления; утверждённый снимок остаётся неизменным.",
    versionChanged: "Текущая версия отличается от отправленной. Проверяющий должен вернуть её на доработку; утвердить устаревший снимок нельзя.",
    noSchool: "Для школьного согласования подключитесь к школе или выберите её как активную.",
    restricted: "У вас нет полномочий просматривать очередь согласования этой школы.",
    loading: "Загрузка согласования…",
    error: "Не удалось выполнить действие. Обновите страницу и проверьте права доступа.",
    draft: "Черновик",
    noCycle: "Цикл согласования недоступен или был закрыт.",
    saved: "Изменение сохранено.",
    statusLabels: { submitted: "Отправлен", in_review: "На проверке", changes_requested: "Нужны исправления", resubmitted: "Отправлен повторно", approved: "Согласован" },
    eventLabels: { submitted: "Автор отправил план", review_started: "Проверка начата", commented: "Добавлен комментарий", changes_requested: "Запрошены исправления", resubmitted: "Автор отправил исправленную версию", approved: "Снимок согласован" },
    sectionLabels: { metadata: "Сведения о плане", objectives: "Цели и критерии", context: "Контекст урока", beginning: "Начало урока", middle: "Середина урока", end: "Завершение урока", evaluation: "Оценивание" },
  },
  kk: {
    queueTitle: "ҚМЖ-ны келісу",
    queueDescription: "Кезек авторлар тексеруге жіберген өзгермейтін нұсқаларды көрсетеді.",
    open: "Тексеруді ашу",
    emptyQueue: "Тексеруді күтіп тұрған жоспарлар жоқ.",
    plan: "Жоспар",
    schoolClass: "Мектеп сыныбы",
    selectClass: "Мектеп сыныбын таңдаңыз",
    noClasses: "Тағайындалған немесе қолжетімді мектеп сыныптары жоқ. Мектеп директорына хабарласыңыз.",
    subject: "Пән",
    grade: "Сынып",
    cycle: "Кезең",
    status: "Күйі",
    submittedAt: "Жіберілген уақыты",
    snapshotNotice: "Тексерілетін нұсқа сақталған күйінде қалады. Автордың кейінгі түзетулері бұл нұсқаны өзгертпейді.",
    snapshotHash: "Нұсқа идентификаторы",
    history: "Келісу тарихы",
    comments: "Бөлімдер бойынша пікірлер",
    topic: "Тақырып",
    objectives: "Оқу мақсаттары",
    beginning: "Сабақтың басы",
    middle: "Сабақтың ортасы",
    end: "Сабақтың соңы",
    teacherActions: "Мұғалім әрекеттері",
    studentActions: "Оқушы әрекеттері",
    tasks: "Тапсырмалар",
    lessonObjectives: "Сабақ мақсаттары",
    criteria: "Бағалау критерийлері",
    languageObjectives: "Тілдік мақсаттар",
    terms: "Терминдер",
    phrases: "Негізгі сөз тіркестері",
    values: "Құндылықтарды дарыту",
    crossCurricularLinks: "Пәнаралық байланыс",
    priorKnowledge: "Алдыңғы білім",
    time: "Уақыт",
    resources: "Ресурстар",
    evaluation: "Бағалау және рефлексия",
    formativeAssessment: "Қалыптастырушы бағалау",
    differentiation: "Саралау",
    healthAndSafety: "Денсаулық және қауіпсіздік",
    reflection: "Рефлексия",
    startReview: "Тексеруді бастау",
    submit: "Келісуге жіберу",
    resubmit: "Түзетілген нұсқаны жіберу",
    approve: "Нұсқаны келісу",
    requestChanges: "Түзетуге қайтару",
    addComment: "Пікір қосу",
    section: "Жоспар бөлімі",
    comment: "Пікір",
    commentPlaceholder: "Таңдалған бөлім бойынша ескертуді жазыңыз. Оқушылар туралы деректерді қоспаңыз.",
    chooseSection: "Бөлімді таңдаңыз",
    enterComment: "Бөлімге пікір енгізіңіз.",
    ownerDescription: "Келісуге сақталған ҚМЖ нұсқасы жіберіледі. Қайтарылғаннан кейін түзетулерді сақтаңыз; келісілген нұсқа өзгермейді.",
    versionChanged: "Ағымдағы нұсқа жіберілген нұсқадан өзгеше. Тексеруші оны түзетуге қайтаруы керек; ескі нұсқаны келісуге болмайды.",
    noSchool: "Мектеп келісуі үшін мектепке қосылыңыз немесе оны белсенді мектеп ретінде таңдаңыз.",
    restricted: "Бұл мектептің келісу кезегін көруге құқығыңыз жоқ.",
    loading: "Келісу деректері жүктелуде…",
    error: "Әрекетті орындау мүмкін болмады. Бетті жаңартып, қолжетімділікті тексеріңіз.",
    draft: "Нобай",
    noCycle: "Келісу кезеңі қолжетімсіз немесе жабылған.",
    saved: "Өзгеріс сақталды.",
    statusLabels: { submitted: "Жіберілді", in_review: "Тексерілуде", changes_requested: "Түзету қажет", resubmitted: "Қайта жіберілді", approved: "Келісілді" },
    eventLabels: { submitted: "Автор жоспарды жіберді", review_started: "Тексеру басталды", commented: "Пікір қосылды", changes_requested: "Түзету сұралды", resubmitted: "Автор түзетілген нұсқаны жіберді", approved: "Нұсқа келісілді" },
    sectionLabels: { metadata: "Жоспар мәліметтері", objectives: "Мақсаттар мен критерийлер", context: "Сабақ контексті", beginning: "Сабақтың басы", middle: "Сабақтың ортасы", end: "Сабақтың соңы", evaluation: "Бағалау" },
  },
};
