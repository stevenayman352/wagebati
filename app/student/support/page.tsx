import { requireRole } from "@/lib/auth";
import { loadStudentSupportThread } from "@/lib/support/queries";
import { supportUnreadTotal } from "@/lib/support/reader";
import { SupportChat } from "@/components/support-chat";
import { StartSupportThread } from "@/components/start-support-thread";
import { AppNav } from "@/components/app-nav";
import { BackButton } from "@/components/back-button";
import { LifeBuoy } from "lucide-react";

export const metadata = { title: "الدعم" };

export default async function StudentSupportPage() {
  const profile = await requireRole(["student"]);

  const [payload, unread] = await Promise.all([
    loadStudentSupportThread(profile),
    supportUnreadTotal(profile)
  ]);

  return (
    <>
      <div className="relative flex h-dvh flex-col overflow-hidden">
        <header className="z-30 flex items-center gap-3 border-b border-border/60 bg-card/95 px-4 py-3 shadow-sm backdrop-blur-xl md:px-6">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
            <BackButton fallbackHref="/student" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold leading-snug md:text-2xl">الدعم</h1>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 px-2 pt-2 pb-20 sm:px-4 md:px-6 md:pb-24">
          {payload ? (
            <div className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-[var(--radius-lg)] border border-border/70 bg-card shadow-card">
              <SupportChat
                threadId={payload.thread.id}
                initial={payload.messages}
                signed={payload.signed}
                mineId={profile.id}
              />
            </div>
          ) : (
            <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-center">
              <div
                className="w-full max-w-md animate-slide-up rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-10 text-center"
                style={{ animationDelay: "60ms" }}
              >
                <div className="relative mx-auto mb-3 flex size-10 items-center justify-center">
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-splash-halo rounded-full bg-primary/25 blur-lg"
                  />
                  <LifeBuoy className="relative size-10 text-primary/60" />
                </div>
                <p className="font-semibold text-foreground">محتاج مساعدة؟</p>
                <p className="mt-1 mb-5 text-sm text-muted-foreground">
                  ابدأ محادثة مع الدعم، وهنرد عليك هنا في نفس الصفحة.
                </p>
                <StartSupportThread />
              </div>
            </div>
          )}
        </main>
      </div>
      <AppNav role="student" supportUnread={unread} />
    </>
  );
}
