"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function markNotificationReadAction(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) return;
  const id = formData.get("notificationId");
  if (typeof id !== "string" || !id) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", profile.id);

  revalidatePath("/notifications");
  revalidatePath(profile.role === "admin" ? "/admin" : profile.role === "teacher" ? "/teacher" : "/student");
}

export async function markAllNotificationsReadAction(_: ActionState, formData: FormData): Promise<ActionState> {
  void formData;
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "غير مصرح." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/notifications");
  revalidatePath(profile.role === "admin" ? "/admin" : profile.role === "teacher" ? "/teacher" : "/student");
  return { ok: true, message: "" };
}