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

export type ActionState = {
  ok: boolean;
  message: string;
  created?: number;
  rejected?: number;
  issues?: ImportIssue[];
};