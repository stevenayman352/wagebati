import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { ImportTransfersForm } from "@/components/import-transfers-form";
import { importTransfersAction } from "@/app/actions/admin";
import { requireRole } from "@/lib/auth";
import { FileSpreadsheet, Info } from "lucide-react";

export default async function AdminTransferPage() {
  const profile = await requireRole(["admin"]);

  return (
    <AdminLayout profile={profile} title="نقل الطلاب" subtitle="نقل جماعي بين الصفوف">
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
