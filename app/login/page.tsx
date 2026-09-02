import { LoginForm } from "./login-form";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const errorMessages: Record<string, string> = {
  invalid_credentials: "بيانات الدخول غير صحيحة",
  inactive: "الحساب غير مفعل",
  not_configured: "إعدادات النظام غير مكتملة"
};

export const metadata = {
  title: "تسجيل الدخول - واجباتي"
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const configured = hasSupabaseConfig();
  const errorText = params.error ? errorMessages[params.error] ?? null : null;

  return (
    <main dir="rtl">
      <LoginForm configured={configured} errorText={errorText} />
    </main>
  );
}