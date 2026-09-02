import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("CLEANUP_SECRET");
  const provided = req.headers.get("x-cleanup-secret");

  if (!url || !key) {
    return Response.json({ error: "Missing Supabase environment" }, { status: 500 });
  }

  if (secret && provided !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("cleanup_closed_conversation_files");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ deletedCount: data ?? 0 });
});
