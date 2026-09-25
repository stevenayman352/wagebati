/**
 * One-off purge of chat media. Deletes the files in the `message-media`
 * bucket and the rows in the `messages` table while leaving grades,
 * students, classes, assignments, conversations and notifications intact.
 *
 * Conversations listed in KEEP_CONVERSATIONS are skipped entirely: their
 * messages and every file in their folder survive, so any status derived
 * from "this student wrote something" keeps rendering exactly as before.
 *
 * Dry run by default. Pass --confirm to actually delete.
 *
 * Run: npm run purge:media
 *      npm run purge:media -- --confirm
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeAssignmentStatus } from "../lib/assignment-status.ts";

const KEEP_CONVERSATIONS = new Set([
  "6952b63b-286b-4302-a525-bee4d94e7941" // شنودة عادل عدلى جيد (2504012)
]);

const BUCKET = "message-media";
const ROW_PAGE = 1000;
const CHUNK = 100;

const args = new Set(process.argv.slice(2));
const confirmed = args.has("--confirm");
const allowAnyHost = args.has("--allow-any-host");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
const log = (message = "") => console.log(message);
const rule = (title: string) => log(`\n--- ${title} ${"-".repeat(Math.max(0, 56 - title.length))}`);

async function countOf(table: string) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function fetchAllMessages() {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * ROW_PAGE;
    const { data, error } = await admin
      .from("messages")
      .select(
        "id, conversation_id, sender_id, sender_role, kind, body, storage_path, file_name, mime_type, file_size, duration_seconds, created_at"
      )
      .range(from, from + ROW_PAGE - 1);
    if (error) throw new Error(`messages page ${page}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < ROW_PAGE) break;
  }
  return rows;
}

type StoredObject = { path: string; size: number; updatedAt: string | null };

async function walkBucket(prefix: string, depth: number, out: StoredObject[]) {
  if (depth > 6) return;
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
  for (const entry of data ?? []) {
    const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null || entry.name === null) {
      await walkBucket(objectPath, depth + 1, out);
    } else {
      out.push({
        path: objectPath,
        size: Number(entry.metadata?.size ?? 0),
        updatedAt: entry.updated_at ?? entry.created_at ?? null
      });
    }
  }
}

async function snapshotStatuses() {
  const { data: conversations, error } = await admin
    .from("conversations")
    .select("id, status, closed_by, assignment:assignments!inner(due_at)");
  if (error) throw new Error(`conversations: ${error.message}`);

  const { data: grades, error: gErr } = await admin.from("grades").select("conversation_id");
  if (gErr) throw new Error(`grades: ${gErr.message}`);
  const graded = new Set((grades ?? []).map((g) => (g as { conversation_id: string }).conversation_id));

  const messages = await fetchAllMessages();
  const messaged = new Set(
    messages.filter((m) => m.sender_role === "student").map((m) => m.conversation_id as string)
  );

  const nowMs = Date.now();
  const snapshot = new Map<string, string>();
  for (const row of conversations ?? []) {
    const c = row as unknown as {
      id: string;
      status: string;
      closed_by: string | null;
      assignment?: { due_at: string | null } | null;
    };
    const shared = {
      status: c.status,
      closedBy: c.closed_by,
      hasGrade: graded.has(c.id),
      hasSubmission: false,
      hasStudentMessage: messaged.has(c.id),
      dueAt: c.assignment?.due_at ?? null,
      nowMs
    };
    snapshot.set(
      c.id,
      `${computeAssignmentStatus({ role: "student", ...shared })}|${computeAssignmentStatus({ role: "teacher", ...shared })}`
    );
  }
  return snapshot;
}

function diffSnapshots(before: Map<string, string>, after: Map<string, string>) {
  const changes: string[] = [];
  for (const [id, value] of before) {
    if (after.get(id) !== value) changes.push(`${id}: ${value} -> ${after.get(id)}`);
  }
  for (const id of after.keys()) if (!before.has(id)) changes.push(`${id}: NEW CONVERSATION`);
  return changes;
}

function groupByExt(list: StoredObject[]) {
  const out: Record<string, { n: number; b: number }> = {};
  for (const o of list) {
    const ext = (o.path.split(".").pop() ?? "?").toLowerCase();
    out[ext] = out[ext] ?? { n: 0, b: 0 };
    out[ext].n += 1;
    out[ext].b += o.size;
  }
  return out;
}

function groupByKind(list: Record<string, unknown>[]) {
  const out: Record<string, number> = {};
  for (const m of list) {
    const kind = String(m.kind);
    out[kind] = (out[kind] ?? 0) + 1;
  }
  return out;
}

const totalBytes = (list: StoredObject[]) => list.reduce((acc, o) => acc + o.size, 0);

async function run() {
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!allowAnyHost && !/\.supabase\.co$/.test(new URL(url).hostname)) {
    throw new Error(`Refusing to run against ${url} — not a .supabase.co host. Use --allow-any-host to override.`);
  }
  if (KEEP_CONVERSATIONS.size === 0) {
    throw new Error("KEEP_CONVERSATIONS is empty; refusing to purge every conversation.");
  }

  log(`Target : ${url}`);
  log(`Mode   : ${confirmed ? "CONFIRM — files and rows WILL be deleted" : "DRY RUN — nothing will be deleted"}`);

  const protectedTables = [
    "profiles",
    "classes",
    "class_students",
    "class_teachers",
    "assignments",
    "grades",
    "conversations",
    "notifications"
  ] as const;

  const before: Record<string, number> = {};
  for (const table of protectedTables) before[table] = await countOf(table);

  const statusBefore = await snapshotStatuses();

  rule("Inventory");
  const messages = await fetchAllMessages();
  const objects: StoredObject[] = [];
  await walkBucket("", 0, objects);

  const keepMessageIds = new Set(
    messages.filter((m) => KEEP_CONVERSATIONS.has(m.conversation_id as string)).map((m) => m.id as string)
  );
  const deleteMessages = messages.filter((m) => !keepMessageIds.has(m.id as string));

  const keptPrefixes = [...KEEP_CONVERSATIONS].map((id) => `message-media/${id}/`);
  const isKept = (o: StoredObject) => keptPrefixes.some((p) => o.path.startsWith(p));
  const keptObjects = objects.filter(isKept);
  const deleteObjects = objects.filter((o) => !isKept(o));

  const keepBytes = totalBytes(keptObjects);
  const deleteBytes = totalBytes(deleteObjects);

  log(`Messages total          : ${messages.length}`);
  log(`  messages to KEEP      : ${keepMessageIds.size}`);
  log(`  messages to DELETE    : ${deleteMessages.length}  ${JSON.stringify(groupByKind(deleteMessages))}`);
  log(`Files in bucket         : ${objects.length}`);
  log(`  files to KEEP         : ${keptObjects.length}  (${mb(keepBytes)})`);
  log(`  files to DELETE       : ${deleteObjects.length}  (${mb(deleteBytes)})`);
  for (const [ext, v] of Object.entries(groupByExt(deleteObjects)).sort()) {
    log(`      ${ext.padEnd(6)} ${String(v.n).padStart(4)} files  ${mb(v.b)}`);
  }
  log(`Space that will be freed: ${mb(deleteBytes)}`);

  rule("Protected rows (must not change)");
  for (const table of protectedTables) log(`  ${table.padEnd(18)} ${before[table]}`);

  const remainingAfter = new Set(
    messages.filter((m) => keepMessageIds.has(m.id as string)).map((m) => m.conversation_id as string)
  );
  const hadMessages = new Set(messages.map((m) => m.conversation_id as string));
  const emptied = [...hadMessages].filter((id) => !remainingAfter.has(id));

  if (!confirmed) {
    rule("Dry run complete");
    log("Nothing was deleted. Re-run with --confirm to execute.");
    return;
  }

  rule("Writing manifest");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z").replace("T", "-");
  const manifestPath = path.join(process.cwd(), "scripts", `purge-manifest-${stamp}.json`);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        projectUrl: url,
        keptConversations: [...KEEP_CONVERSATIONS],
        counts: {
          messagesTotal: messages.length,
          messagesKept: keepMessageIds.size,
          messagesDeleted: deleteMessages.length,
          filesTotal: objects.length,
          filesKept: keptObjects.length,
          filesDeleted: deleteObjects.length,
          bytesFreed: deleteBytes
        },
        protectedRowsBefore: before,
        conversationsEmptied: emptied.length,
        messagesDeletedRows: deleteMessages,
        filesDeleted: deleteObjects,
        filesKept: keptObjects
      },
      null,
      2
    ),
    "utf8"
  );
  log(`Manifest: ${manifestPath}`);

  rule("Deleting files");
  for (let i = 0; i < deleteObjects.length; i += CHUNK) {
    const chunk = deleteObjects.slice(i, i + CHUNK);
    const { error } = await admin.storage.from(BUCKET).remove(chunk.map((o) => o.path));
    if (error) throw new Error(`remove files at offset ${i}: ${error.message}`);
    log(`  removed ${Math.min(i + CHUNK, deleteObjects.length)} / ${deleteObjects.length}`);
  }

  rule("Deleting message rows");
  for (let i = 0; i < deleteMessages.length; i += CHUNK) {
    const chunk = deleteMessages.slice(i, i + CHUNK);
    const { error } = await admin
      .from("messages")
      .delete()
      .in(
        "id",
        chunk.map((m) => m.id as string)
      );
    if (error) throw new Error(`delete messages at offset ${i}: ${error.message}`);
    log(`  deleted ${Math.min(i + CHUNK, deleteMessages.length)} / ${deleteMessages.length}`);
  }

  rule("Resetting last_message_at");
  for (let i = 0; i < emptied.length; i += CHUNK) {
    const chunk = emptied.slice(i, i + CHUNK);
    const { error } = await admin
      .from("conversations")
      .update({ last_message_at: null })
      .in("id", chunk);
    if (error) throw new Error(`reset last_message_at at offset ${i}: ${error.message}`);
  }
  log(`  reset ${emptied.length} conversations`);

  await admin.from("cleanup_runs").insert({ deleted_count: deleteObjects.length });

  rule("Verification");
  let protectedOk = true;
  for (const table of protectedTables) {
    const now = await countOf(table);
    const same = now === before[table];
    if (!same) protectedOk = false;
    log(`  ${table.padEnd(18)} ${before[table]} -> ${now}  ${same ? "OK" : "CHANGED !!"}`);
  }

  const messagesLeft = await countOf("messages");
  const filesLeft: StoredObject[] = [];
  await walkBucket("", 0, filesLeft);
  log(`  ${"messages rows".padEnd(18)} ${messages.length} -> ${messagesLeft}  ${messagesLeft === keepMessageIds.size ? "OK" : "UNEXPECTED"}`);
  log(`  ${"files in bucket".padEnd(18)} ${objects.length} -> ${filesLeft.length}  ${filesLeft.length === keptObjects.length ? "OK" : "UNEXPECTED"}`);
  log(`  ${"bytes freed".padEnd(18)} ${mb(deleteBytes)}`);

  const changes = diffSnapshots(statusBefore, await snapshotStatuses());
  log(`  ${"status changes".padEnd(18)} ${changes.length}`);
  for (const change of changes.slice(0, 20)) log(`      ${change}`);

  if (!protectedOk) throw new Error("A protected table changed row count. Investigate immediately.");
  if (changes.length > 0) throw new Error("Assignment statuses changed. Investigate immediately.");

  log("\nPurge complete.");
}

run().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
