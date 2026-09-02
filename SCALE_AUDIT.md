# Wajebaty — Scale & Performance Audit Report

**Target:** Remain stable and performant for ~500 registered users, 50–100 concurrent at peak — without redesigning the UI, removing features, changing product behavior, replacing the architecture, or rewriting working code.
**Stack:** Next.js 16.3.3 (Turbopack) + TypeScript strict + Tailwind v4 + shadcn/ui + Supabase (Auth / Postgres / Storage / Realtime / pg_cron / pg_net) + web-push. Hosted on Vercel. RTL Arabic. 79 Vitest tests.
**Date:** 2026-09-02.

---

## 1. Readiness summary

The application is architecturally sound for the target scale. Storage uploads are **client-direct to Supabase Storage** (not proxied through Vercel), which removes the biggest single bottleneck for large media (videos up to 250 MB). Realtime is channel-scoped. RLS and security are intact and were **not** modified. The changes below are additive, behavior-preserving optimizations.

### Verified healthy (no action required)
- **Storage:** media uploads flow client → Supabase Storage via `lib/upload.ts::uploadWithProgress`; server only calls signed URLs. Large videos never cross the Vercel serverless function.
- **Notification feed:** `app/notifications/page.tsx` already bounds the list (`.limit(50)`) and uses an indexed, targeted count query. ✓
- **Exports:** `lib/export.ts` builds the XLSX matrix purely in-memory from one fetched result set; no per-record DB round-trips. PDF path uses server-side `jspdf`. ✓
- **Search:** the two client-side searches (`components/accounts-filter.tsx`, `components/student-search.tsx`) filter already-fetched, small in-memory lists (whole account list / one class roster). No unbounded server fetch triggered by typing. ✓
- **DB indexes:** core fact tables already carry the right indexes (`messages(conversation_id, created_at)`, `submissions(conversation_id)`, `grades(conversation_id)`, `notifications(user_id, is_read, created_at desc)`, `assignments(class_id)`, etc.). ✓
- **Realtime cleanup:** `ConversationThread`, `LiveGradeRefresh`, `NotificationFeed`, and `NotificationBell` all `removeChannel` on unmount. ✓

## 2. Findings & fixes applied

### F1 — Signed-URL N+1 (HIGH, fixed)
Conversation pages generated media URLs one-at-a-time in sequential `createSignedUrl` calls:
- `app/teacher/conversations/[id]/page.tsx` (per-message loop)
- `app/student/assignments/[id]/page.tsx` (per-attachment, per-submission-media, per-message loops)

**Fix:** replaced all sequential loops with batched `createSignedUrls(paths[], expiresIn)`, then rebuild the keyed maps from batch results. Round-trips drop from **O(N) to 1** per bucket per request.
- Teacher: `app/teacher/conversations/[id]/page.tsx`
- Student: `app/student/assignments/[id]/page.tsx` (attachments + submissions + messages all batched in a single `Promise.all`)

### F2 — Unbounded message fetches (MEDIUM, fixed)
Both chat pages loaded the entire message history with no cap. Added `.limit(1000)` as a safety bound in both conversation page queries. A 1:1 assignment conversation realistically stays well under this; the cap prevents pathological unbounded growth without changing UX.

### F3 — `unread_messages_for()` full-table scan (HIGH, fixed via new migration)
The RPC used by the teacher conversations page aggregated **every row in `messages`** before joining to conversations/reads — an O(total messages) scan on every dashboard load.

**Fix:** new migration `supabase/migrations/202609060000_scale_perf_audit.sql`:
1. Rewrote `unread_messages_for()` to first scope to the user's *accessible* conversations (small set, driven by `conversations_student_id_idx` / `class_teachers` / `is_teacher_for_class`) and aggregate messages via a **lateral join** so the planner walks only that conversation's messages through the index instead of scanning the whole table.
2. Added index `messages(conversation_id, sender_id, created_at desc)` to serve the unread lateral scan.
3. Added index `conversation_reads(user_id, last_read_at desc)`.

No RLS, no auth semantics, no product behavior changed (`grant execute` retained).

### F4 — `LiveGradeRefresh` refresh storm (MEDIUM, fixed)
`router.refresh()` fired on **every** `grades` realtime event (insert/update/delete). Rapid grade activity (e.g., value typed through in `GradeAutosave`) re-rendered the full server page per event.

**Fix:** debounced the refresh (400 ms) so bursts coalesce into a single `router.refresh()` in `components/live-grade-refresh.tsx`.

## 3. Recommendations accepted (no code change made)

- **Rate limiting / abuse control:** no rate limiter on auth or API routes (`/api/export`, `/api/push/send`). Recommended at the Vercel/edge or DB layer before public launch.
- **`markConversationReadAction` revalidation:** revalidates `/teacher` per read and per incoming message. Left as-is to preserve unread-badge freshness; harmless at this scale but worth revisiting if load grows.
- **Message-media/assignment-attachment signed URL TTL:** 600 s is generous for playback; acceptable for this scale.
- **Image optimization:** raw `<img>` tags (chat, submission history). At 500 users/100 concurrent this is fine; move to `next/image` only if media-heavy UI becomes a measurable cost.

## 4. Load testing status

- **Not executed:** no safe staging environment is authorized and `k6` is not installed. Per audit constraints, load tests were **not** run against production and no performance results were invented.
- **Scripts ready to run** once a staging build + env are available — see `LAST  section` recommendation.

## 5. Verification results

| Check | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | ✅ passed |
| `npm run lint` (`eslint .`) | ✅ passed |
| `npm run test` (Vitest) | ✅ 79/79 passed |
| `npm run build` (Next 16.3.3 Turbopack) | ✅ 19/19 routes compiled + generated |

## 6. Remaining recommendations (for staging, not blocking)

1. **Provision a staging Supabase + Vercel preview**, set `PUSH_WEBHOOK_URL` (still unset in `.env` — push to phones won't fire until configured), then run `k6` load tests for **50** and **100** concurrent users against the critical flows (login, load conversations, send message, load assignments, export).
2. Re-run `EXPLAIN ANALYZE` on `unread_messages_for()` after the migration via `supabase db push` to confirm the plan no longer full-scans `messages`.
3. Add rate limiting to `/api/export`, `/api/push/send`, and auth.
4. Optionally add a mobile-`/export`-style index on `notifications(user_id, created_at)` if the count query (already `is_read`-scoped) shows up hot.

**Per audit constraints, the note regarding `PUSH_WEBHOOK_URL` is the single production-readiness item that must be set before cutover.** All other findings are addressed or documented as accepted.