export type AppNotificationKind =
  | "school_review_needed"
  | "school_comment"
  | "school_approval_update"
  | "student_result"
  | "admin_lead_pro"
  | "admin_lead_school"
  | "admin_password_reset"
  | "admin_feedback"
  | "plan_activated"
  | "school_invite";

export interface AppNotificationView {
  id: string;
  kind: AppNotificationKind;
  href: string;
  created_at: string;
  read_at: string | null;
}
