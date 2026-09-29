import { notFound } from "next/navigation";
import { UserRound } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSupportThreadForProfile, type SupportThreadRow } from "@/lib/support/queries";
import { SupportChat } from "@/components/support-chat";
import { ConfirmDeleteSupportThread } from "@/components/confirm-delete-support-thread";
import { BackButton } from "@/components/back-button";

export const metadata = { title: "محادثة دعم" };

export default async function AdminSupportThreadPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole(["admin"]);
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: thread } = await supabase
    .from("support_threads")
    .select("id, profile_id, guest_name, guest_code, last_message_at, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!thread) notFound();

  const payload = await loadSupportThreadForProfile(thread as SupportThreadRow, profile.id);

  return (
    <div className="flex h-dvh flex-col overflow-hidden" dir="rtl">
      <header className="z-30 flex flex-col gap-3 border-b border-border/60 bg-card/95 px-4 pt-3.5 pb-3 shadow-sm backdrop-blur-xl md:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
          <BackButton fallbackHref="/admin/support" />
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 break-words text-xl font-extrabold leading-snug md:text-2xl">
              {payload.thread.requesterName}
            </h1>
          </div>
          <ConfirmDeleteSupportThread threadId={payload.thread.id} />
        </div>

        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
            <UserRound className="size-3.5 shrink-0" />
            <span className="truncate">{payload.thread.requesterName}</span>
          </span>
          <span
            dir="ltr"
            className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-bold tracking-wider text-muted-foreground"
          >
            {payload.thread.requesterCode}
          </span>
          <span
            className={
              payload.thread.isGuest
                ? "rounded-full bg-amber-500/12 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400"
                : "rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
            }
          >
            {payload.thread.isGuest ? "زائر — بدون حساب" : "طالب"}
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 px-2 pt-2 pb-20 sm:px-4 md:px-6 md:pb-24">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-[var(--radius-lg)] border border-border/70 bg-card shadow-card">
          <SupportChat
            threadId={payload.thread.id}
            initial={payload.messages}
            signed={payload.signed}
            mineId={profile.id}
          />
        </div>
      </main>
    </div>
  );
}
