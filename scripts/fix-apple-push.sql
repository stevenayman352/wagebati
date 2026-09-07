-- ============================================================
-- Wagbati — Fix Apple (403) push: track which VAPID key each
-- subscription was created with, so stale keys get repaired.
-- PASTE & RUN IN Supabase → SQL Editor → New query → Run
-- ============================================================

alter table public.push_subscriptions
  add column if not exists vapid_key text;

-- Clear old subscriptions that have no key recorded; the app
-- re-subscribes them automatically with the current key on next open.
delete from public.push_subscriptions
where vapid_key is null;