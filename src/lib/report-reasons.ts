/** Причины жалоб — общий модуль без server-only (нужен и клиенту, и серверу). */
export const REPORT_REASONS = ["spam", "offense", "wrong", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: "Спам или реклама",
  offense: "Оскорбления / недопустимое содержание",
  wrong: "Ошибочное или некачественное содержание",
  other: "Другое",
};
