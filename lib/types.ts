import type { TransferGradePreview } from "@/lib/transfer-grades";

export type AppRole = "admin" | "teacher" | "student";
export type ConversationStatus = "active" | "closed";
export type MessageKind = "text" | "voice" | "image";

export type ImportIssue = {
  row: number;
  column: string;
  message: string;
};

export type Profile = {
  id: string;
  role: AppRole;
  full_name: string;
  email: string;
  code: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
};

export type AssignmentMatch = {
  id: string;
  title: string;
  className: string;
  teacherName: string;
  dueAt: string | null;
  conversationCount: number;
};

export type TransferSummary = {
  moved: number;
  gradesCopied: number;
  gradesKept: number;
  gradesFailed: number;
};

export type ActionState = {
  ok: boolean;
  message: string;
  created?: number;
  rejected?: number;
  issues?: ImportIssue[];
  matches?: AssignmentMatch[];
  /** Set when a transfer needs the admin to map old homework to new homework. */
  gradePreview?: TransferGradePreview;
  transferSummary?: TransferSummary;
};