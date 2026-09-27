"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createGuestThreadAction,
  type CreateGuestThreadResult
} from "@/app/actions/support";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LifeBuoy, Send } from "lucide-react";
import { guestThreadHref } from "@/lib/support/guest-session";

const initial: CreateGuestThreadResult = { ok: false, message: "" };

/**
 * The new-conversation form. Rendered by /support *only* when the guest has no
 * saved pointer — a returning guest is routed to the continue card instead, so
 * this form is never something they can get back to.
 */
export function GuestSupportForm() {
  const [state, formAction, pending] = useActionState(createGuestThreadAction, initial);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const pushed = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.threadId && state.token && !pushed.current) {
      pushed.current = true;
      router.push(guestThreadHref(state.threadId, state.token));
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="guestName">الاسم</Label>
        <Input
          id="guestName"
          name="guestName"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          disabled={pending}
          className="transition-shadow duration-200 focus-visible:shadow-card"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="guestCode">كود الحساب (المحتاج الى مساعدة)</Label>
        <Input
          id="guestCode"
          name="guestCode"
          maxLength={20}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="مثال: 1234"
          dir="ltr"
          disabled={pending}
          className="text-center tracking-widest transition-shadow duration-200 focus-visible:shadow-card"
        />
        <p className="text-xs text-muted-foreground">
          كود الطالب المتسجل في الكارنيه بتاع الطالب .
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="body">رسالتك</Label>
        <Textarea
          id="body"
          name="body"
          required
          maxLength={4000}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="اوصف المشكلة اللي بتواجهك"
          disabled={pending}
          className="resize-none transition-shadow duration-200 focus-visible:shadow-card"
        />
      </div>

      {/* Honeypot: a real guest never sees this, so anything filled in is a bot. */}
      <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {state.message ? (
        <p
          role="alert"
          className="animate-pop rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="mt-1 gap-2">
        {pending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Send className="size-4" />
        )}
        {pending ? "جارِ الإرسال..." : "ابدأ المحادثة"}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <LifeBuoy className="size-3.5 shrink-0" />
        بتشوف الرد على طول في نفس الصفحة
      </p>
    </form>
  );
}
