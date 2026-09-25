/**
 * Exports every application table to JSON as a data safety net before a
 * destructive operation. Uses the service-role client, so RLS is bypassed.
 *
 * Run: npm run backup:data
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TABLES = [
  "profiles",
  "classes",
  "class_teachers",
  "class_students",
  "assignments",
  "assignment_attachments",
  "conversations",
  "messages",
  "submissions",
  "submission_images",
  "grades",
  "notifications",
  "push_tokens",
  "push_subscriptions",
  "conversation_reads",
  "settings",
  "cleanup_runs"
] as const;

const PAGE = 1000;

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z").replace("T", "-");
}

async function fetchAll(table: string) {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE;
    const { data, error } = await admin
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} page ${page}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function fetchAuthUsers() {
  const users: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth.users page ${page}: ${error.message}`);
    users.push(...(data?.users ?? []));
    if (!data || data.users.length < 1000) break;
  }
  return users;
}

async function run() {
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const dir = path.join(process.cwd(), "scripts", "backups", `backup-${stamp()}`);
  await mkdir(dir, { recursive: true });

  const counts: Record<string, number> = {};
  let total = 0;

  for (const table of TABLES) {
    const rows = await fetchAll(table);
    counts[table] = rows.length;
    total += rows.length;
    await writeFile(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 2), "utf8");
    console.log(`  ${table.padEnd(24)} ${String(rows.length).padStart(6)}`);
  }

  const authUsers = await fetchAuthUsers();
  counts["auth.users"] = authUsers.length;
  await writeFile(path.join(dir, "auth-users.json"), JSON.stringify(authUsers, null, 2), "utf8");
  console.log(`  ${"auth.users".padEnd(24)} ${String(authUsers.length).padStart(6)}`);

  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        projectUrl: url,
        tables: counts,
        totalRows: total
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\nBackup written to ${dir}`);
  console.log(`Total rows: ${total}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
