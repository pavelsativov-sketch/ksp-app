export type AppNotificationKind = "school_review_needed" | "school_comment" | "school_approval_update" | "student_result";

export interface AppNotificationView {
  id: string;
  kind: AppNotificationKind;
  href: string;
  created_at: string;
  read_at: string | null;
}
