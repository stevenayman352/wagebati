"use server";

import { randomBytes } from "node:crypto";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { getCurrentProfile } from "@/lib/auth";
import type { ActionState } from "@/lib/types";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function isValidVapidPublicKey(key: string | undefined): boolean {
  if (!key || typeof key !== "string" || key.length < 40) return false;
  try {
    const padded = key.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Buffer.from(padded, "base64");
    return bytes.length === 65 && bytes[0] === 4;
  } catch {
    return false;
  }
}

async function ensurePushConfig(): Promise<{ vapidPublicKey: string }> {
  const sb = service();
  const { data: cfg } = await sb
    .from("settings")
    .select("vapid_public_key, vapid_private_key, push_webhook_secret, push_webhook_url")
    .eq("id", 1)
    .maybeSingle();

  const patch: {
    vapid_public_key?: string;
    vapid_private_key?: string;
    push_webhook_secret?: string;
    push_webhook_url?: string;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };

  // The webhook URL is configurable via PUSH_WEBHOOK_URL. When unset we keep
  // whatever is already stored (the local/dev default from the settings row),
  // or fall back to the deployed app URL so push works out of the box in
  // production without hardcoding a host.docker.internal path.
  const envWebhookUrl = process.env.PUSH_WEBHOOK_URL;
  if (envWebhookUrl) {
    patch.push_webhook_url = envWebhookUrl;
  } else if (!cfg?.push_webhook_url) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    patch.push_webhook_url = appUrl ? `${appUrl.replace(/\/$/, "")}/api/push/send` : undefined;
  }

  if (!isValidVapidPublicKey(cfg?.vapid_public_key) || !cfg?.vapid_private_key) {
    const keys = webpush.generateVAPIDKeys();
    patch.vapid_public_key = keys.publicKey;
    patch.vapid_private_key = keys.privateKey;
  }
  if (!cfg?.push_webhook_secret) patch.push_webhook_secret = randomBytes(32).toString("hex");
  if (patch.vapid_public_key || patch.push_webhook_secret || patch.push_webhook_url) {
    const { error } = await sb.from("settings").update(patch).eq("id", 1);
    if (error) throw new Error(error.message);
  }
  return { vapidPublicKey: patch.vapid_public_key ?? cfg?.vapid_public_key ?? "" };
}

export async function getVapidPublicKeyAction(): Promise<string> {
  const config = await ensurePushConfig();
  return config.vapidPublicKey;
}

export async function savePushSubscriptionAction(formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "غير مصرح." };

  const endpoint = formData.get("endpoint");
  const p256dh = formData.get("p256dh");
  const auth = formData.get("auth");
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) return { ok: false, message: "اشتراك غير صالح." };
  if (typeof p256dh !== "string" || p256dh.length < 16) return { ok: false, message: "مفتاح غير صالح." };
  if (typeof auth !== "string" || auth.length < 8) return { ok: false, message: "رمز غير صالح." };

  const sb = service();
  await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await sb.from("push_subscriptions").insert({ user_id: profile.id, endpoint, p256dh, auth });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "" };
}

export async function deletePushSubscriptionAction(formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "غير مصرح." };

  const sb = service();
  const endpoint = formData.get("endpoint");
  if (typeof endpoint === "string" && endpoint) {
    await sb.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", profile.id);
  } else {
    await sb.from("push_subscriptions").delete().eq("user_id", profile.id);
  }
  return { ok: true, message: "" };
}