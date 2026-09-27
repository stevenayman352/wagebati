import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessagesSquare, ShieldCheck } from "lucide-react";

/**
 * What a returning guest sees. This is the *only* thing /support offers once a
 * conversation exists, so continuing the same thread is the sole available path
 * — there is deliberately no "start a new conversation" control here.
 */
export function GuestSupportContinue({ href }: { href: string }) {
  return (
    <div className="grid gap-5 text-center">
      <div className="relative mx-auto flex size-16 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 animate-splash-halo rounded-full bg-primary/25 blur-lg"
        />
        <span className="relative flex size-16 items-center justify-center rounded-2xl bg-primary/[0.12]">
          <MessagesSquare className="size-7 text-primary" />
        </span>
      </div>

      <div>
        <p className="text-lg font-extrabold leading-snug">عندك محادثة شغّالة بالفعل</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          كل محادثة ليك بتتربط بمكانها. كمّل نفس الكلام عشان تفصلش تاريخك، وكمّل من
          نفس المحادثة دي.
        </p>
      </div>

      <Button asChild size="lg" className="h-12 w-full gap-2 text-base">
        <Link href={href} prefetch={true}>
          <ArrowLeft className="size-5" />
          كمّل المحادثة
        </Link>
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" />
        رابط المحادثة موجود عندك، ومحدش غيرك يقدر يفتحها
      </p>
    </div>
  );
}
