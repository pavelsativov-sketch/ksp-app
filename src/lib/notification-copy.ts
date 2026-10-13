import type { Locale } from "@/lib/i18n/dictionaries";
import type { AppNotificationKind } from "@/lib/notification-types";

export const notificationCopy: Record<Locale, {
  title: string;
  lead: string;
  empty: string;
  markAllRead: string;
  unreadCount: (count: number) => string;
  createdAt: string;
  error: string;
  kinds: Record<AppNotificationKind, string>;
}> = {
  ru: {
    title: "Уведомления",
    lead: "Комментарии к КСП, статусы согласования и новые результаты заданий. Уведомления не содержат имён учеников и их ответов.",
    empty: "Новых уведомлений пока нет.",
    markAllRead: "Отметить всё как прочитанное",
    unreadCount: (count) => `Непрочитанных: ${count}`,
    createdAt: "Получено",
    error: "Не удалось обновить уведомления. Попробуйте ещё раз.",
    kinds: {
      school_review_needed: "КСП ожидает проверки",
      school_comment: "Новый комментарий к КСП",
      school_approval_update: "Изменился статус согласования КСП",
      student_result: "Поступил новый результат задания",
    },
  },
  kk: {
    title: "Хабарландырулар",
    lead: "ҚМЖ түсініктемелері, келісу мәртебесі және тапсырмалардың жаңа нәтижелері. Хабарландыруларда оқушының аты мен жауаптары көрсетілмейді.",
    empty: "Әзірге жаңа хабарландыру жоқ.",
    markAllRead: "Барлығын оқылған деп белгілеу",
    unreadCount: (count) => `Оқылмағаны: ${count}`,
    createdAt: "Алынған уақыты",
    error: "Хабарландыруларды жаңарту мүмкін болмады. Қайталап көріңіз.",
    kinds: {
      school_review_needed: "ҚМЖ тексеруді күтуде",
      school_comment: "ҚМЖ бойынша жаңа пікір",
      school_approval_update: "ҚМЖ келісу мәртебесі өзгерді",
      student_result: "Тапсырманың жаңа нәтижесі алынды",
    },
  },
};
