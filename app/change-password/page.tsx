import { ChangePasswordForm } from "./change-password-form";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const errorMessages: Record<string, string> = {
  too_short: "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
  mismatch: "كلمتا المرور غير متطابقتين",
  wrong_current: "كلمة المرور الحالية غير صحيحة",
  failed: "تعذر تغيير كلمة المرور، حاول مرة أخرى",
  not_configured: "إعدادات النظام غير مكتملة"
};

export const metadata = {
  title: "تغيير كلمة المرور - واجباتي"
};

export default async function ChangePasswordPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; first?: string }>;
}) {
  const params = await searchParams;
  const configured = hasSupabaseConfig();
  const errorText = params.error ? errorMessages[params.error] ?? null : null;

  return (
    <ChangePasswordForm
      configured={configured}
      errorText={errorText}
      isFirst={Boolean(params.first)}
    />
  );
}
