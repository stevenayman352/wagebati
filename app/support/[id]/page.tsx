import Link from "next/link";
import { Lock } from "lucide-react";
import { clearGuestThreadAction } from "@/app/actions/support";
import { authenticateGuest, loadGuestThread } from "@/lib/support/queries";
import { hashSupportToken } from "@/lib/support/token";
import { GuestSupportChat } from "@/components/guest-support-chat";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

export const metadata = { title: "محادثة الدعم" };

/**
 * A guest's thread is reachable by possession of a capability token, so the id
 * alone grants nothing: `authenticateGuest` compares a hash of `?k=` against the
 * stored digest in constant time before any row is read.
 */
export default async function GuestSupportThreadPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { id } = await params;
  const { k } = await searchParams;

  const auth = await authenticateGuest(id, k ?? null);
  if (!auth) return <ThreadUnavailable restart={clearGuestThreadAction} />;

  const payload = await loadGuestThread(auth);
  // The thread can vanish between the token check and the read — most often
  // because this guest just signed in, which purges their pre-login thread.
  if (!payload) return <ThreadUnavailable restart={clearGuestThreadAction} />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden" dir="rtl">
      <header className="z-30 flex items-center gap-3 border-b border-border/60 bg-card/95 px-4 py-3 shadow-sm backdrop-blur-xl md:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
          <BackButton fallbackHref="/support" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-snug md:text-2xl">الدعم</h1>
            <p className="truncate text-xs text-muted-foreground">{payload.thread.requesterName}</p>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 px-2 pt-2 pb-20 sm:px-4 md:px-6 md:pb-24">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-[var(--radius-lg)] border border-border/70 bg-card shadow-card">
          <GuestSupportChat
            threadId={payload.thread.id}
            token={auth.token}
            initial={payload.messages}
            signed={payload.signed}
            mineId={`guest:${hashSupportToken(auth.token)}`}
          />
        </div>
      </main>
    </div>
  );
}

/**
 * Covers both an invalid token and a thread deleted at sign-in. The copy avoids
 * distinguishing the two on purpose: which case it was tells an attacker whether
 * a given thread id ever existed.
 *
 * `restart` clears the saved pointer before returning to /support. Without that,
 * /support keeps rendering continue-only and bounces the guest straight back to
 * this dead end.
 */
function ThreadUnavailable({ restart }: { restart: () => Promise<void> }) {
  return (
    <main dir="rtl" className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        {/* Same escape hatch as every other support surface: a guest who followed
            a dead link should not have to guess how to get back to /support. */}
        <div className="mb-5 flex justify-start">
          <BackButton fallbackHref="/support" />
        </div>
        <BrandLogo className="mx-auto mb-5 size-11 animate-slide-up rounded-xl" />
        <div className="animate-slide-up rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-10" style={{ animationDelay: "80ms" }}>
          <Lock className="mx-auto mb-3 size-10 text-primary/40" />
          <p className="font-semibold text-foreground">انتهت صلاحية المحادثة</p>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            رابط المحادثة مش صالح، أو المحادثة اتشالت بعد تسجيل الدخول.
          </p>
          <div className="flex flex-col gap-2">
            <form action={restart}>
              <Button type="submit" size="lg" className="w-full">
                ابدأ محادثة جديدة
              </Button>
            </form>
            <Button asChild variant="ghost">
              <Link href="/login">سجّل الدخول</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
