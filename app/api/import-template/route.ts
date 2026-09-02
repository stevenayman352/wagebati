import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAccountTemplateBuffer } from "@/lib/import-accounts";

export async function GET() {
  await requireRole(["admin"]);

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("classes").select("name").order("name", { ascending: true });
  const classNames = (data ?? []).map((row) => String(row.name ?? "")).filter(Boolean);

  const buffer = await buildAccountTemplateBuffer(classNames);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${encodeURIComponent("قالب-استيراد-الحسابات")}.xlsx"`
    }
  });
}