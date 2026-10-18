import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAccountTemplateBuffer } from "@/lib/import-accounts";
import { buildTransferTemplateBuffer, type TransferClass } from "@/lib/transfer";

export async function GET(request: Request) {
  await requireRole(["admin"]);

  const kind = new URL(request.url).searchParams.get("kind");

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("classes").select("name, grade_label").order("name", { ascending: true });

  if (kind === "transfer") {
    const classes: TransferClass[] = (data ?? []).map((row) => ({
      id: "",
      name: String(row.name ?? ""),
      gradeLabel: String(row.grade_label ?? "")
    }));
    const buffer = await buildTransferTemplateBuffer(classes);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${encodeURIComponent("قالب-نقل-الطلاب")}.xlsx"`
      }
    });
  }

  const classNames = (data ?? []).map((row) => String(row.name ?? "")).filter(Boolean);

  const buffer = await buildAccountTemplateBuffer(classNames);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${encodeURIComponent("قالب-استيراد-الحسابات")}.xlsx"`
    }
  });
}