"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { dashboardPath, getCurrentProfile } from "@/lib/auth";

export async function signInAction(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/login?error=not_configured");

  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const admin = createSupabaseAdminClient();
  const { data: account } = await admin
    .from("profiles")
    .select("id, role, email, is_active, must_change_password")
    .eq("code", code)
    .maybeSingle();

  // Fail generically so we never reveal whether a code exists.
  if (!account || !account.is_active) {
    redirect("/login?error=invalid_credentials");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password
  });
  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  await admin
    .from("profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", account.id);

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?error=inactive");

  if (profile.must_change_password) redirect("/change-password?first=1");
  redirect(dashboardPath(profile.role));
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changePasswordAction(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/login?error=not_configured");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("new") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) redirect("/change-password?error=too_short");
  if (next !== confirm) redirect("/change-password?error=mismatch");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current
  });
  if (verifyError) redirect("/change-password?error=wrong_current");

  const { error: updateError } = await supabase.auth.updateUser({ password: next });
  if (updateError) redirect("/change-password?error=failed");

  const admin = createSupabaseAdminClient();
  await admin
    .from("profiles")
    .update({ must_change_password: false, last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  redirect(dashboardPath(profile.role));
}