import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { ImportTransfersForm } from "@/components/import-transfers-form";
import { importTransfersAction } from "@/app/actions/admin";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cacheLife, cacheTag } from "next/cache";
import { FileSpreadsheet, Info } from "lucide-react";

async function loadTransferPage(profileId: string) {
  "use cache: private";
  cacheTag(`transfer:${profileId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();
  const [{ count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profileId)
      .eq("is_read", false)
  ]);

  return { unreadCount: unreadCount ?? 0 };
}

export default async function AdminTransferPage() {
  const profile = await requireRole(["admin"]);
  const { unreadCount } = await loadTransferPage(profile.id);

  return (
    <AdminLayout profile={profile} title="نقل الطلاب" subtitle="نقل جماعي بين الصفوف" unread={unreadCount}>
      <div className="grid gap-5">
        <AdminSection
          icon={FileSpreadsheet}
          title="نقل الطلاب بإكسل"
          subtitle="حمّل القالب، املأ صفوف النقل، ثم ارفع الملف. انسخ أسماء الصفوف من ورقة «الصفوف» في القالب."
        >
          <ImportTransfersForm action={importTransfersAction} />
        </AdminSection>

        <AdminSection icon={Info} title="كيف يعمل النقل؟" subtitle="قواعد الانتقال بين الصفوف.">
          <ul className="grid gap-2.5 text-sm">
            <li className="rounded-xl border border-border/70 p-3">
              <span className="font-semibold">نفس السنة (مثل «سنة اولى بنين A» ← «سنة اولى بنين B»)</span>
              <p className="mt-1 text-muted-foreground">
                يُنقل الطالب فقط، ويبقى سجل المحادثات والتسليمات والدرجات القديمة كما هو في سجل الطالب.
              </p>
            </li>
            <li className="rounded-xl border border-border/70 p-3">
              <span className="font-semibold">سنة مختلفة (مثل «سنة اولى بنين» ← «سنة ثانية بنين»)</span>
              <p className="mt-1 text-muted-foreground">
                يُنقل الطالب ويُحذف سجل محادثاته وتسليمه ودرجاته في الصف القديم نهائيًا (مع ملفاته المرفقة)،
                ليبدأ السنة الجديدة بصفر درجات.
              </p>
            </li>
            <li className="rounded-xl border border-border/70 p-3">
              <span className="font-semibold">الصفوف بدون سنة/مرحلة</span>
              <p className="mt-1 text-muted-foreground">
                تُعامل كنفس السنة دائمًا — لا يُمسح أي سجل. عدّل الصف من قسم «الصفوف» وأضف السنة لتفعيل المسح.
              </p>
            </li>
            <li className="rounded-xl border border-border/70 p-3">
              <span className="font-semibold">الواجبات المنشورة سابقًا</span>
              <p className="mt-1 text-muted-foreground">
                لا يُنشئ النقل محادثات للواجبات المنشورة سابقًا في الصف الجديد — يظهر للطالب فقط ما يُنشر بعد النقل.
              </p>
            </li>
          </ul>
        </AdminSection>
      </div>
    </AdminLayout>
  );
}
