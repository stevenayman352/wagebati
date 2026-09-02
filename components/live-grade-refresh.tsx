"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LiveGradeRefresh({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const channel = supabase
      .channel(`grade-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "grades", filter: `conversation_id=eq.${conversationId}` },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 400);
        }
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  return null;
}