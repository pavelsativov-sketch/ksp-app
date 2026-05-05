import type { InteractiveTask } from "@/lib/ksp/tasks";

export type SessionStatus = "active" | "closed";

/**
 * A single interactive task as it appears in a class session — `index` matches
 * the position inside `tasks_snapshot`, `stageLabel` lets the student/teacher
 * see where in the lesson the task came from.
 */
export interface SessionTaskSnapshot {
  index: number;
  stageLabel: string;
  task: InteractiveTask;
}

export interface LessonSessionRow {
  id: string;
  plan_id: string;
  owner_id: string;
  code: string;
  status: SessionStatus;
  tasks_snapshot: SessionTaskSnapshot[];
  created_at: string;
  closed_at: string | null;
  expires_at: string;
}

export interface SessionResponseRow {
  id: string;
  session_id: string;
  student_name: string;
  task_index: number;
  task_label: string | null;
  response_data: unknown;
  is_correct: boolean;
  score: number;
  max_score: number;
  created_at: string;
}
