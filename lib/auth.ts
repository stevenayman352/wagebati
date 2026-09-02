import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { AppRole, Profile } from "@/lib/types";

/**
 * Pure authorization & routing helpers (no I/O), kept framework-free so the
 * role-gating and password-change rules can be unit-tested in isolation.
 */

export function isRoleAllowed(profile: Pick<Profile, "role" | "must_change_password" | "is_active">, roles: AppRole[]) {
  if (!profile || profile.is_active === false) return false;
  if (profile.must_change_password) return false;
  return roles.includes(profile.role);
}

export function mustChangePassword(profile: Pick<Profile, "must_change_password" | "is_active"> | null) {
  return Boolean(profile && profile.is_active !== false && profile.must_change_password);
}

export function dashboardPath(role: AppRole) {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/teacher";
  return "/student";
}

export async function getCurrentProfile() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, code, is_active, must_change_password, last_login_at")
    .eq("id", user.id)
    .single();

  if (!data || !data.is_active) {
    return null;
  }

  return data as Profile;
}

export async function requireRole(roles: AppRole[]) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (mustChangePassword(profile)) redirect("/change-password?first=1");
  if (!isRoleAllowed(profile, roles)) redirect("/");
  return profile;
}