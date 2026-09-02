/**
 * Phase 15b — Database integration tests.
 *
 * Runs against a local Supabase (docker) by default via env vars.
 * Uses the service-role client (server-side only) so triggers and
 * constraints are exercised end-to-end while RLS is bypassed (RLS itself
 * is covered by the security review). Creates throwaway test rows and
 * removes them at the end.
 *
 * Run: npm run test:db
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

async function createUser(email: string, role: "admin" | "teacher" | "student", name: string, code: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Passw0rd!123", email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const { error: perr } = await admin.from("profiles").insert({
    id: data.user.id,
    full_name: name,
    email,
    code,
    role,
    must_change_password: false
  });
  if (perr) throw new Error(`profile ${email}: ${perr.message}`);
  return data.user.id;
}

async function signedInClient(email: string) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await c.auth.signInWithPassword({ email, password: "Passw0rd!123" });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function run() {
  const suffix = `it${Date.now()}`;
  const tag = `it-${suffix}`;
  const ids: string[] = [];

  console.log("Seed test data...");
  const teacherId = await createUser(`${tag}-t@wajebaty.local`, "teacher", `مُدرّس ${tag}`, `T${tag.slice(-6)}`);
  const studentA = await createUser(`${tag}-a@wajebaty.local`, "student", `طالب أ ${tag}`, `S${tag.slice(-6)}A`);
  const studentB = await createUser(`${tag}-b@wajebaty.local`, "student", `طالب ب ${tag}`, `S${tag.slice(-6)}B`);
  ids.push(teacherId, studentA, studentB);

  // class
  const { data: cls, error: clsErr } = await admin.from("classes").insert({ name: `صف ${tag}`, created_by: teacherId }).select("*").single();
  if (clsErr) throw new Error("create class: " + clsErr.message);
  ids.push(cls.id);
  await admin.from("class_teachers").insert({ class_id: cls.id, teacher_id: teacherId });
  await admin.from("class_students").insert([
    { class_id: cls.id, student_id: studentA },
    { class_id: cls.id, student_id: studentB }
  ]);

  console.log("\nTest: publish assignment");
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: assn, error: assnErr } = await admin
    .from("assignments")
    .insert({
      class_id: cls.id,
      teacher_id: teacherId,
      created_by: teacherId,
      title: `حفظ ${tag}`,
      instructions: "راجع ثم سجل",
      due_at: dueAt,
      max_grade: 20,
      status: "published"
    })
    .select("*")
    .single();
  if (assnErr) throw new Error("create assignment: " + assnErr.message);
  ids.push(assn.id);

  const { data: convsA } = await admin.from("conversations").select("id, student_id").eq("assignment_id", assn.id);
  check("publishing creates exactly one conversation per enrolled student", (convsA ?? []).length === 2);
  const studentSet = new Set((convsA ?? []).map((c) => c.student_id));
  check("conversations cover both students", studentSet.has(studentA) && studentSet.has(studentB));

  const { data: notifA } = await admin
    .from("notifications")
    .select("id")
    .eq("assignment_id", assn.id)
    .eq("type", "new_assignment");
  check("new_assignment notification created for students", (notifA ?? []).length >= 2);

  console.log("\nTest: conversation uniqueness (re-publish must not duplicate)");
  const { error: repub } = await admin.from("assignments").update({ status: "published" }).eq("id", assn.id);
  // guard_published_assignment blocks editing a published assignment's status back to published? It blocks status distinct from 'published' change. Setting published->published: old.status='published', new.status='published', no guard violation.
  const { data: convsB } = await admin.from("conversations").select("id").eq("assignment_id", assn.id);
  check("no duplicate conversations after re-publish", (convsB ?? []).length === 2);
  check("re-publish to same status is allowed (idempotent)", !repub);

  console.log("\nTest: published assignment is frozen");
  const { error: editErr } = await admin.from("assignments").update({ title: "تعديل غير مسموح" }).eq("id", assn.id);
  check("editing a published assignment is rejected", editErr !== null && /لا يمكن تعديله/.test(editErr.message ?? ""));

  console.log("\nTest: enrollment creates conversations for published assignments");
  const lateStudent = await createUser(`${tag}-c@wajebaty.local`, "student", `طالب متأخر ${tag}`, `S${tag.slice(-6)}C`);
  ids.push(lateStudent);
  await admin.from("class_students").insert({ class_id: cls.id, student_id: lateStudent });
  const { data: convLate } = await admin
    .from("conversations")
    .select("student_id")
    .eq("assignment_id", assn.id)
    .eq("student_id", lateStudent);
  check("late-enrolled student gets a conversation for the published assignment", (convLate ?? []).length === 1);

  console.log("\nTest: message notification");
  const convA = (convsA ?? []).find((c) => c.student_id === studentA)!;
  const { error: msgErr } = await admin.from("messages").insert({
    conversation_id: convA.id,
    sender_id: studentA,
    sender_role: "student",
    kind: "text",
    body: "أرسلت الواجب"
  });
  check("student can insert a message", !msgErr);
  const { data: tNotifs } = await admin
    .from("notifications")
    .select("id")
    .eq("conversation_id", convA.id)
    .eq("type", "message");
  check("teacher notified about student message", (tNotifs ?? []).length >= 1);

  console.log("\nTest: grading + grade notification");
  const { error: gradeErr } = await admin.from("grades").upsert(
    {
      conversation_id: convA.id,
      assignment_id: assn.id,
      student_id: studentA,
      grade: 19,
      comment: "ممتاز",
      graded_by: teacherId
    },
    { onConflict: "conversation_id" }
  );
  check("grade rows inserted", !gradeErr);
  const { data: grades } = await admin.from("grades").select("grade, comment").eq("conversation_id", convA.id);
  check("grade value and comment stored", grades?.[0]?.grade === 19 && grades?.[0]?.comment === "ممتاز");
  const { data: gNotifs } = await admin
    .from("notifications")
    .select("id")
    .eq("conversation_id", convA.id)
    .eq("type", "grade_recorded");
  check("grade_recorded notification created", (gNotifs ?? []).length >= 1);

  console.log("\nTest: notification cancellation (closed conversations skip reminders)");
  const { error: closeErr } = await admin
    .from("conversations")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", convA.id);
  check("conversation closes", !closeErr);

  const { data: remindersClosed, error: rpcErr } = await admin.rpc("enqueue_due_reminders");
  check("enqueue_due_reminders runs", !rpcErr && typeof remindersClosed === "number");
  const { data: closedDupes } = await admin
    .from("notifications")
    .select("id")
    .eq("conversation_id", convA.id)
    .in("type", ["due_today", "due_tomorrow"]);
  check("closed conversation produced no reminder", (closedDupes ?? []).length === 0);

  console.log("\nTest: due-today reminder for open, unsubmitted conversation");
  const dueToday = new Date().toISOString();
  // convB assignment already has due_at tomorrow; set to today via a NEW assignment (published) so reminder fires
  const { data: assnToday, error: aTe } = await admin
    .from("assignments")
    .insert({
      class_id: cls.id,
      teacher_id: teacherId,
      created_by: teacherId,
      title: `مستحق اليوم ${tag}`,
      instructions: "سجّل",
      due_at: dueToday,
      max_grade: 20,
      status: "published"
    })
    .select("id")
    .single();
  if (aTe) throw new Error("create due-today assignment: " + aTe.message);
  ids.push(assnToday.id);
  const { data: convBT } = await admin
    .from("conversations")
    .select("id")
    .eq("assignment_id", assnToday.id)
    .eq("student_id", studentB);
  const convR = (convBT ?? [])[0];
  await admin.rpc("enqueue_due_reminders");
  const { data: dueTodayNotifs } = await admin
    .from("notifications")
    .select("id")
    .eq("conversation_id", convR?.id)
    .eq("type", "due_today");
  check("due_today reminder created for open unsubmitted conversation", (dueTodayNotifs ?? []).length >= 1);
  await admin.rpc("enqueue_due_reminders");
  const { data: dueTodayNotifs2 } = await admin
    .from("notifications")
    .select("id")
    .eq("conversation_id", convR?.id)
    .eq("type", "due_today");
  check("reminders are deduplicated (no duplicates on 2nd run)", (dueTodayNotifs2 ?? []).length === 1);

  console.log("\nTest: video deletion keeps records and grades");
  const { data: sub, error: subErr } = await admin
    .from("submissions")
    .insert({
      conversation_id: convA.id,
      assignment_id: assn.id,
      student_id: studentA,
      attempt_number: 1,
      video_path: `submissions/${assn.id}/${studentA}/attempt-1.mp4`,
      video_name: "attempt-1.mp4",
      video_mime: "video/mp4",
      video_size: 1000
    })
    .select("id")
    .single();
  check("video submission record inserted", !subErr);
  ids.push(sub?.id);

  // age the closed conversation by 31 days so cleanup targets it
  await admin.from("conversations").update({ closed_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() }).eq("id", convA.id);
  const { data: del1 } = await admin.rpc("cleanup_closed_conversation_files");
  check("cleanup runs and logs a run", typeof del1 === "number");
  const { data: subAfter } = await admin.from("submissions").select("video_path, video_name, video_mime, video_size").eq("id", sub?.id).single();
  check("video file fields cleared from submission record", subAfter?.video_path === null && subAfter?.video_name === null);
  const { data: gradeAfter } = await admin.from("grades").select("grade, comment").eq("conversation_id", convA.id).single();
  check("grade preserved after video deletion", gradeAfter?.grade === 19 && gradeAfter?.comment === "ممتاز");
  const { data: subStill } = await admin.from("submissions").select("id").eq("id", sub?.id);
  check("submission record preserved", (subStill ?? []).length === 1);

  console.log("\nTest: submission storage upload authorization (can_upload_media_object)");
  const future = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const { data: assnUp, error: upErr } = await admin
    .from("assignments")
    .insert({
      class_id: cls.id,
      teacher_id: teacherId,
      created_by: teacherId,
      title: `رفع ${tag}`,
      instructions: "سجّل",
      due_at: future,
      max_grade: 20,
      status: "published"
    })
    .select("id")
    .single();
  if (upErr) throw new Error("create upload-auth assignment: " + upErr.message);
  ids.push(assnUp.id);
  const { data: convUp } = await admin
    .from("conversations")
    .select("id, student_id")
    .eq("assignment_id", assnUp.id)
    .eq("student_id", studentA);
  const convUpA = (convUp ?? [])[0];
  const upPath = `submissions/${convUpA?.id}/1/video.mp4`;

  const stu = await signedInClient(`${tag}-a@wajebaty.local`);
  const { data: canUp } = await stu.rpc("can_upload_media_object", { object_name: upPath });
  check("can_upload_media_object allows valid pre-due submission upload", canUp === true);

  // overdue: move due_at into the past -> storage-level check must reject
  await admin.from("assignments").update({ due_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }).eq("id", assnUp.id);
  const { data: canUpLate } = await stu.rpc("can_upload_media_object", { object_name: upPath });
  check("can_upload_media_object rejects upload past the deadline (no orphan files)", canUpLate === false);

  // closed conversation: storage-level check must reject
  await admin.from("assignments").update({ due_at: future }).eq("id", assnUp.id);
  await admin.from("conversations").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", convUpA?.id);
  const { data: canUpClosed } = await stu.rpc("can_upload_media_object", { object_name: upPath });
  check("can_upload_media_object rejects upload after conversation closure", canUpClosed === false);

  console.log("\nCleanup test data...");
  const safeDelete = async (table: string, column: string, value: string) => {
    const { error } = await admin.from(table).delete().eq(column, value);
    if (error) console.error(`  cleanup ${table} ${column}=${value}: ${error.message}`);
  };
  await safeDelete("messages", "conversation_id", convA.id);
  for (const id of ids) {
    await safeDelete("grades", "student_id", id);
    await safeDelete("submissions", "student_id", id);
    await safeDelete("conversations", "student_id", id);
    await safeDelete("notifications", "user_id", id);
    await safeDelete("class_students", "student_id", id);
    await safeDelete("class_teachers", "teacher_id", id);
    await safeDelete("assignments", "created_by", id);
    await safeDelete("classes", "created_by", id);
    await safeDelete("profiles", "id", id);
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
  await safeDelete("assignments", "class_id", cls.id);
  await safeDelete("classes", "id", cls.id);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("Failed:", failures.join(", "));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Integration test crashed:", e);
  process.exit(1);
});
