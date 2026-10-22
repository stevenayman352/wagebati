import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { AssignmentDeleteTool } from "@/components/admin/assignment-delete-tool";
import { requireRole } from "@/lib/auth";
import { Trash2 } from "lucide-react";

export default async function AdminDeleteAssignmentPage() {
  const profile = await requireRole(["admin"]);

  return (
    <AdminLayout
      profile={profile}
      title="حذف واجب"
      subtitle="حذف واجب منشور مع محادثاته"
    >
      <AdminSection
        icon={Trash2}
        title="حذف واجب باسمه"
        subtitle="اكتب اسم الواجب واختره ثم أكّد الحذف. تُحذف المحادثات والرسائل والحلول والملفات نهائيًا ولا يمكن التراجع."
      >
        <AssignmentDeleteTool />
      </AdminSection>
    </AdminLayout>
  );
}