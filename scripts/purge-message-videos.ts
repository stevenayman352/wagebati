import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "message-media";
const CHUNK = 100;

const args = new Set(process.argv.slice(2));
const confirmed = args.has("--confirm");
const allowAnyHost = args.has("--allow-any-host");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  if (!allowAnyHost && !/\.supabase\.co$/.test(new URL(url).hostname)) {
    throw new Error(`Refusing to run against ${url}. Use --allow-any-host to override.`);
  }

  const { data, error } = await admin
    .from("messages")
    .select("id, conversation_id, storage_path, file_size")
    .eq("kind", "video");

  if (error) throw new Error(`fetch video messages: ${error.message}`);

  const rows = (data ?? []) as { id: string; conversation_id: string; storage_path: string | null; file_size: number | null }[];
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p));

  console.log(`Target : ${url}`);
  console.log(`Mode   : ${confirmed ? "CONFIRM — video messages WILL be deleted" : "DRY RUN — nothing will be deleted"}`);
  console.log(`Video message rows : ${rows.length}`);
  console.log(`Storage files      : ${paths.length}`);
  console.log(`Approx bytes       : ${((rows.reduce((a, r) => a + (r.file_size ?? 0), 0)) / 1048576).toFixed(1)} MB`);

  if (!confirmed) {
    console.log("\nDry run complete. Re-run with --confirm to execute.");
    return;
  }

  console.log("\nDeleting storage files...");
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK);
    const { error } = await admin.storage.from(BUCKET).remove(chunk);
    if (error) throw new Error(`remove files: ${error.message}`);
    console.log(`  removed ${Math.min(i + CHUNK, paths.length)} / ${paths.length}`);
  }

  console.log("Deleting message rows...");
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await admin.from("messages").delete().in("id", chunk);
    if (error) throw new Error(`delete rows: ${error.message}`);
    console.log(`  deleted ${Math.min(i + CHUNK, ids.length)} / ${ids.length}`);
  }

  console.log("\nDone. Grades and other data were not touched.");
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});