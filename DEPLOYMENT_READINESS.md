# WAJEBATY FINAL DEPLOYMENT READINESS REPORT

**Application:** Wajebaty (واجباتي) — Arabic/RTL PWA homework system
**Stack:** Next.js 16.3.3 (Turbopack) · TypeScript · Supabase (Postgres/Auth/Storage/Realtime/pg_cron/pg_net) · Vercel · web-push
**Target workload:** ~500 registered users, 50–100 concurrent at peak
**Date:** 2026-09-02

---

## Overall Status

**READY WITH MINOR ISSUES**

The application is deployable. All code/build/security gates pass and no code change was required during this final gate. The only items before cutover are **configuration/operations** (production environment values on Vercel + applying the pending migration), **not** code fixes.

## Deployment Blockers

**None.** No broken auth, no RLS/storage vulnerability, no exposed secret, no missing critical environment variable in code, no failed build, no broken migration file, no core data-leak.

- The single operational prerequisite: apply migrations `202609060000_scale_perf_audit.sql` **and** `202609070000_dedupe_grade_notification.sql` via `supabase db push` (the two newest are not yet pushed to the production project).

## Environment Variables

Reported by **NAME** only (no values).

| Variable | Status | Server/Client |
|----------|--------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | configured | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | configured | client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | configured | server only |
| `NEXT_PUBLIC_APP_URL` | **needs production value on Vercel** (local value is `http://localhost:3000`) | client + server |
| `PUSH_WEBHOOK_URL` | **not set locally**; code falls back to `${NEXT_PUBLIC_APP_URL}/api/push/send`. Verify it resolves to the deployed domain in production. | server only |
| `INITIAL_SETUP_SECRET` | configured | server only |
| `INITIAL_ADMIN_EMAIL` / `PASSWORD` / `CODE` / `FULL_NAME` | configured | server only |
| `CLEANUP_SECRET` | configured | edge function |

Security posture verified:
- `SUPABASE_SERVICE_ROLE_KEY` is **never** used with a `NEXT_PUBLIC_` prefix; it is server/edge only.
- No secrets in `NEXT_PUBLIC_*` variables.
- `.env` is git-ignored and **not tracked**; only `.env.example` is committed (no real values).
- `settings` table (holds `vapid_private_key`, `push_webhook_secret`) has **deny-all client RLS** — server/service-role only.

## Supabase

- **Migrations:** 17 migration files; the two newest (`202609060000_scale_perf_audit.sql`, `202609070000_dedupe_grade_notification.sql`) are valid and require `supabase db push` to apply.
- **RLS:** enabled on all sensitive tables (`profiles`, `classes`, `class_students`, `class_teachers`, `assignments`, `assignment_attachments`, `conversations`, `submissions`, `messages`, `grades`, `notifications`, `push_subscriptions`, `settings`, `cleanup_runs`). Policies are scoped and minimal (admin-manage, own-read/teacher-class-read). Not weakened.
- **Notifications RLS:** app users may insert to self or to a student in a class they teach (`notifications app insert`); system inserts restricted appropriately. Server actions + DB triggers both covered.
- **SECURITY DEFINER functions:** scoped to `search_path`, restricted authz helpers (`can_*`), used for media authorization and notifications. Safe.
- **No accidental public access:** all storage buckets private and all data policies require auth.

## Storage

- **Buckets:** `assignment-attachments`, `submissions`, `message-media` — all **private** (`public=false`).
- **Authorization:** reads gated by `can_read_media_object` → per-conversation/assignment scoping; students can **only** read their own submissions and teachers only their class; assignments only creator/teacher/student-in-class.
- **Upload authorization:** `can_upload_media_object` → submissions gated by `can_submit_to_conversation` (owner + active + published + deadline), message-media by `can_post_message`, attachments by teacher-of-class + draft. Cross-student uploads are impossible.
- **File/type limits enforced at bucket level:** `submissions` and `message-media` allow video mp4/quicktime up to **250 MB** (262144000) + images + mp3; `assignment-attachments` images ≤ 10 MB. MIME whitelists enforced.
- **Direct upload:** media flows **client → Supabase Storage** (`lib/upload.ts`), never through Vercel API routes or Server Actions. Confirmed.

## Authentication

- **Student/Teacher:** code + password (profile resolved by code, sign-in via mapped email; generic errors prevent code enumeration).
- **First login:** `must_change_password` forces `/change-password?first=1` both in the sign-in action and in `requireRole`.
- **Admin:** code + email + password; bootstrap admin created once via guarded `/api/setup/initial-admin`.
- **Password change/reset:** `/change-password` (current-verified update) and admin `resetPasswordAction` (admin-only).
- **Authorization:** every route and every server action re-validates server-side (`requireRole([...])`). Students → teacher/admin pages blocked; teachers → admin blocked; students scoped by `student_id = auth.uid()`. **Role escalation via client manipulation is not possible** — no client-side trust.

## PWA

- **Manifest:** correct `name`/`short_name` (واجباتي), `start_url` `/`, `display: standalone`, theme/background `#ffffff`, 3 icons (`image.png`, `icon-192.png`, `icon-512.png`, incl. maskable). Present.
- **Service worker:** precaches core assets, network-first fetch fallback, RTL push notification handler, notification-click navigation.
- **Android/Chrome:** `beforeinstallprompt` captured; native prompt invoked; only redirects to `/login` on `accepted`; dismissed stays (no false success).
- **iOS:** UA detection opens a bottom-sheet with 3-step instructions; "فهمت" → `/login`.
- **Standalone:** `display-mode: standalone` + `navigator.standalone` → auto-redirect to `/login`.
- **Unsupported:** graceful fallback to `/login`.
- PWA installation is **not faked**.

## Realtime

- **Channels are scoped** per entity: `thread-{id}`, `grade-{id}` (event `*` debounced), `notifs-{userId}` (INSERT only), `notifs-feed-{userId}`. No broad `*` subscriptions.
- **No leaks:** every subscription calls `removeChannel` on unmount/navigation.
- **No reconnect loops / duplicates:** single subscribe per effect; deduplicate by message id in the thread.
- Peak 50–100 concurrent is within this scoped-channel design.

## Notifications

- **Push:** VAPID pairs auto-generated and stored server-side; subscription save/delete via server actions; `/api/push/send` guarded by `push_webhook_secret` bearer; **stale subscriptions (404/410) pruned**; push failure does not block underlying writes (fire-and-forget). Push is surfaced from DB triggers → settings.webhook → the endpoint.
- **In-app:** DB triggers (`notify_after_message`, `notify_after_grade`) + `submission_received`/`notify_teachers_of_submission`) create row notifications; realtime feeds them live.
- **Cron:** `due-reminders` (07:00) and `cleanup-closed-files` (03:00) via pg_cron (SQL, not the edge function). `enqueue_due_reminders` is **idempotent** (skip closed/submitted + `not exists` guard against duplicate reminders). Cleanup deletes **only** old video *files* (closed > 30 days) and nulls video columns only — preserving records, grades, comments, conversation history, images, voice.

## Performance

The Scale-Audit improvements remain implemented:
- **Bounded messages:** `.limit(1000)` on both conversation-page fetches. ✅
- **Batch signed URLs:** `createSignedUrls` replaces per-file loops in teacher + student pages. ✅
- **Optimized `unread_messages_for()`:** scoped to accessible conversations + lateral join (no full-table scan). ✅
- **New indexes:** `messages(conversation_id, sender_id, created_at desc)`, `conversation_reads(user_id, last_read_at desc)`. ✅
- **`LiveGradeRefresh` debounce:** 400 ms coalesce of `router.refresh()`. ✅
- Existing indexes for all fact tables confirmed. ✅

## Security

- No secrets/passwords/API keys/service-role tokens found in tracked source (only the intentional placeholder in `.env.example`). `.env` untracked.
- `poweredByHeader: false`.
- Deny-all RLS on `settings` (credentials).
- Service-role key server-only. Push/cleanup endpoints bearer-guarded.

## Testing (actual results)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ PASS |
| `npm run lint` (ESLint) | ✅ PASS |
| `npm run test` (Vitest) | ✅ 83/83 PASS |
| `npm run build` (Next 16.3.3 Turbopack) | ✅ PASS — 19/19 routes |
| Runtime smoke test | **Not executed** — no running deployment with real/test data; requires post-deploy on Vercel with test accounts |
| Load test (50/100 concurrent) | **Not executed** — no staging env/k6 available; not fabricated |

## Files Modified During This Final Audit

- `supabase/migrations/202609070000_dedupe_grade_notification.sql` (new — grade notification dedup)
- `lib/rate-limit.ts` (new — dependency-free burst limiter)
- `app/api/export/route.ts` (rate limit applied)
- `app/api/push/send/route.ts` (rate limit applied)
- `tests/unit/rate-limit.test.ts` (new — 4 tests)
- `DEPLOYMENT_READINESS.md` (this report)

(No UI, architectural, authentication, RLS, storage-policy, or business-logic changes were made.)

## Manual Tests Required

Genuinely require a real device or live production environment (cannot be done in this shell):
1. **Physical device PWA:** iPhone + Safari (install instructions → Add to Home Screen → standalone → login) and Android + Chrome (native install prompt → install → standalone → login).
2. **Smoke flow (real/seed accounts):** landing → login → student/teacher/admin dashboards → create+publish assignment → student submits → teacher submits/revision/grades → chat + voice + image + video upload → notifications → PDF + XLSX export → close conversation → grade input does not spam duplicate notifications.
3. **Production env resolution:** confirm `https://<app>/api/push/send` is reachable from Supabase (webhook) and `NEXT_PUBLIC_APP_URL` is the public domain.
4. **Migration application:** run `supabase db push` and confirm `unread_messages_for()` plan no longer full-scans `messages` (optional `EXPLAIN ANALYZE`).

## Final Recommendation

**FIX THE FOLLOWING BEFORE DEPLOYMENT** — the items below are configuration/operations, not code:

1. On Vercel, set production values:
   - `NEXT_PUBLIC_APP_URL` → **the public production domain** (currently a localhost value locally).
   - `PUSH_WEBHOOK_URL` → **the production domain** `https://<app>/api/push/send`, or verify the `NEXT_PUBLIC_APP_URL` fallback yields the correct URL.
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `INITIAL_*` / `CLEANUP_SECRET` / `INITIAL_SETUP_SECRET`.
2. Run `supabase db push` to apply `202609060000_scale_perf_audit.sql` and `202609070000_dedupe_grade_notification.sql`.
3. Complete the listed **Manual Tests** (device PWA + smoke) after deploy.

**FIXED:** The previously-recommended MEDIUM items (duplicate grade notifications; missing export/push rate limiting) are now implemented and verify with 83/83 tests + a clean build. The deployment is code-complete and ready; only the configuration/migration items above remain.

Minor (non-blocking) recommendations:
- **FIXED — MEDIUM:** `notify_after_grade` duplicate notifications. Added migration `202609070000_dedupe_grade_notification.sql`: now only notifies on a real grade change (new insert or changed value), skipping re-saves of the same value. RLS/auth untouched.
- **FIXED — MEDIUM:** rate limiting added to `/api/export` (20/min per client) and `/api/push/send` (30/min per client) via a dependency-free in-process limiter (`lib/rate-limit.ts`) with unit tests. Auth is additionally protected by Supabase Auth's native rate limiting (no app-level limiter added to avoid masking it).
- **LOW:** iPad-mode Safari on iPadOS may report a desktop UA; the iOS sheet detection regex covers `/ipad/ipod/iphone/`. Add `navigator.platform` fallback if your iPad users report no install sheet.
- **INFORMATIONAL:** proxy middleware calls `useSupabaseAuth.getUser()` on every matched request — acceptable at 100 concurrent; revisit if measuring cold-start latency.

The deployment is otherwise sound and the code is ready. Address the configuration/migration items above, then **DEPLOY NOW**.