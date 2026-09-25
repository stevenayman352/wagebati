import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * One-off: record a grade on the single conversation whose submission we preserved
 * during the media purge. Mirrors app/actions/teacher.ts :: saveGradeAction exactly
 * (same columns, same upsert conflict target, same needs_revision reset).
 */

const CONVERSATION_ID = "6952b63b-286b-4302-a525-bee4d94e7941";
const GRADE = 7;
const GRADED_BY = "34d890ff-840e-43f3-aaf9-6a00703ae692"; // باصون بيشوي سمير
const BACKUP_DIR = "C:/Users/STEVEN~1/AppData/Local/Temp/opencode";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }
});

async function main() {
  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, status, student_id, assignment_id, needs_revision, closed_at, closed_by, assignment:assignments(title, max_grade, classes(name))")
    .eq("id", CONVERSATION_ID)
    .single();
  if (convErr) throw new Error(`conversation: ${convErr.message}`);

  const maxGrade = (conv.assignment as unknown as { max_grade: number }).max_grade;
  if (GRADE > maxGrade) throw new Error(`grade ${GRADE} exceeds max_grade ${maxGrade}`);

  // Pre-image backup before touching anything.
  mkdirSync(BACKUP_DIR, { recursive: true });
  const { data: preGrade } = await admin.from("grades").select("*").eq("conversation_id", CONVERSATION_ID);
  writeFileSync(
    `${BACKUP_DIR}/grade-backup-${CONVERSATION_ID}.json`,
    JSON.stringify({ conversation: conv, existing_grades: preGrade ?? [] }, null, 2)
  );

  console.log("=== PRE-STATE ===");
  console.log("  student        :", conv.student_id);
  console.log("  assignment     :", (conv.assignment as unknown as { title: string }).title, "| max", maxGrade);
  console.log("  class          :", (conv.assignment as unknown as { classes: { name: string } }).classes.name);
  console.log("  status         :", conv.status, "| needs_revision:", conv.needs_revision);
  console.log("  existing grades:", preGrade?.length ?? 0);

  const { error: gErr } = await admin.from("grades").upsert(
    {
      conversation_id: CONVERSATION_ID,
      assignment_id: conv.assignment_id,
      student_id: conv.student_id,
      grade: GRADE,
      comment: "",
      graded_by: GRADED_BY
    },
    { onConflict: "conversation_id" }
  );
  if (gErr) throw new Error(`grades upsert: ${gErr.message}`);

  const { error: cErr } = await admin
    .from("conversations")
    .update({ needs_revision: false })
    .eq("id", CONVERSATION_ID);
  if (cErr) throw new Error(`conversations update: ${cErr.message}`);

  // ---- verify ----
  const { data: after, error: vErr } = await admin
    .from("conversations")
    .select("status, closed_at, closed_by, needs_revision")
    .eq("id", CONVERSATION_ID)
    .single();
  if (vErr) throw new Error(`verify conversation: ${vErr.message}`);

  const { data: saved, error: vErr2 } = await admin
    .from("grades")
    .select("grade, comment, graded_by, grader:profiles!grades_graded_by_fkey(full_name, code)")
    .eq("conversation_id", CONVERSATION_ID)
    .single();
  if (vErr2) throw new Error(`verify grade: ${vErr2.message}`);

  console.log("\n=== POST-STATE ===");
  console.log("  grade stored   :", saved.grade, "/", maxGrade);
  console.log("  grader         :", (saved.grader as unknown as { full_name: string }).full_name, `(${(saved.grader as unknown as { code: string }).code})`);
  console.log("  needs_revision :", after.needs_revision);
  console.log("  status         :", after.status, "(closed + graded => completed)");

  // effective status as the app computes it
  const { data: hasGrade } = await admin
    .from("grades")
    .select("grade")
    .eq("conversation_id", CONVERSATION_ID)
    .not("grade", "is", null);
  const hasAnyGrade = (hasGrade ?? []).length > 0;
  const effective = after.status === "closed" || hasAnyGrade ? "completed" : after.status;
  console.log("  effective      :", effective);

  // class A teacher summary impact
  const { data: classA } = await admin
    .from("assignments")
    .select("id, title, classes(name)")
    .eq("id", conv.assignment_id)
    .single();
  console.log("\n=== IMPACT ===");
  const { data: stat } = await admin
    .from("conversations")
    .select("status")
    .eq("assignment_id", conv.assignment_id);
  if (!classA) throw new Error("assignment missing for impact report");
  const className = (classA.classes as unknown as { name?: string } | null)?.name ?? "—";
  console.log(`  ${className} / ${classA.title}: ${stat?.length ?? 0} submissions, 1 of them just moved to completed`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
