import type { Locale } from "@/lib/i18n/dictionaries";
import type { SchoolPermission, SchoolRole } from "@/lib/school/role-matrix";

export const schoolPermissionCopy: Record<Locale, {
  classAssignmentsTitle: string;
  classAssignmentsDescription: string;
  teacher: string;
  className: string;
  assign: string;
  assigning: string;
  revoke: string;
  revokeConfirm: string;
  loading: string;
  emptyAssignments: string;
  noClasses: string;
  saved: string;
  error: string;
  membersTitle: string;
  membersDescription: string;
  roleLabels: Record<SchoolRole, string>;
  permissionLabels: Record<SchoolPermission, string>;
  permissions: string;
  save: string;
  saving: string;
  remove: string;
  removeConfirm: string;
  noChanges: string;
  collective: string;
  teachersTitle: string;
  membersCount: string;
  schoolJoinCode: string;
  onlyYou: string;
  role: string;
  classesKicker: string;
  classesTitle: string;
  studentsCount: string;
  boys: string;
  girls: string;
  openClass: string;
  smallGroup: string;
  noAssignedClasses: string;
}> = {
  ru: {
    classAssignmentsTitle: "Доступ учителей к классам",
    classAssignmentsDescription: "Назначайте учителю только те классы, с данными которых ему разрешено работать. Изменения доступа записываются в школьный журнал.",
    teacher: "Учитель",
    className: "Класс",
    assign: "Назначить класс",
    assigning: "Сохраняю…",
    revoke: "Отозвать доступ",
    revokeConfirm: "Отозвать доступ этого учителя к классу? Доступ к данным класса будет прекращён.",
    loading: "Загрузка назначений…",
    emptyAssignments: "Назначений пока нет.",
    noClasses: "Сначала добавьте учеников, чтобы создать классы.",
    saved: "Назначение сохранено.",
    error: "Не удалось сохранить изменение.",
    membersTitle: "Роли и доступ",
    membersDescription: "Администратор школы не получает доступ к данным автоматически и не участвует в педагогическом согласовании. Выдавайте только необходимые непедагогические разрешения; директор защищён от удаления и самостоятельного изменения роли.",
    roleLabels: { teacher: "Учитель", deputy: "Заместитель директора", director: "Директор", admin: "Администратор школы" },
    permissionLabels: {
      "school:members:list": "Просмотр списка участников школы",
      "school:members:manage": "Управление участниками и ролями",
      "school:classes:manage": "Назначение учителей классам",
      "school:students:read_all": "Просмотр данных учеников всех классов",
      "school:students:write_all": "Изменение данных учеников всех классов",
      "school:students:read_assigned": "Просмотр данных назначенных классов",
      "school:students:write_assigned": "Изменение данных назначенных классов",
      "school:reports:read": "Просмотр сводных школьных отчётов",
      "school:reports:export": "Экспорт школьных отчётов",
      "school:plans:read_all": "Просмотр КСП школы",
      "school:plans:review": "Проверка школьных КСП",
      "school:plans:approve": "Согласование школьных КСП",
      "school:plans:comment_assigned": "Комментарии к назначенным КСП",
      "school:vsk:read_all": "Просмотр записей ВШК",
      "school:vsk:manage": "Создание записей ВШК",
    },
    permissions: "Явные полномочия администратора (без проверки, комментариев и согласования КСП)",
    save: "Сохранить роль",
    saving: "Сохраняю…",
    remove: "Удалить из школы",
    removeConfirm: "Удалить участника из школы и отозвать его назначения?",
    noChanges: "Сохранить изменения",
    collective: "Коллектив",
    teachersTitle: "Педагоги",
    membersCount: "участников",
    schoolJoinCode: "Код школы для подключения",
    onlyYou: "Пока только вы.",
    role: "Роль",
    classesKicker: "Контингент",
    classesTitle: "Классы",
    studentsCount: "учеников",
    boys: "мальчиков",
    girls: "девочек",
    openClass: "Открыть",
    smallGroup: "Малая группа: числовые показатели скрыты",
    noAssignedClasses: "Нет классов, назначенных для вашего доступа.",
  },
  kk: {
    classAssignmentsTitle: "Мұғалімдердің сыныптарға қолжетімділігі",
    classAssignmentsDescription: "Мұғалімге тек жұмыс істеуге рұқсат етілген сыныптарды тағайындаңыз. Қолжетімділік өзгерістері мектеп журналында тіркеледі.",
    teacher: "Мұғалім",
    className: "Сынып",
    assign: "Сыныпты тағайындау",
    assigning: "Сақталуда…",
    revoke: "Қолжетімділікті қайтарып алу",
    revokeConfirm: "Бұл мұғалімнің сыныпқа қолжетімділігін қайтарып алу керек пе? Сынып деректеріне қолжетімділік тоқтатылады.",
    loading: "Тағайындаулар жүктелуде…",
    emptyAssignments: "Әзірге тағайындаулар жоқ.",
    noClasses: "Сыныптарды құру үшін алдымен оқушыларды қосыңыз.",
    saved: "Тағайындау сақталды.",
    error: "Өзгерісті сақтау мүмкін болмады.",
    membersTitle: "Рөлдер мен қолжетімділік",
    membersDescription: "Мектеп әкімшісіне деректерге қолжетімділік автоматты түрде берілмейді және ол педагогикалық келісуге қатыспайды. Тек қажетті педагогикалық емес рұқсаттарды беріңіз; директорды жоюға немесе оның рөлін өзі өзгертуіне болмайды.",
    roleLabels: { teacher: "Мұғалім", deputy: "Директордың орынбасары", director: "Директор", admin: "Мектеп әкімшісі" },
    permissionLabels: {
      "school:members:list": "Мектеп мүшелерінің тізімін көру",
      "school:members:manage": "Мүшелер мен рөлдерді басқару",
      "school:classes:manage": "Мұғалімдерді сыныптарға тағайындау",
      "school:students:read_all": "Барлық сынып оқушыларының деректерін көру",
      "school:students:write_all": "Барлық сынып оқушыларының деректерін өзгерту",
      "school:students:read_assigned": "Тағайындалған сыныптардың деректерін көру",
      "school:students:write_assigned": "Тағайындалған сыныптардың деректерін өзгерту",
      "school:reports:read": "Мектеп есептерінің жиынтығын көру",
      "school:reports:export": "Мектеп есептерін экспорттау",
      "school:plans:read_all": "Мектептің ҚМЖ құжаттарын көру",
      "school:plans:review": "Мектептің ҚМЖ құжаттарын тексеру",
      "school:plans:approve": "Мектептің ҚМЖ құжаттарын келісу",
      "school:plans:comment_assigned": "Тағайындалған ҚМЖ құжаттарына пікір қалдыру",
      "school:vsk:read_all": "ІМБ жазбаларын көру",
      "school:vsk:manage": "ІМБ жазбаларын жасау",
    },
    permissions: "Әкімшінің нақты құқықтары (ҚМЖ-ны тексеру, пікір беру және келісу мүмкін емес)",
    save: "Рөлді сақтау",
    saving: "Сақталуда…",
    remove: "Мектептен шығару",
    removeConfirm: "Қатысушыны мектептен шығарып, оның тағайындауларын қайтару керек пе?",
    noChanges: "Өзгерістерді сақтау",
    collective: "Ұжым",
    teachersTitle: "Мұғалімдер",
    membersCount: "қатысушы",
    schoolJoinCode: "Мектепке қосылу коды",
    onlyYou: "Әзірге тек сіз барсыз.",
    role: "Рөл",
    classesKicker: "Оқушылар құрамы",
    classesTitle: "Сыныптар",
    studentsCount: "оқушы",
    boys: "ұл",
    girls: "қыз",
    openClass: "Ашу",
    smallGroup: "Шағын топ: сандық көрсеткіштер жасырылды",
    noAssignedClasses: "Сізге қолжетімді сыныптар тағайындалмаған.",
  },
};
