import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import webpush from "web-push";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

export async function POST(req: NextRequest) {
  const rl = rateLimit({ request: req, max: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }

  let parsed: { userId?: unknown; title?: unknown; body?: unknown; url?: unknown } = {};
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const userId = parsed.userId;
  if (typeof userId !== "string" || !userId) return Response.json({ error: "missing userId" }, { status: 400 });

  const sb = service();
  const { data: cfg } = await sb
    .from("settings")
    .select("vapid_public_key, vapid_private_key, push_webhook_secret")
    .eq("id", 1)
    .maybeSingle();

  if (!cfg?.vapid_public_key || !cfg?.vapid_private_key || !cfg?.push_webhook_secret) {
    return Response.json({ ok: false, error: "push not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cfg.push_webhook_secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!subs || subs.length === 0) return Response.json({ ok: true, count: 0 });

  webpush.setVapidDetails("mailto:admin@wajebaty.local", cfg.vapid_public_key, cfg.vapid_private_key);
  const payload = JSON.stringify({
    title: typeof parsed.title === "string" ? parsed.title : "واجباتي",
    body: typeof parsed.body === "string" ? parsed.body : "",
    url: typeof parsed.url === "string" ? parsed.url : "/"
  });

  const dead: string[] = [];
  const results = await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(sub.endpoint);
        return false;
      }
    })
  );

  if (dead.length > 0) await sb.from("push_subscriptions").delete().in("endpoint", dead);

  const count = results.filter(Boolean).length;
  const failed = results.length - count;
  return Response.json({ ok: true, count, failed });
}