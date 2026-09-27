import { cookies } from "next/headers";
import { Suspense } from "react";
import { GuestSupportForm } from "@/components/guest-support-form";
import { GuestSupportContinue } from "@/components/guest-support-continue";
import { BackButton } from "@/components/back-button";
import { guestThreadHref, GUEST_THREAD_COOKIE, parseGuestThreadPointer } from "@/lib/support/guest-session";

export const metadata = { title: "الدعم" };

export default async function SupportPage() {
  // Read on the server so a returning guest never receives the new-thread form in
  // the HTML payload, let alone after hydration. Continuing the same conversation
  // is the only path offered once a pointer exists.
  const saved = parseGuestThreadPointer((await cookies()).get(GUEST_THREAD_COOKIE)?.value);

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden" dir="rtl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(48rem 38rem at 50% -12%, oklch(0.5 0.2 262 / 0.1), transparent 70%)"
        }}
      />
      <div
        aria-hidden
        className="animate-splash-shimmer pointer-events-none absolute -start-24 -top-24 size-56 rounded-full bg-gold/15 blur-3xl"
      />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-6">
        <header className="animate-page-in" style={{ animationDelay: "0ms" }}>
          <BackButton fallbackHref="/login" />
        </header>

        <div className="flex flex-1 flex-col justify-center py-6">
          <div
            className="mb-6 text-center"
            style={{ animation: "page-in 0.4s ease-out both", animationDelay: "40ms" }}
          >
            <h1 className="font-amiri text-3xl font-bold leading-tight">الدعم</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {saved
                ? "كمل من نفس المحادثة اللي بدأتها"
                : "تحت امركم في اي وقت ."}
            </p>
          </div>

          <div
            className="rounded-2xl border border-border/70 bg-card p-5 shadow-raise backdrop-blur-sm sm:p-6"
            style={{ animation: "slide-up 0.3s ease-out both", animationDelay: "120ms" }}
          >
            {saved ? (
              <GuestSupportContinue href={guestThreadHref(saved.threadId, saved.token)} />
            ) : (
              <Suspense fallback={<div className="h-64" />}>
                <GuestSupportForm />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
