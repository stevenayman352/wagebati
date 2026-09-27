import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Destroys a visitor's pre-login support thread once they sign in with the code
 * they gave us.
 *
 * The whole thread goes, including any admin replies and any uploaded media:
 * a student with an account files a fresh thread from /student/support instead.
 * This is a security feature as much as a data-cleanup one — if an admin posted
 * a login code in the chat, that code is destroyed at the moment of sign-in.
 *
 * Never throws. A failed purge must not block the login itself; the orphaned
 * thread is a cosmetic problem, whereas a thrown error here is a locked-out
 * student. Matching is on the verified profile code, and `profile_id is null`
 * keeps it from ever touching a real student's own thread.
 */
export async function purgeGuestSupportThreadsForCode(code: string): Promise<number> {
  if (!code) return 0;

  try {
    const admin = createSupabaseAdminClient();

    const { data: threads, error: threadsError } = await admin
      .from("support_threads")
      .select("id")
      .eq("guest_code", code)
      .is("profile_id", null);

    if (threadsError || !threads?.length) return 0;

    const ids = threads.map((t) => t.id as string);

    const { data: media } = await admin
      .from("support_messages")
      .select("storage_path")
      .in("thread_id", ids)
      .not("storage_path", "is", null);

    const paths = (media ?? [])
      .map((m) => m.storage_path as string | null)
      .filter((p): p is string => Boolean(p));

    if (paths.length) {
      const { error: removeError } = await admin.storage.from("support-media").remove(paths);
      if (removeError) {
        // Report loudly but keep going: the rows are still worth deleting, and a
        // failed object delete must not strand the thread.
        console.error("[support] failed to remove guest media:", removeError.message);
      }
    }

    // Cascades to support_messages and support_thread_reads.
    const { error: deleteError } = await admin.from("support_threads").delete().in("id", ids);
    if (deleteError) {
      console.error("[support] failed to purge guest threads:", deleteError.message);
      return 0;
    }

    return ids.length;
  } catch (error) {
    console.error("[support] guest purge failed:", error);
    return 0;
  }
}
