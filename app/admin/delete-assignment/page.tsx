import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { AssignmentDeleteTool } from "@/components/admin/assignment-delete-tool";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cacheLife, cacheTag } from "next/cache";
import { Trash2 } from "lucide-react";

async function loadDeleteAssignmentPage(profileId: string) {
  "use cache: private";
  cacheTag(`admin-delete-assignment:${profileId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profileId)
    .eq("is_read", false);

  return { unreadCount: count ?? 0 };
}

export default async function AdminDeleteAssignmentPage() {
  const profile = await requireRole(["admin"]);

  const { unreadCount } = await loadDeleteAssignmentPage(profile.id);

  return (
    <AdminLayout
      profile={profile}
      title="حذف واجب"
      subtitle="حذف واجب منشور مع محادثاته"
      unread={unreadCount}
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