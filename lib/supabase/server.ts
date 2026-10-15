import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/supabase/config";

export async function createSupabaseServerClient() {
  requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isCookieWriteError =
              message.includes("Cookies can only be modified in a Server Action or Route Handler");
            if (!isCookieWriteError) {
              throw error;
            }
          }
        }
      }
    }
  );
}
