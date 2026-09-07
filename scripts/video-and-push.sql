-- ============================================================
-- 1) RAISE STORAGE VIDEO LIMIT TO 5GB (no practical limit)
--    Run in Supabase → SQL Editor → New query → Run
-- ============================================================
update storage.buckets
set file_size_limit = 5368709120
where id in ('message-media', 'submissions');


-- ============================================================
-- 2) DIAGNOSTIC — run this and paste the result here.
--    It tells us exactly why notifications are (or aren't) working.
-- ============================================================
select push_webhook_url,
       (vapid_public_key  is not null) as has_vapid_key,
       (vapid_private_key is not null) as has_vapid_private,
       (push_webhook_secret is not null) as has_webhook_secret
from public.settings where id = 1;

select count(*) as phones_registered from public.push_subscriptions;

select jobname from cron.job order by 1;


-- ============================================================
-- 3) FORCE THE PUSH WEBHOOK TO YOUR REAL SITE (the reliable fix)
--    IMPORTANT: replace YOUR-SITE below with your real app address
--    (what you type in the browser to open the app), e.g.
--    https://wajebaty.vercel.app  — no / at the end.
--    Then uncomment (remove the two -- in front) and re-run.
-- ============================================================
-- update public.settings
-- set push_webhook_url = 'https://YOUR-SITE/api/push/send'
-- where id = 1;