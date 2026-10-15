# Wajebaty (واجباتي) — Vercel CPU & Supabase Performance Audit

**Date:** 2026-10-15
**Scope:** READ-ONLY audit. No application code, database, security settings, environment variables, or deployments were changed. The only file created is this report.

---

## 1. Executive Summary

- The app is a Next.js 16 (App Router, `cacheComponents` + `partialPrefetching`) + Supabase application deployed on Vercel, with media compression done **client-side** (ffmpeg.wasm) and direct browser → Supabase Storage uploads.
- Observed Vercel metrics (~3h04m Fluid Active CPU out of a 4h rolling allowance in 30 days, 166K/1M function invocations, 115.7/360 GB-Hrs memory) indicate the allowance is ~75% consumed while invocation volume is only ~17%. That pattern points to **CPU-heavy work per invocation or many cheap-but-nonzero invocations (middleware/proxy + prefetch), not raw traffic volume**.
- The strongest code-level candidates for CPU and Supabase-call consumption are:
  1. `proxy.ts` performing a `supabase.auth.getUser()` network round trip on **every non-prefetch request that carries an auth cookie — including requests for public assets** (icons, ffmpeg.wasm, files) because the matcher excludes only `_next/static`, `_next/image`, `favicon.ico`, `sw.js`, `manifest.webmanifest`.
  2. **Two independent auth round trips per authenticated page view** (one in `proxy.ts`, one in `getCurrentProfile()`), plus a profile query — before any page data is fetched.
  3. Heavy, partially uncached server-component data loads on teacher routes (multiple sequential query batches, nested full-tree selects, and a `fetchStudentChatActivity` over every conversation ID), re-invalidated frequently by broad `revalidatePath("/teacher")` calls in server actions.
  4. Forced `prefetch={true}` links across dashboards, which under `partialPrefetching` still produce extra RSC renders (function invocations) on hover/viewport.
- Slow navigation is best explained by the blocking auth round trip in the proxy plus sequential data batches on dashboards; measured `/student/assignments/[id]` CPU P75 is only 62 ms, so that route is **not** a top CPU offender.
- **The referenced CSV log export `wajebaty-log-export-2026-10-15T16-48-09.csv` does not exist in this workspace** (no `*.csv` files found anywhere in the repo), so no log-level grouping was possible.
- Per-route CPU totals are **not available** from the supplied evidence; causality between the teacher account and production CPU cannot be established from code alone.

---

## 2. Project Architecture

| Layer | Implementation | Evidence |
|---|---|---|
| Framework | Next.js `^16.3.3`, React 19, App Router | `package.json:33-37` |
| Rendering | Server Components with `cacheComponents: true`, `partialPrefetching: true` | `next.config.ts:6-7` |
| Caching | `use cache: private` + `cacheTag(<user-or-scope>:…)` + `cacheLife({ stale: 60 })` on dashboards | `app/teacher/page.tsx:47-49`, `app/student/page.tsx:53-55`, `app/teacher/assignments/page.tsx:34-36`, `app/teacher/statistics/page.tsx:38-40`, `app/notifications/page.tsx:16-18` |
| Middleware | `proxy.ts` (Next 16 middleware-equivalent), runs Supabase SSR session refresh + throttled overdue-close sweep | `proxy.ts:8-72` |
| Auth | `getCurrentProfile()` / `requireRole()` call `supabase.auth.getUser()` then a `profiles` query on every protected page | `lib/auth.ts:27-58` |
| Data access | `@supabase/ssr` server client (anon key + cookies) for RLS-scoped reads; service-role client for overdue sweep, statistics reads, export reads | `lib/supabase/server.ts:5-25`, `app/teacher/statistics/page.tsx:43`, `app/api/export/route.ts:83` |
| Media | Browser uploads directly to Supabase Storage via XHR (`lib/upload.ts`); compression in-browser with ffmpeg.wasm (`lib/compress.ts`) | `lib/upload.ts:29-121`, `lib/compress.ts:119-199` |
| Server actions | Many per mutation; broad `revalidatePath("/teacher")` + `updateTag(...)` invalidation | `app/actions/teacher.ts:19-24,57,…`, `app/actions/messages.ts:15-17,113,154,195` |
| Realtime | Browser-side `postgres_changes` subscriptions (notifications, thread, conversation status, grades), cleaned up in `useEffect` returns | `components/notification-bell.tsx:51-68`, `components/conversation-thread.tsx:475-510`, `components/live-conversation-panel.tsx:34-62` |
| Heavy route | `/api/export` generates XLSX (exceljs) or PDF (jsPDF + Arabic shaping) per request, rate-limited 20/min | `app/api/export/route.ts:61-120` |

Architecture note: **no polling for signed-in users** (guest support threads poll a server action with backoff; realtime covers signed-in chat). Client-side compression does not consume Vercel CPU; Supabase API calls do consume Supabase quota and add latency, but do not consume Vercel Fluid CPU directly (only the waiting/round trips inside functions add wall time, and Active CPU counts only execution).

---

## 3. Available Evidence and Its Limitations

**Available:**
- Full source tree at `C:\Users\Steven Ayman\Desktop\Wagbati`.
- Dashboard figures quoted in the prompt:
  - Fluid Active CPU ≈ 3h 04m / 4h over 30 days.
  - Function invocations ≈ 166K / 1M (30 days).
  - Fluid provisioned memory ≈ 115.7 / 360 GB-Hrs.
  - `/student/assignments/[id]`: CPU P75 62 ms, CPU throttle P75 17.4%, cold start 7.7%.
  - External APIs: Supabase ≈ 184K calls over a 12-hour dashboard window (filters/scope unverified).
  - Some Duration charts marked "Demo Data" — ignored per instructions.

**Missing / limitations:**
- **CSV log export not found**: no `*.csv` file exists in the workspace, so no request-level grouping by route/status/duration was possible. The file name alone does not prove its contents; it was not available.
- **No per-route CPU breakdown** was supplied (Vercel's per-function CPU-time chart would be needed).
- **No evidence links the teacher account to production traffic volume**; code shows teacher routes are the heaviest to render, but that is not proof of usage share.
- **Dashboard screenshot time ranges vs. any log export cannot be assumed to match** (and the log export is absent).
- Supabase API call count scope/filters are unverified; treat 184K/12h as indicative only.
- Realtime connection counts, Supabase DB CPU, and Postgres query timings are unknown.

---

## 4. Vercel CPU and Function Usage Analysis

### What the numbers imply (observations, not proof)

1. **Active CPU (3h04m/4h ≈ 76%) >> invocations (166K/1M ≈ 17%).** If each invocation averaged trivial CPU, 166K invocations would not approach a 4-hour rolling allowance (for scale: 166K invocations over 30 days ≈ 5.5K/day). This suggests either (a) a subset of invocations is CPU-expensive (server-component rendering, PDF/XLSX generation, cache re-renders), or (b) middleware/proxy invocations are numerous and each pays an auth round trip plus overhead, or (c) both. **Without per-function CPU data this remains a hypothesis.**
2. **Middleware/proxy runs on ~every request except `_next/static`, `_next/image`, `favicon.ico`, `sw.js`, `manifest.webmanifest`** (`proxy.ts:70-72`). Requests for public files (`/image.png`, `/icon-192.png`, `/icon-512.png`, `/ffmpeg/ffmpeg-core.wasm` ~30 MB, `/fonts/*`, `/family.pptx`, `tmp-*.js/html`, google-font files served by the browser) **do enter the proxy**. When an auth cookie (`sb-*`) is present and the request is not a prefetch, the proxy performs `await supabase.auth.getUser()` (`proxy.ts:54-66`) — one function invocation + one Supabase Auth HTTP call **per asset request**. This is a credible source of both Vercel invocations and Supabase API calls.
3. **Dashboard render cost:** `loadTeacherDashboard` (`app/teacher/page.tsx:46-118`) runs **two sequential batches** of 4 parallel Supabase queries each (batch 1 at lines 53-67, batch 2 at lines 92-105), plus `fetchStudentChatActivity` over every conversation ID (`lib/assignment-activity.ts:3-14`, `messages` rows, no LIMIT). It is cached with `stale: 60` per profile — but every `revalidatePath("/teacher")` / `updateTag(...)` in server actions (`app/actions/messages.ts:15-17,113,154,195`; `app/actions/teacher.ts` many) forces recomputation on next visit.
4. **Forced full prefetches:** `prefetch={true}` appears on 13+ links (status cards, assignment cards, class cards, nav) — `app/teacher/page.tsx:301,387,413`, `components/app-nav.tsx:54`, `components/assignment-item.tsx:36`, `components/admin-sidebar.tsx:32`, `components/notification-feed.tsx:108`, `components/teacher-statistics.tsx:335`, `app/login/login-form.tsx:111`, etc. Each is an extra function invocation; the proxy correctly skips auth for them (`proxy.ts:50-55`), but RSC rendering still executes on cache misses.
5. **Heavy on-demand work:** `/api/export` builds XLSX/PDF in-process (`app/api/export/route.ts:103-119`, `buildClassPdf` lines 193-253, `buildStudentPdf` lines 259-425, Arabic text shaping per text draw). Rate-limited to 20/min/identity (line 65). Individual exports can be milliseconds-to-seconds of CPU each — plausible spikes, not proven to dominate.
6. **Overdue-close sweep** (`lib/close-overdue.ts:19-79`) runs as a service-role RPC (or 3-query fallback) triggered from `proxy.ts:61-65` (`after()`, throttled 60s per instance) **and** fire-and-forget from both dashboards (`app/teacher/page.tsx:128`, `app/student/page.tsx:93`). Serverless instances are short-lived, so `lastOverdueCheck`/`lastRunAt` resets on cold starts — each instance can pay this cost once.

### What is NOT supported by the evidence
- Any claim that the teacher account "caused" a share of CPU/API volume.
- Any claim that Duration charts marked Demo Data represent real latency.
- Any numeric CPU attribution per route.

---

## 5. Route-by-Route Findings

### `/teacher` — `app/teacher/page.tsx`
- Two sequential query batches (lines 53-67 → 92-105): up to 8 RLS queries + `fetchStudentChatActivity` per cache miss. **Sequential batches add a network round trip of latency** to first byte.
- `fetchStudentChatActivity` fetches **all** `messages.conversation_id` rows where `sender_role='student'` over the teacher's entire conversation set, no `LIMIT`, no `DISTINCT` (`lib/assignment-activity.ts:8-13`) — large payload risk as history grows. CPU cost mostly on Supabase; response parsing + `Set` building on Vercel.
- `enrollRes` fetches all `class_students` visible to the teacher (line 66) for counts only.
- `void ensureOverdueConversationsClosed()` on every render (line 128) — throttled internally to 60s per instance (`lib/close-overdue.ts:16-22`), but each cold instance still pays one admin RPC.
- Status computation and JS grouping are in-memory loops — cheap.
- **Confidence: High** that this route is among the heaviest renders; **Medium** that it is a top CPU contributor (no per-route CPU data).

### `/teacher/assignments` — `app/teacher/assignments/page.tsx`
- Nested select of **all assignments with all their conversations (grades + submissions count)** (lines 46-54), then `fetchStudentChatActivity` over every conversation ID of every assignment (line 60). Row count grows with classes × students × assignments. Cached `stale:60` per profile (lines 34-36).
- **Confidence: Medium-High** for payload/CPU growth; exact impact unmeasured.

### `/teacher/assignments/[id]` — `app/teacher/assignments/[id]/page.tsx`
- 2 parallel queries (lines 65-78) then a second parallel batch (lines 86-91) — sequential batches again.
- Non-admin path adds a **third** round trip for the `class_teachers` check (lines 110-118) that could run in parallel with the load.
- Cached (`stale:60`) but tagged `assignments:${profileId}` — invalidated by teacher actions (`app/actions/teacher.ts:21`).

### `/teacher/statistics` — `app/teacher/statistics/page.tsx`
- Uses the **service-role admin client** for assignments/class_teachers reads (lines 43, 54-58, 73-76) — bypasses RLS (filters are applied in the query for teachers, but this is a wider blast radius if a filter regresses). Conversations/submissions/grades read with the user client (lines 87-103).
- Sequential phases: assignments → class_teachers → conversations → parallel(subs, grades) → chat activity (lines 65-104): **~4 sequential round trips** of added latency.
- Per-assignment in-memory grouping over all conversations — cheap on Vercel.
- **Confidence: High** for sequential-latency observation; **Medium** for CPU significance (results are cached 60s).

### `/teacher/conversations/[id]` — `app/teacher/conversations/[id]/page.tsx`
- Parallel conversation + up to 1000 messages (lines 22-36), then a **batched** `createSignedUrls` for all media messages (lines 53-58) — one call, good. Signed URLs are cached in the RSC payload (10-minute expiry, 600s), so no repeated client signing.
- Not wrapped in `use cache` — dynamic per navigation (freshness is correct for chat).

### `/student` — `app/student/page.tsx`
- Parallel conversations+grades+submissions nested select and unread count (lines 59-72), then `fetchStudentChatActivity` over all of the student's conversations (line 76). Cached 60s per student (lines 53-55).
- `void ensureOverdueConversationsClosed()` per render (line 93).

### `/student/assignments/[id]` — `app/student/assignments/[id]/page.tsx` (route with supplied metrics)
- **CPU P75 = 62 ms** (dashboard), throttle 17.4% — modest per-invocation CPU; this route is not evidence of a CPU hotspot.
- Work per uncached render: 3 parallel queries (lines 39-59, messages capped at 1000), then a **sequential** attachments query (lines 74-80) that could join the first batch, then **3 batched signed-URL calls** (lines 92-107) — parallel, good.
- Realtime `LiveGradeRefresh` and chat subscriptions are browser-side — no Vercel CPU.
- No `use cache` wrapper — re-renders fully on every navigation/refresh (correct for chat freshness; contributes steady invocation CPU).

### `/student/support` and guest support
- Guests have no realtime; `ConversationThread` polls via a **server action** with backoff (`components/conversation-thread.tsx`, guest poll effect; comment block above it). Every poll tick = one function invocation + one Supabase query. Rate limits: create thread 3/hr, one action 40/hr, another 20/hr (`app/actions/support.ts:64,151,202`) — generous but bounded; 6s poll while a guest thread is open is an invocation every ~6s per open guest tab.
- **Confidence: Medium** — potentially meaningful during heavy support use; unknown usage.

### `/notifications` — `app/notifications/page.tsx`
- Parallel notifications list (limit 50) + unread exact count (lines 22-30); cached 60s. Lightweight. Realtime feed is browser-side.

### `/login` — `app/login/page.tsx`
- No Supabase queries in the page; static-ish render. Low cost. The login form does auth via client (network only).

### `/api/export` — `app/api/export/route.ts`
- Auth (`getCurrentProfile`, line 62) + rate limit (line 65) + authorization queries (lines 85, 122-153) + data fetch with nested grades/submissions/student/assignment (lines 155-187) + in-process file generation (`buildXlsxBuffer` line 104; jsPDF `buildClassPdf`/`buildStudentPdf` lines 113, 193-425) including Arabic bidi shaping per text line and base64 font/image embedding (font/image caches at lines 20-34 are module-level, good).
- **CPU-heavy when used; rate-limited.** Without logs, share of total CPU is unknown. jsPDF + exceljs are also bundle/server-dependency weight.

### Cross-cutting
- **N+1 patterns:** none found at the SQL level; relation counts use embedded `submissions(count)`/`assignment_attachments(count)` — good.
- **Client rerenders:** notification bell fetches only when opened (lines 70-83); grade autosave is debounced (`components/grade-autosave.tsx:95`); read-marking is coalesced (`components/conversation-thread.tsx` READ_COALESCE_MS logic). Good.
- **Duplicate fetching:** dashboards fetch submissions/grades/messages separately for the same conversation ID sets where a single embedded query or SQL `EXISTS` could serve all three — duplication exists in query count, not in code-level repeat calls.

---

## 6. Supabase Query and API Analysis

**Where clients are initialized**
- Server: `lib/supabase/server.ts` (per-request; cookie-bound — cheap), `lib/supabase/admin.ts` (service role), `lib/supabase/browser.ts` (client-side). `proxy.ts` creates its own SSR client per request (line 17).
- New clients per call are acceptable; no evidence of a costly initialization pattern.

**Duplicate auth/API calls per navigation (high-confidence observation)**
1. `proxy.ts:56` — `supabase.auth.getUser()` (network) for every non-prefetch request with an `sb-*` cookie.
2. `lib/auth.ts:33` — a second `supabase.auth.getUser()` inside `getCurrentProfile()`.
3. `lib/auth.ts:39-44` — profile row query.
4. Page data queries (2-8+).
So an authenticated dashboard navigation costs **≥3 Supabase API calls before page data**. With prefetches excluded from (1), but public-asset requests *included* in (1), the external-call volume is inflated on both ends.

**Column selection & filters**
- Selects are generally narrow and filtered (`eq` on `user_id`, `student_id`, `conversation_id`, `class_id`) with supporting indexes (`supabase/migrations/202608300003_final_v1_schema.sql:227-245`, `202608300004:8`, `202609060000:7-13`).
- Exception: `fetchStudentChatActivity` returns unbounded message rows for large ID sets (no limit/pagination) — `lib/assignment-activity.ts:8-13`.
- Exception: teacher dashboard pulls every visible conversation and enrollment to build counts (`app/teacher/page.tsx:63-66`).

**Caching/dedup**
- `use cache: private` + per-user tags is correct and safe (private to user, 60s stale). No cross-user cache sharing observed — good for security.
- No request-level dedup for the two `getUser()` calls (could be solved safely by having `requireRole` reuse a request-scoped memo or by trusting the proxy's already-verified session — requires careful design, see findings).

**Realtime**
- Subscriptions are scoped with filters (`id=eq.`, `user_id=eq.`), created once per `useEffect` with cleanup (`components/notification-bell.tsx:51-68`, `live-conversation-panel.tsx:34-62`, `conversation-thread.tsx:475-511`). No duplicate-subscription bug found in code.

**Where code is insufficient to confirm production behavior**
- Actual query timings, connection counts, cache hit ratios, realtime connection volume, and the true composition of the 184K Supabase API calls require Supabase Studio/Logs and Vercel Observability data.

---

## 7. Middleware and Static Asset Analysis

`proxy.ts:70-72`:
```ts
matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)"]
```

**Excluded (good):** `/_next/static/*` (JS/CSS chunks), `/_next/image`, `favicon.ico`, `sw.js`, `manifest.webmanifest`.

**NOT excluded (enters the proxy):**
- `/image.png`, `/icon-192.png`, `/icon-512.png` — referenced by `app/layout.tsx:27-28` metadata and `public/sw.js`.
- `/ffmpeg/*` (including the ~30 MB `ffmpeg-core.wasm` fetched during every first video compression — `lib/compress.ts:139-144`).
- `/fonts/*.ttf`, `/family.pptx`, `tmp-*.js`, `tmp-pipeline.html`, and any other `public/` file.
- Google Fonts/woff files loaded by `next/font` (served from `/_next/static/media` — those ARE excluded).

For an authenticated, non-prefetch request (asset requests carry no prefetch header), each such asset request triggers `supabase.auth.getUser()` at `proxy.ts:56` — i.e., **a function invocation plus an auth API call to serve a static icon**. This is the clearest match for "high Supabase API calls" among code evidence.

**Recommended (not implemented) exclusion candidates** that preserve security: add `image.png|icon-192.png|icon-512.png|fonts|ffmpeg|tmp-*|\\.pptx` style exclusions, or better, gate the `getUser()` so asset-like requests (pathname with a static file extension) never perform auth. Pages themselves must keep the session refresh behavior. **No matcher change was made during this audit.**

Also note: the throttled `after()` overdue sweep (`proxy.ts:61-65`) runs inside proxy invocations; per-instance throttling is defeated by short-lived serverless instances, so each instance may pay one admin RPC once.

---

## 8. Security Considerations

- **RLS/role checks remain intact**: pages call `requireRole(...)`, storage uploads go through RLS policies (`can_upload_media_object`, `can_post_message`), export does per-target authorization (`app/api/export/route.ts:122-153`). No recommendation below weakens these.
- **Cache safety**: `use cache: private` + user-scoped tags means cached data is not shared across users. Any future caching must keep per-user keys — never cache private teacher/student dashboards under shared tags.
- **Service-role usage**: `app/teacher/statistics/page.tsx:43` uses the admin client for read queries in a user-facing page (RLS bypass). It is filtered by `teacherClassIds`, but a regression in the filter could over-expose. Prefer RLS-scoped client reads where possible.
- **Signed URLs**: 600s expiry for attachments/submission/message media (`createSignedUrls(..., 600)`) — reasonable; keep short.
- **Auth dedup opportunity risk**: skipping `getUser()` in one layer relies on the other layer; if done later, ensure at least one verification per request remains and that RLS still enforces access server-side (it does — all reads use the caller's cookie-bound client).
- **`next.config.ts:10` `bodySizeLimit: "120mb"`** on server actions: uploads normally bypass server actions, but this raises the blast radius if an action ever accepts a body; worth reviewing (P3, security-adjacent).
- No secrets or student data were accessed or exposed in this audit.

---

## 9. Prioritized Findings Table

| Priority | Finding | Evidence | Confidence | Recommended action | Cost |
|---|---|---|---|---|---|
| P1 | Proxy performs `supabase.auth.getUser()` on every non-prefetch request carrying auth cookies, including public asset requests | `proxy.ts:50-66`, matcher `proxy.ts:70-72`, assets: `app/layout.tsx:27-28`, `lib/compress.ts:139-144`, `public/` | High | Skip auth for static-asset paths (extensions/directories) and/or extend matcher exclusions while keeping page auth | Free (code-only) |
| P1 | Two auth round trips + profile query per authenticated page view (proxy + `getCurrentProfile`) | `proxy.ts:56`, `lib/auth.ts:33,39-44` | High | Deduplicate: memoize per request or verify session once per request | Free (code-only) |
| P1 | Teacher/student dashboards run multiple sequential query batches and unbounded `fetchStudentChatActivity` over all conversation IDs | `app/teacher/page.tsx:53-67,92-105`, `app/teacher/assignments/page.tsx:46-60`, `lib/assignment-activity.ts:8-13` | Medium-High | Parallelize batches; replace chat-activity fetch with SQL `EXISTS`/aggregate or `DISTINCT conversation_id` + limit | Free (code-only) |
| P1 | Broad `revalidatePath("/teacher")`/`updateTag` invalidations re-trigger cached dashboard recomputation frequently | `app/actions/messages.ts:15-17,113,154,195`, `app/actions/teacher.ts` (many) | Medium | Narrow invalidation to affected tags/segments; keep freshness where correctness requires it | Free (code-only) |
| P2 | Forced `prefetch={true}` on many links generates extra RSC renders/invocations | 13+ sites, e.g. `app/teacher/page.tsx:301,387,413`, `components/app-nav.tsx:54` | Medium | Rely on default (partial) prefetch; keep `prefetch={false}` for heavy routes | Free (code-only) |
| P2 | `/api/export` builds PDF/XLSX in-process (jsPDF Arabic shaping, exceljs) — CPU spikes | `app/api/export/route.ts:103-119,193-425` | Medium | Measure first; consider heavier limits, streaming, or offloading only if logs show material CPU share | Free (measurement), possible infra |
| P2 | Overdue-close sweep runs per instance (proxy `after` + both dashboards), defeating throttling on short-lived instances | `proxy.ts:61-65`, `lib/close-overdue.ts:19-31`, `app/teacher/page.tsx:128`, `app/student/page.tsx:93` | Medium | Rely on one trigger path (proxy `after` or a scheduled function), keep 60s throttle | Free (code-only) or scheduled fn |
| P2 | Guest support polling = one server-action invocation per tick (~6s) per open guest thread | `components/conversation-thread.tsx` guest-poll effect; `app/actions/support.ts:151` (40/hr) | Medium | Increase poll interval/backoff floor; verify rates in logs before changing | Free (code-only) |
| P2 | `/teacher/statistics` reads via service-role client and ~4 sequential query phases | `app/teacher/statistics/page.tsx:43,54-58,65-104` | High (code), Medium (impact) | Use RLS client where possible; parallelize phases | Free (code-only) |
| P3 | Sequential attachments query on `/student/assignments/[id]` could join the first parallel batch | `app/student/assignments/[id]/page.tsx:39-80` | High (pattern), Low (impact — P75 62ms) | Merge into the initial `Promise.all` | Free |
| P3 | Teacher dashboard fetches full `class_students` + all conversations for counts | `app/teacher/page.tsx:63-66` | Medium | Aggregate counts in SQL (`count` with group by) | Free |
| P3 | `bodySizeLimit: "120mb"` for server actions | `next.config.ts:9-11` | High (fact) | Review whether needed given direct-to-storage uploads; reduce if actions never carry files | Free |
| P3 | No CSV/logs available to confirm any of the above against production traffic | workspace glob: no `*.csv` | High (absence) | Export logs with route/status/duration fields for validation | Effort only |

### Confirmed findings vs. hypotheses
- **Confirmed (from code):** asset requests enter the proxy and can trigger `getUser()`; double auth per navigation; sequential query batches; unbounded chat-activity fetch; broad revalidation; export CPU work; per-instance overdue sweeps; prefetch forcing; statistics service-role reads.
- **Hypotheses (need metrics):** which of these dominates the 3h04m Active CPU; whether prefetches/asset requests materially contributed the 184K Supabase calls; whether teacher usage drives overall traffic.

---

## 10. Recommended Remediation Plan (ordered by impact/cost)

> No changes have been applied. Implement only after approval.

1. **[Free] Stop auth work for static assets.** Exclude static file paths from `proxy.ts`'s matcher or short-circuit `getUser()` when the pathname is a public asset. Expected benefit: fewer function invocations and a large cut in Supabase Auth API calls. Risk: must keep session refresh on real navigations (guard by path/extension, not headers alone).
2. **[Free] Deduplicate per-request auth.** Single `getUser()` per request shared between proxy and `requireRole`/`getCurrentProfile` (request-scoped memo). Expected benefit: −1 Supabase call per navigation; lower latency.
3. **[Free] Parallelize and shrink dashboard queries.** Merge sequential `Promise.all` batches; replace `fetchStudentChatActivity` with a `distinct`/`exists` aggregate; consider SQL-side counts. Expected benefit: lower latency per navigation, less payload/CPU.
4. **[Free] Narrow revalidation.** Replace blanket `revalidatePath("/teacher")` with targeted `updateTag`s for the data that actually changed; keep per-user tags. Expected benefit: fewer cache recomputes → less CPU.
5. **[Free] Use default/partial prefetch** instead of `prefetch={true}` on heavy list links. Expected benefit: fewer invocation-heavy RSC renders.
6. **[Free] Consolidate the overdue sweep** to one trigger path; optionally move to a scheduled function. Expected benefit: fewer admin RPCs and proxy-side work.
7. **[Measure first] Export route & guest polling.** Only optimize (worker/offload, longer poll interval) if Vercel per-function CPU or logs show meaningful share.
8. **[Then re-measure]** — see Validation Plan.

---

## 11. Hosting Decision and Cost Considerations

**Order of decision:**

1. **Optimize the current Next.js + Supabase + Vercel architecture first.** The findings above are almost entirely code-level and free. The metrics pattern (high CPU share, low invocation share) suggests per-invocation cost and middleware/auth overhead are addressable without spending more.
2. **Upgrade Vercel only if, after 2-4 weeks of optimization, the rolling Active CPU allowance still approaches its cap.** Exact plan prices/quotas must be checked on Vercel's official pricing page — **this report does not assert current prices or quotas**. Whether/how the allowance is enforced when exhausted (hard block vs. throttle vs. billing) must also be verified against current plan documentation — marked **unknown**.
3. **Move selected compute elsewhere while keeping Supabase** only if export/PDF generation or guest polling still dominate CPU after optimization: candidates include moving `/api/export` generation to a small always-on worker or a separate service, or shifting guest chat polling to Supabase Realtime with anon-accessible RLS (security review required). Supabase itself already absorbs DB/API load.
4. **Do not move the whole application** — no evidence supports that; a full migration would add risk without addressing the auth/proxy overhead that any Next.js host would still pay.

Do not use multiple accounts or account switching to bypass plan limits — explicitly out of scope and not recommended.

---

## 12. Validation Plan

**Baseline (before any change):**
- Vercel Observability/Functions: per-function **CPU time** (not just duration), invocation count by route for `/teacher*`, `/student*`, `/api/export`, and middleware invocations.
- Vercel Logs: export a real log CSV including timestamp, path/route, status, duration, and function name; group by route. (The referenced CSV was absent from this workspace.)
- Supabase Dashboard: API request counts broken down by endpoint (auth vs. PostgREST vs. Storage), Realtime connections, slow-query log.
- Note the current 30-day Active CPU, invocations, memory as baseline.

**After each remediation step:**
- Compare weekly Active CPU burn rate vs. allowance (same rolling window).
- Compare Supabase Auth `GET /auth/v1/user` call counts (should drop materially after steps 1-2).
- Measure P50/P95 navigation latency for `/teacher`, `/teacher/assignments`, `/student`, `/student/assignments/[id]` using RUM or Vercel Speed Insights.
- Verify security regressions: logged-out user cannot access protected pages; teacher/student cannot read each other's data; exports still enforce authorization; RLS tests still pass (`npm run lint && npm test && npm run build`).

**Attribution check:** only after per-route CPU data exists can any claim like "teacher route X causes Y% of CPU" be made.

---

## 13. Exact Files & Functions to Inspect First When Implementing Fixes

1. `proxy.ts` — matcher (lines 70-72), prefetch/auth logic (lines 50-66), `after()` overdue sweep (lines 61-65).
2. `lib/auth.ts` — `getCurrentProfile()` (lines 27-50), `requireRole()` (lines 52-58).
3. `app/teacher/page.tsx` — `loadTeacherDashboard()` (lines 46-118), fire-and-forget sweep (line 128).
4. `app/teacher/assignments/page.tsx` — `loadTeacherAssignments()` (lines 33-63).
5. `lib/assignment-activity.ts` — `fetchStudentChatActivity()` (lines 3-14).
6. `app/actions/messages.ts` and `app/actions/teacher.ts` — invalidation breadth (`updateTag`, `revalidatePath`).
7. `app/student/assignments/[id]/page.tsx` — query batching (lines 39-107).
8. `app/api/export/route.ts` — `GET()` (lines 61-120), `buildClassPdf`/`buildStudentPdf`.
9. `lib/close-overdue.ts` — `ensureOverdueConversationsClosed()` (lines 19-79).
10. `app/teacher/statistics/page.tsx` — `loadTeacherStatistics()` (lines 37-114).

---

## 14. Questions That Cannot Be Answered Without Additional Logs/Metrics/Access

1. Which routes/functions consume the most **CPU time** (not duration) on Vercel?
2. What share of the 166K invocations is middleware/proxy vs. pages vs. server actions vs. prefetches?
3. What are the actual filters/time range behind the "184K Supabase API calls / 12h" figure, and how much is `auth/v1/user` vs. PostgREST?
4. Was the missing CSV export (`wajebaty-log-export-2026-10-15T16-48-09.csv`) supposed to be in this workspace? Without it, no request-level analysis was possible.
5. What is the current Vercel plan tier, and what exactly happens when the rolling Active CPU allowance is exhausted (official documentation required)?
6. Supabase side: DB CPU, connection saturation, slowest queries, and Realtime connection counts are unknown.
7. Usage attribution: which role/routes generate production traffic (needs log attribution by route; account attribution was not available).
8. Whether Duration charts beyond the noted `/student/assignments/[id]` row are demo data or real.

---

*End of audit. Read-only audit: no source files, configs, migrations, environment settings, security policies, or deployments were modified; only `docs/performance-audit.md` was created.*

---

## 15. Implemented Optimizations

> **Status: implemented in the working tree, NOT deployed.** No database migration, RLS policy, environment variable, hosting setting or production configuration was changed. Every result below is from a local run unless explicitly marked otherwise. **No CPU reduction has been verified in production** — the numbers in Section 4 remain the only real-world data.

### 15.0 Result summary

| Finding (Section 9) | Status | Notes |
|---|---|---|
| P1 — proxy `getUser()` on every non-prefetch request incl. assets | **Implemented** | Refresh-only `getSession()`; static assets removed from the matcher |
| P1 — two auth round trips per authenticated view | **Partially implemented (safer variant)** | Report suggested a request-scoped memo; that is not provably safe (see 15.1). The redundant *validation* round trip was removed instead — one authoritative `getUser()` per request remains |
| P1 — sequential dashboard batches / unbounded chat-activity fetch | **Partially implemented** | `/teacher/statistics` phases parallelized; teacher dashboard/list batches are dependency-bound; `fetchStudentChatActivity` left unchanged (needs a schema-level `DISTINCT`/`EXISTS`) |
| P1 — broad `revalidatePath`/`updateTag` | **Not implemented** | Correctness risk (stale grades/assignments); the worst offender was already narrowed by the user |
| P2 — forced `prefetch={true}` | **Implemented** | Removed at all 11 sites (9 files) |
| P2 — `/api/export` in-process CPU | **Not implemented** | Report says measure first |
| P2 — overdue sweep on multiple trigger paths | **Implemented** | Consolidated to the proxy `after()` trigger |
| P2 — guest support polling | **Not implemented** | Report says measure first; file is user-modified |
| P2 — statistics service-role client + sequential phases | **Partially implemented** | Phases parallelized; service-role read left (RLS equivalence unverifiable here) |
| P3 — sequential attachments query on `/student/assignments/[id]` | **Not implemented** | Removing the trip needs a query-shape change that cannot be verified without DB access (see 15.6) |
| P3 — teacher dashboard SQL counts | **Not implemented** | Needs `GROUP BY`/RPC (schema change) |
| P3 — `bodySizeLimit: "120mb"` | **Not implemented** | Config change, out of scope |
| P3 — no CSV/logs | **N/A** | Still absent; no request-level analysis is possible |

---

### 15.1 Proxy — refresh-only auth + static-asset exclusion

**File/function:** `proxy.ts` → `proxy()`, `config.matcher`.

**Original issue (Section 9, P1 ×2):** two things happened on essentially every request:
1. the matcher only excluded `_next/static`, `_next/image`, `favicon.ico`, `sw.js`, `manifest.webmanifest`, so requests for public icons, fonts, the ffmpeg wasm/core files and `public/tmp-*.js` still entered the proxy; and
2. when an `sb-` auth cookie was present, the proxy awaited `supabase.auth.getUser()`, which unconditionally issues a `GET /auth/v1/user` network call — its result was then discarded.

**What changed and why:**
- **Matcher**: added an extension-based negative match (`png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|json|wasm|ttf|otf|woff2?|eot|mp3|mp4|webm|wav|pdf|pptx?|txt|xml|webmanifest|html`). Static asset requests now skip the proxy **invocation** entirely, not just its auth work.
- **Auth**: `supabase.auth.getSession()` replaces `supabase.auth.getUser()`.

**Evidence this is behaviour-preserving (not assumed):**
- `@supabase/auth-js` source: `getSession()` → `_useSession()` → `__loadSession()` reads the cookie-bound session locally and **returns without any network call when the token is fresh**; when the access token is inside its expiry margin it calls `_callRefreshToken(...)` (fired regardless of the `autoRefreshToken` flag, which only drives background timers), so **session refresh is preserved** and the rotated cookies are written through the existing `setAll` → response. `getUser()` → `_getUser()` **always** issues `GET /user`. (Verified in `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`.)
- The proxy **never** gated access on the auth result: it never redirects and never blocks; it only propagates refreshed cookies. Therefore removing its *validation* call cannot change any authorization outcome.
- Next.js 16 docs confirm cookie `.set` is only permitted in Server Functions/Route Handlers (`dist/docs/.../cookies.md`), so the proxy **must** remain the session-refresh point — the page render cannot persist rotated cookies. This is why the report's "request-scoped memo" idea was rejected: the two calls were not duplicates. One *refreshes*, one *validates*.

**Matcher verification (not assumed):** the pattern was compiled with Next's own `getMiddlewareMatchers()` and the resulting regex (`^(?:\/(_next\/data\/[^/]{1,}))?(?:\/((?!_next\/static|_next\/image|.*\.(?:…)$).*))(\.json|\.rsc|\.segments\/.+\.segment\.rsc)?[\/#\?]?$`) was executed against 31 sample paths. All 18 real routes matched (proxy still runs, including `.rsc` transport); all 13 static asset samples were excluded. Reproduced cases: `/teacher/assignments/abc-123` ✓ runs, `/teacher/assignments?status=all` ✓ runs, `/support/<uuid>` ✓ runs, `/image.png` ✗ excluded, `/fonts/Cairo.ttf` ✗ excluded, `/ffmpeg/ffmpeg-core.wasm` ✗ excluded, `/tmp-ffmpeg-shim.js` ✗ excluded, `/فصل.pptx` ✗ excluded.

**Security implications:** net-zero. No protected page/route/action relied on the proxy for authorization; the authoritative `getUser()` + role check stays in `getCurrentProfile()` / `requireRole()` inside every page, Server Action and API route. Excluded paths are public files in `public/` that were already served unauthenticated. No credential is exposed to the client.

**Tests:** `typecheck` ✅, `lint` ✅ (0 errors), `build` ✅ (Proxy compiled), matcher path matrix ✅.

**Remaining risk:** if a future route introduces a path segment ending in one of the excluded extensions, that route would skip the proxy. Consequence would be limited to session-refresh/overdue-sweep opportunism only — the page's own `requireRole()` still applies. Today no such route exists (all route params are UUIDs; the guest support token is carried in the query string, not the path).

---

### 15.2 `/teacher/statistics` — concurrent query phases

**File/function:** `app/teacher/statistics/page.tsx` → `loadTeacherStatistics()`.

**Original issue (P2/P1):** four to six sequential Supabase round trips per load, several of which were mutually independent.

**What changed:** the `class_teachers`-embed read and the `conversations` read both depend only on `assignments`, so they were merged into one `Promise.all`; the `submissions`, `grades` and `fetchStudentChatActivity` reads all depend only on the conversation ids, so they were merged into a second `Promise.all`. Sequential phases for a non-admin drop from ~5 to 3; for an admin from ~4 to 3 (further routing to `use cache: private`, `stale: 60`).

**Consistency:** exactly the same queries, filters, projections and ordering — only their concurrency changed. `teacherByClass` accumulation, `submittedIds`, `gradedIds` and `chatActivityIds` are built from the same rows in the same order, so statistics values are unchanged.

**Security implications:** none. One read uses the same service-role client as before; one uses the caller's cookie-bound client as before. No new data is read.

**Tests:** `typecheck` ✅, `build` ✅. **Not** verified against the live database.

**Remaining risk:** the service-role read (`assignments`, `class_teachers` embed) is still RLS-bypassing and relies on the explicit `teacherClassIds` filter. It was left as-is deliberately — switching to the RLS client could silently change results if the policies are narrower than the filter, and that cannot be verified from this workspace.

---

### 15.3 `/teacher/assignments/[id]` — authorization off the critical path

**File/function:** `app/teacher/assignments/[id]/page.tsx` → `TeacherAssignmentPage()`.

**Original issue:** the teacher-class authorization read ran strictly *after* the cached assignment load, adding a third sequential round trip (load = 2 batches, then authz).

**What changed:** the authz read now starts **before** `loadTeacherAssignment()` and resolves in parallel with it. It lists the signed-in teacher's own class memberships (`class_teachers.select("class_id").eq("teacher_id", profile.id)`) — the exact query the teacher dashboard and teacher assignments list already use — and the page then checks `taughtClassIds.includes(assignment.classes.id)`.

**Why it is equivalent:** `{teacher_id = me}` ∩ membership test on `class_id` is the same predicate as the previous `{teacher_id = me, class_id = X}` filter, evaluated client-side. The not-found path consumes the in-flight promise so a rejection cannot surface as an unhandled error.

**Security implications:** unchanged authorization outcome. The same RLS-scoped table is read with the same cookie-bound client; a non-owning teacher still gets `notFound()`. Admin bypass is unchanged. This is an authorization *check*, and it still runs on every request (it is outside the `use cache: private` boundary, so its result is never cached).

**Tests:** `typecheck` ✅, `lint` ✅, `build` ✅.

---

### 15.4 Overdue sweep — single trigger path

**Files/functions:** `app/teacher/page.tsx` → `TeacherPage()`, `app/student/page.tsx` → `StudentPage()`.

**Original issue (P2):** the sweep was triggered from three places (proxy `after()` plus a fire-and-forget call in each dashboard render), each with its own per-instance 60s throttle.

**What changed:** removed the two dashboard `void ensureOverdueConversationsClosed()` calls and their imports. The proxy `after()` trigger remains.

**Coverage argument:** the proxy trigger fires on **every authenticated, non-prefetch request** — which is a strict superset of the requests that render the dashboards (a dashboard navigation always passes through the proxy first). The `after()` callback keeps the invocation alive post-response, whereas the removed `void` calls were un-awaited fire-and-forget work in a serverless render (less reliable to complete). Overdue closing therefore still happens on every real navigation, at a bounded ~1 sweep/instance/minute.

**Tests:** `typecheck` ✅, `lint` ✅, `build` ✅.

**Remaining risk:** with the dashboards silent, the only trigger is the proxy path. This is the path the Next.js docs document as supported (`after()` is listed as usable in Proxy). It should be observed in production (see 15.7) to confirm overdue conversations still close.

---

### 15.5 Prefetching — reverted forced `prefetch={true}`

**Files:** `app/teacher/page.tsx`, `components/app-nav.tsx`, `components/admin-sidebar.tsx`, `components/admin-mobile-menu.tsx`, `components/assignment-item.tsx`, `components/notification-feed.tsx`, `components/teacher-statistics.tsx`, `components/guest-support-continue.tsx`, `app/login/login-form.tsx` (11 sites).

**Original issue (P2):** `partialPrefetching` is enabled in `next.config.ts`. Per the Next.js docs, in that mode the **default** prefetch downloads only the route's shared App Shell (one render per route, no URL-specific data), while `prefetch={true}` additionally resolves the **URL-specific** dynamic content for each link. Because the nav renders on every page and the dashboards/lists render many param- or `searchParams`-bearing links, each visible link triggered an extra dynamic render — each of which re-runs `requireRole()` → `getUser()` (a Supabase Auth round trip) plus the cached data lookups.

**What changed:** removed `prefetch={true}` everywhere, falling back to the default App Shell prefetch. No design, layout, colour, typography or behaviour change; loading states already exist for these routes (`app/teacher/loading.tsx`, `app/student/loading.tsx`, `app/teacher/statistics/loading.tsx`, `app/student/assignments/[id]/loading.tsx`, …), so a click still shows the shell/loading state instantly and streams the URL-specific content.

**Security implications:** none. Prefetching is a client hint; removing it cannot grant or deny access.

**Tests:** `typecheck` ✅, `lint` ✅, `build` ✅.

**Remaining risk / trade-off:** content-ready time on click may shift by roughly one round trip for links that previously prefetched their dynamic content. This is the intended trade for the CPU/auth-call reduction and should be evaluated with RUM/Speed Insights after deployment (15.7).

---

### 15.6 Explicitly NOT implemented (and why)

These were deliberately left unchanged; each carries a correctness or safety uncertainty that outweighs its unverified benefit:

1. **Request-scoped auth memo (report's "deduplicate auth").** The two calls are *not* duplicates: the proxy is the only layer that can persist a rotated session cookie (Next forbids cookie writes during render), and `getCurrentProfile()` is the only layer that validates identity. A shared memo would risk serving one request's cookie-bound client/session to another. Rejected; the redundant *validation* call was removed instead (15.1). Wrapping `createSupabaseServerClient` in React `cache()` was also rejected for the same request-scope-leak reason.
2. **Broad `revalidatePath("/teacher")` / `updateTag` narrowing.** Remaining calls correspond to genuine mutations (assignment create/edit/close, grades, media messages). Narrowing them risks showing stale grades, assignment status or conversation state — a correctness regression, and the report itself rates this only Medium confidence. `app/actions/messages.ts` is also a user-modified file; the worst offender (`markConversationReadAction`) was already narrowed by the user.
3. **`fetchStudentChatActivity` unbounded select.** A correct `DISTINCT conversation_id` / `EXISTS` requires PostgREST RPC or a view — a schema change, which the task forbids. Adding a `limit` would silently change assignment/status classification once the limit is hit. Left unchanged.
4. **Teacher dashboard / teacher assignments batch merging.** These batches are genuinely dependency-bound (`class_teachers` → assignments → embedded conversations → conversation ids → grades/submissions/chat activity). There is no same-query parallelization available; the only shortcuts would change query shape or weaken the explicit class scoping.
5. **`/student/assignments/[id]` attachments query.** The report's suggestion to merge it into the first batch requires embedding `assignment_attachments` under the `assignments` embed — a query-shape change. It cannot be verified here: the workspace has no read-only DB harness, and `npm run test:db` **mutates** the configured Supabase project (creates/deletes rows), which is forbidden. Left unchanged rather than shipped unverified.
6. **`/teacher/statistics` service-role → RLS client.** Result equivalence depends on the live policies, which cannot be checked from here. Left as-is (no weakening, no change).
7. **`/api/export` and guest-support polling.** The report explicitly marks these "measure first"; no per-route CPU data exists to justify a change, and the polling code lives in a user-modified component.
8. **`bodySizeLimit: "120mb"`.** `next.config.ts` change, out of scope for this pass.

**Unrelated observation (not changed):** `app/api/push/send/route.ts` uses the service-role client with rate limiting and authenticates callers with a shared webhook secret (`authorization: Bearer ${settings.push_webhook_secret}`, route line 39; 401 otherwise). *Correction (2026-10-15):* an earlier draft of this note said "no caller authentication" — that was inaccurate. The route **is** authenticated by the webhook secret and returns 401 without it. Recorded here only so it is not lost; it was not modified.

---

### 15.7 Verification performed (actual results)

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **Passed** — no output |
| `npm run lint` (`eslint .`) | **Passed** — 0 errors, 12 warnings, all pre-existing and in files not touched by this work (`app/actions/teacher.ts`, `app/change-password/change-password-form.tsx`, `public/tmp-ffmpeg-*.js`, `tmp-*.mjs`) |
| `npm run test` (`vitest run`) | **Passed** — 11 files, **167/167 tests** |
| `npm run build` (`next build`) | **Passed** — compiled successfully; `ƒ Proxy (Middleware)` present; 32 static pages generated |
| Matcher path matrix (Next's own `getMiddlewareMatchers` + `getMiddlewareRouteMatcher`) | **Passed** — 30/30 routes proxied (including `.rsc` and `.segments/….segment.rsc` transport forms), 18/18 assets excluded; 48 paths total |
| `npm run test:db` | **NOT run** — it creates and deletes rows against the configured Supabase project (production). Running it would violate the no-mutation constraint. Stated explicitly rather than claimed. |

No production build, deployment, migration or remote query was executed.

---

### 15.8 Security review of the diff

- No RLS policy, schema, migration, environment variable, hosting setting or dependency version was changed.
- No new data was made public. The excluded proxy paths are public static files; the proxy never blocked anything.
- Authorization checks were preserved and still run per request: `requireRole()`/`getCurrentProfile()` in every page/action/route, plus the explicit teacher-class check on `/teacher/assignments/[id]` (same predicate) and the explicit `teacherClassIds` filter in statistics.
- No private teacher/student data is cached in any shared cache (no cache was added; existing `use cache: private` + per-user tags are untouched).
- The service-role key is still only used server-side; nothing new is exposed to the client.
- Git diff reviewed: only the intended files changed; no secrets, no credential values, no unrelated UI.

---

### 15.9 Deployment and rollback plan

**Deploy (after explicit approval only):**
1. Push to a Vercel **Preview** deployment first.
2. Smoke-test on Preview: log in/out; visit `/`, `/teacher`, `/teacher/assignments`, `/teacher/assignments/[id]`, `/teacher/statistics`, `/student`, `/student/assignments/[id]`, `/notifications`, `/admin`; confirm unauthorised access still redirects; confirm a **stale (>1h) session still refreshes** (leave a tab idle past the access-token lifetime, then navigate); confirm assignment attachments/submission media/message media still open via signed URLs; confirm `/api/export` still produces the same file.
3. Only then promote to production (the user's normal process — do not auto-deploy).

**Rollback:** all changes are source-only and additive; there is no migration or config change. Revert the commit (or redeploy the previous build) — no data rollback is needed.

---

### 15.10 Metrics to compare after deployment (before claiming any improvement)

Record the same 30-day rolling window before and after, then compare:

1. **Vercel Fluid Active CPU** — 30-day rolling usage vs allowance (the primary objective).
2. **Vercel middleware/proxy invocations** — should drop sharply once asset requests stop entering the proxy.
3. **Vercel per-function CPU time** for `/teacher*`, `/teacher/statistics`, `/student*`, `/api/export` (CPU time, not just duration).
4. **Supabase API requests** — split `auth/v1/user` vs PostgREST vs Storage (`auth/v1/user` should drop materially: no proxy validation call, and far fewer prefetch-triggered `getUser()`s).
5. **Navigation P50/P95 latency** (RUM or Vercel Speed Insights) for `/teacher`, `/teacher/assignments`, `/teacher/statistics`, `/student`.
6. **Behavioural guardrails**: overdue conversations still close; grades/assignment status/unread counts unchanged.

**Until these numbers exist, the correct statement is: "optimizations implemented and locally verified; production CPU impact not yet measured."** No claim of reduced CPU usage is made.

---

### 15.11 Pre-deployment security & regression review (2026-10-15)

A focused review of the *current uncommitted* diff was performed. No source files were changed during the review (this section and the two corrections above are documentation only). Nothing was deployed.

**Confirmed safe (with evidence):**

1. **Proxy `getSession()` is not authoritative.** `proxy.ts` never redirects or blocks and never consumes the result — it returns `supabaseResponse` unconditionally. Authorization happens in `getCurrentProfile()` (`lib/auth.ts:27-50`), which calls `supabase.auth.getUser()` (authoritative `GET /auth/v1/user`) and rejects `is_active === false`; `requireRole()` (52-58) adds the `must_change_password` and role gates. Every protected page/action/route calls one of these. Removing the proxy *validation* call therefore removes no gate.
2. **Refresh behaviour is unchanged by the `getUser()`→`getSession()` swap.** In `@supabase/auth-js`, both go through `_useSession`→`__loadSession`, which refreshes whenever `expires_at*1000 - now < EXPIRY_MARGIN_MS` (`GoTrueClient.js:2533-2561`) **regardless of `autoRefreshToken`**. `createServerClient` forces `autoRefreshToken:false` (`@supabase/ssr createServerClient.js:30`), yet the refresh still fires — so the swap only drops the redundant `/user` round trip, not the refresh.
3. **Matcher is safe (verified, not assumed).** Compiled with Next's own `getMiddlewareMatchers()`; the resulting regexp is `…(?:\/((?!_next/static|_next/image|.*\.(?:…|html)$).*))(\.json|\.rsc|\.segments\/.+\.segment\.rsc)?[\/#?]?$`. Next appends the `.rsc`/`.segments` transport suffix **outside** the exclusion lookahead, so RSC navigations are still proxied (proven against 48 paths: 30 proxied incl. `.rsc`, 18 assets excluded). All dynamic route params are UUIDs (`lib/support/guest-session.ts` `UUID_RE`; guest token is `?k=` in the query string), so no legitimate path ends in an excluded extension.
4. **Statistics & assignment pages preserve semantics.** `loadTeacherStatistics()` keeps the same projections, `.in(...)` filters, service-role vs cookie client split, and `.data ?? []` fallbacks; only the concurrency changed. In `/teacher/assignments/[id]`, the membership test `taughtClassIds.includes(classId)` is the same predicate as the previous `class_id = classId` filter; `notFound()` throws **before** any JSX is returned, so no unauthorized data is rendered.
5. **Overdue sweep / prefetch removal.** The sweep now has a single trigger (proxy `after()`), which fires on a strict superset of the events that previously triggered it. Removing `prefetch={true}` reverts to Next's default App-Shell prefetch and cannot grant or deny access.
6. **User changes preserved.** The review was read-only; the pre-existing video-compression work and the user's `isPrefetch`/`after()` proxy work were left untouched.

**Residual risk — NEW, found in this review (not a security hole):**

- **`isPrefetch` skip can trigger a cookie write during a Server Component render.** Because prefetch requests (`next-router-prefetch` / `next-router-segment-prefetch`) now bypass the proxy's `getSession()` refresh, a prefetch that also executes a protected page's server component (which calls `getUser()` via `requireRole`) can find the access token within its **90 s** expiry margin and attempt a refresh *during the render*. The Supabase SSR server client then writes the rotated cookie from the awaited `TOKEN_REFRESHED` handler (`createServerClient.js:49` → `applyServerStorage` → `cookies.js:334` → `setAll` → `lib/supabase/server.ts:19 cookieStore.set(...)`), and Next 16 throws *"Cookies can only be modified in a Server Action or Route Handler."*

  **Proven locally (offline, `fetch` stubbed, no production contact):** a near-expiry session passed to `getSession()` invokes `setAll`, and the thrown error propagates through `__loadSession`→`_callRefreshToken`→`_notifyAllSubscribers` (and also surfaces via `_emitInitialSession` as an unhandled rejection). Impact is bounded: the router discards a failed prefetch and the subsequent real navigation *is* refreshed by the proxy, so users should not see it — but it can log server errors and waste invocations. **Requires manual Preview verification** (see below). This is attributable to the uncommitted `isPrefetch` change; the committed HEAD proxy called `getUser()` on prefetches too, which refreshed ahead of the render and masked it.
  - **Smallest safe fix (proposed, not applied):** wrap the `cookieStore.set(...)` in `lib/supabase/server.ts` `setAll` in a `try/catch` (the standard Supabase/Next pattern for the "refresh attempted from a Server Component" case). That makes a render-time refresh a harmless no-op instead of a 500, and the proxy remains the layer that actually persists the rotated cookie. Alternatively, do not skip the proxy refresh for prefetches that can render dynamic content. Both change behaviour beyond the current diff, so neither was applied without approval.

**Manual verification required on Preview (cannot be done locally):**

1. With a session inside the 90 s margin, hover/scroll a link that triggers a prefetch and watch Vercel logs for *"Cookies can only be modified…"*.
2. Confirm login/logout, all role routes, and unauthorized redirects still behave.
3. Confirm a >1 h-stale session still refreshes on navigation.
4. Confirm signed-URL media and `/api/export` still work.

**Verdict:** suitable for a **Vercel Preview** deployment for smoke-testing. Not a security regression and not a blocker for Preview; the `isPrefetch`/render-refresh interaction above should be resolved (or explicitly accepted) before production. No production CPU claim is made.
