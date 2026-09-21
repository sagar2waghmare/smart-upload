# AGENTS.md — Smart Upload (project memory & handoff)

> **How to use this file:** Read this ENTIRE file at the start of every session and resume from the
> exact **Stopping Point** below. Do NOT restart, redesign, or undo existing work. After every
> significant task, update this file (all sections that changed) and save it. "Resume project"
> means: read this file and continue.
>
> **Repo status:** this project IS version-controlled on GitHub
> (`github.com/sagar2waghmare/smart-upload`, branch `main`). Keep this file and the repo in sync.

---

## 1. Project & current goal

**Project:** Smart Upload — a polished private media-library website ("ElegantFin-inspired", no
Jellyfin/ElegantFin runtime dependency). All design and components are original.

**Stack:** Next.js 16.3.4 (App Router) · React 19.1.0 · TypeScript · ESLint 9 (flat config) ·
`next/image` for images. No CSS framework — hand-rolled CSS in `app/globals.css` with centralized
design tokens in `:root`.

**Current goal:** Deliver a fully functional frontend prototype that runs cleanly in **demo mode**
(no external services configured), with a server-ready abstraction layer so it can be switched to
**real mode** (`AWS_LIBRARY_API_URL`, `CLOUDSHELL_UPLOAD_URL`, `TMDB_API_KEY`) without code changes.

**Production phase (in progress):** UI frozen and approved → Firebase Google auth (Phase 1 done,
security-reviewed + hardened) → whole-site auth gate implemented and **LIVE on Vercel** (confirmed
during the audit: `/api/auth/session` → `configured:true`; unauth pages 307 / APIs 401 in prod) →
**full security audit (done; one HIGH found — H1 page-level auth bypass — FIXED + runtime-verified,
commit `c75dbab`; remaining findings moderate/low, deferred)** → Phase 2 real AWS wiring → playback
→ upload hardening → demo-mode lockdown → deployment.
Auth is additive: the app keeps running in demo mode until Firebase env vars are set.

**Source of truth:** local codebase + this file + the git repository on GitHub
(`github.com/sagar2waghmare/smart-upload`, branch `main`). Commits must never include secrets or
`.env.local` (gitignored).

---

## 2. Architecture

```
Browser
  ├─ Smart Upload Next.js app (React 19 / App Router / all Components server-rendered by default)
  │   ├─ middleware.ts (edge, cookie-presence gate for protected routes)
  │   ├─ /api/auth/session  → session issue / revoke (Firebase ID token → __session cookie)
  │   ├─ /api/library       → AWS library proxy (lib/library-service.ts)
  │   ├─ /api/health        → ConfigSnapshot for settings page (public)
  │   ├─ /api/play/[id]     → playback URL resolution
  │   ├─ /api/upload-url     → CloudShell upload proxy (lib/cloudshell.ts)
  │   ├─ /api/identify       → filename → movie/tv/anime detection (lib/identify.ts + lib/media/detect.ts)
  │   └─ /api/metadata       → TMDB metadata service (lib/metadata/tmdb.ts)
  └─ AWS / CloudShell / TMDB  (server-side secrets stay server-side; browser gets only /api/*)

Auth flow: Google popup → Firebase ID token → POST /api/auth/session → __session cookie (httpOnly 7 days).
All /api/* (except /api/health, /api/auth/session) require __session when NEXT_PUBLIC_FIREBASE_* set.
```

### File map

| Area | Files |
|---|---|
| Auth | `middleware.ts` (edge route gate), `lib/auth.ts` (session helpers), `lib/firebase-admin.ts`, `lib/firebase-client.ts`, `app/api/auth/session/route.ts`, `components/AuthProvider.tsx`, `components/AccountButton.tsx`, `components/SignInPrompt.tsx` |
| App shell | `app/layout.tsx` (header/footer/mode pill, wraps AuthProvider), `app/globals.css` (tokens + all styles) |
| Pages | `app/page.tsx` (home), `app/upload/page.tsx`, `app/my-media/page.tsx`, `app/favorites/page.tsx`, `app/settings/page.tsx`, `app/play/[id]/page.tsx`, `app/browse/[kind]/page.tsx` |
| Components | `Header`, `NavigationMenu`, `SearchOverlay`, `Hero`, `Rail`, `MediaCard`, `LibraryTile`, `FavButton`, `SmartImage`, `VideoPlayer`, `UploadForm`, `icons.tsx`, `DetailsProvider`, `DetailsOverlay`, `PlaybackOverlay`, `ContinueWatchingRail`, `LoginScreen`, `AuthProvider`, `AccountButton`, `SignInPrompt` (all under `components/`) |
| Details UX | `components/DetailsProvider.tsx` (context: openDetails/closeDetails/openPlayer/closePlayer), `components/DetailsOverlay.tsx` (cinematic backdrop+poster+meta+resume+episodes), `components/PlaybackOverlay.tsx` (fullscreen player + `/api/play/[id]` + progress save/clear), `components/ContinueWatchingRail.tsx` (home rail from saved progress), `lib/watch-progress.ts` (localStorage `smart-upload:watch-progress`), `lib/use-tmdb-metadata.ts` (client hook → `/api/metadata` w/ cache) |
| Data/types | `lib/types.ts` (MediaItem, Episode, Season, UploadResult, IdentifyResult, ConfigSnapshot…) |
| Library | `lib/library-service.ts` (server: AWS fetch + normalize + demo fallback), `lib/client-library.ts` (client cache), `lib/mock-data.ts` (7 demo titles incl. 2 series w/ episodes), `lib/config.ts` (app mode / demo video / names), `lib/playback.ts` (URL resolution) |
| Favorites | `lib/favorites.ts` (localStorage key `smart-upload:favorites`) |
| Upload | `lib/cloudshell.ts` (normalizeUrl + cloudShellUpload + demo-queued fallback), `components/UploadForm.tsx` |
| Identify/metadata | `lib/media/detect.ts` (filename parser), `lib/identify.ts`, `lib/metadata/tmdb.ts` (search + 30-min TTL cache) |

### Key patterns (follow them)
- **Secrets stay server-side.** Env vars with `*_API_KEY`/`*_URL` are read only in `lib/*` server
  modules via `process.env`, never in client components. Only `NEXT_PUBLIC_*` reaches the browser.
- All API route handlers are `export const dynamic = "force-dynamic";` with `cache: "no-store"`.
- App mode flow: `lib/config.ts` → `getAppMode()`/`isDemoMode()`; library flow:
  `getLibrary()` returns `{ mode: "demo"|"aws", items, count }`. If AWS is configured but fails it
  falls back to demo with a `console.error`.
- Client components: `"use client"` at top. `SmartImage` is the wrapper around `next/image` — use it
  instead of raw `Image` (it degrades to a placeholder on error).
- Config for next/image remote hosts lives in `next.config.ts` `images.remotePatterns`
  (tmdb.org, `**.googleapis.com`, `**.amazonaws.com`).
- CSS: use the `:root` design tokens in `globals.css` (e.g. `var(--accent-bright)`, `var(--surface-2)`),
  never hard-code colors.
- **ANY Server Component that renders private library data MUST gate server-side FIRST:**
  `if (authIntended() && !(await requireSession())) redirect("/?signin=1");` placed BEFORE
  `getLibrary()`/metadata fetch (see `app/my-media/page.tsx`, `app/browse/[kind]/page.tsx`).
  `middleware.ts` cookie-presence is UX-only — never the security boundary (H1 fix, `c75dbab`).

---

## 3. Completed work (history)

- [x] Scaffolded Next.js 16 + React 19 + TS project, flat ESLint config (`eslint.config.mjs`), no
      extra runtime deps.
- [x] Full dark cinematic UI with centralized design tokens, responsive hamburger menu, search
      overlay, rails, library grid, hero carousel.
- [x] Custom keyboard-accessible video player (seek/volume/rate/fullscreen/skip ep, subtitles hook,
      poster + big-play gate, error + buffering states, quality menu stubbed "Auto").
- [x] Movie/TV/anime filename detection (`lib/media/detect.ts`) + TMDB metadata service
      (`lib/metadata/tmdb.ts`) with in-memory cache (TTL 30 min).
- [x] CloudShell upload URL integration via secure server-side proxy (`/api/upload-url`).
- [x] Clean AWS library API abstraction with normalization + demo fallback.
- [x] Favorites via localStorage; `/favorites` page; My Media page; settings integration dashboard
      (uses `/api/health` → `ConfigSnapshot`).
- [x] Upload page with live debounced filename detection preview and file-extension detection.
- **Latest session (13 Sep 2026) — homepage/hydration hardening, DONE:**
  - `app/page.tsx` — homepage guards against an empty AWS library
    (`mode === "aws" && items.length > 0`), falls back to `featuredMedia`; `heroItems[0]` can never
    be undefined (previously could crash SSR).
  - `components/Hero.tsx` — carousel index math made count-safe (`((next % count) + count) % count`),
    autoplay respects `prefers-reduced-motion`, pauses on `document.hidden`, hover/focus (pointer
    enter/leave + focus/blur), nav buttons get aria-labels, layers use `aria-hidden`.
  - `components/SmartImage.tsx` — image errors degrade to a styled placeholder via `onError`,
    placeholder uses `var(--surface-2)` + muted icon; no more unhandled image throws.
  - `lib/library-service.ts` — AWS items normalized with tolerant field mapping
    (`id`/`_id`, `mediaUrl`/`playbackUrl`/`streamUrl`, `poster`/`backdrop`); fetch failure logs and
    falls back to demo library.
  - `next.config.ts` — `images.remotePatterns` for tmdb.org / `**.googleapis.com` / `**.amazonaws.com`.
  - Retained: demo page's homepage smoke test → HTTP 200 (see §6).
- **Latest session (13 Sep 2026) — homepage spacing/alignment fix, DONE (lint + build clean):**
  - `app/page.tsx` — homepage content now wrapped in the shared `.page` container
    (`max-width:1700px; margin-inline:auto; padding-inline:var(--pad)`), the same alignment
    system every other page uses. This fixes content being flush-left with a dead zone on the
    right on desktop. The `Hero` stays outside the wrapper (full-bleed, unchanged).
  - `app/globals.css` — `.section-head` hardened into a stable flex row with `flex-wrap:nowrap`;
    the title (`h2`) gets `flex:1; min-width:0; overflow:hidden`, and `.see-all` gets
    `flex:none; white-space:nowrap; margin-left:auto` so it can never wrap, overlap, or detach
    from its section. Fixes every rail header at once (Continue Watching, Recently Added,
    My Media) via the shared classes.
  - No card/poster sizing, hero visuals, or backend/API code changed. No horizontal overflow.
- **Latest session (13 Sep 2026) — Recently Added adaptive rail, DONE (lint + build clean):**
  - `components/Rail.tsx` — added optional `fill?: boolean` prop that adds a `rail--fluid` class
    to the rail container; no other rail is affected.
  - `app/page.tsx` — `fill` passed ONLY to the "Recently Added" rail; all other rails/sections
    unchanged.
  - `app/globals.css` — new token `--card-w-fill:240px`; `.rail.rail--fluid` switches that rail to
    `display:flex` and `.rail--fluid .media-card{flex:1 0 var(--card-w); max-width:var(--card-w-fill)}`.
    Few titles grow from 168px up to 240px to use free row width (no big empty area, no stretched
    posters); when the row overflows it scrolls naturally at the base card width. Responsive
    overrides keep the existing 132px/118px card sizes on tablet/mobile.
  - Continue Watching, Movies/TV Shows/Anime/Box Sets tiles, My Media, browse grids, hero, and
    backend/API code unchanged.
- **Latest session (13 Sep 2026) — My Media adaptive rail, DONE (lint + build clean):**
  - `app/page.tsx` — the homepage "My Media" section (the collection tiles) now renders inside
    `<div className="rail rail--fluid">` instead of `.library-grid`. This was the other
    left-anchoring culprit: `library-grid`'s `auto-fill` creates invisible empty tracks, so the 4
    tiles sat on the left half with a big dead zone on the right. Reused the exact same
    `rail--fluid` classes as Recently Added (no new prop/component needed — tiles are a different
    shape than `MediaCard`, so a Rail `fill` prop didn't fit).
  - `app/globals.css` — new token `--tile-w-fill:480px`; `.rail.rail--fluid .library-tile`
    `{flex:1 0 220px; max-width:var(--tile-w-fill)}` grows library tiles up to 480px to fill free
    row width (aspect-ratio 16/6.5 preserved, no distortion), and falls back to natural scroll at
    the 220px base when the row overflows. Mobile override keeps `flex-basis:160px; max-width:none`
    so phone behavior stays full-row-ish; `.library-grid` CSS itself is UNCHANGED (my-media
    Collections section still uses it).
  - Verify scope: `rail--fluid` now appears only in `app/page.tsx:20` (Recently Added) and
    `app/page.tsx:29` (My Media). Header + "See all" in My Media untouched. Hero, player, all
    other sections, colors/typography, and backend/API unchanged.
- **Latest session (13 Sep 2026) — PRODUCTION AUDIT (read-only), DONE. NO code changes.**
  - **UI is officially approved and FROZEN** — no more UI/layout/styling/adaptive changes.
    Production phase begins.
  - Full audit delivered in chat (sections A–K). Headline findings: no Firebase/auth/session or
    middleware exists; every `/api/*` route is public; app runs in demo mode by default;
    `AWS_LIBRARY_API_URL` (target `https://3-24-215-48.sslip.io`) is unconfigured and the AWS
    contract is unknown; CloudShell uploader is correctly isolated/offline-tolerant.
  - Production must NOT operate in demo mode: no silent demo fallback on AWS failure, no fake
    library, no demo copy; AWS-down must render a clear "library unavailable" state instead.
  - Recommended order: AWS/Firebase recon (Phase 0) → Firebase auth (Phases 1) → real AWS wiring
    (2) → playback (3) → upload hardening (4) → demo lockdown (5) → hardening (6) → deploy (7).
  - Standing constraint §8.1 ("no new runtime dependencies") must be relaxed/nonexistent for
    `firebase` + `firebase-admin` — needs user approval before Phase 1.
- **Latest session (13 Sep 2026) — Phase 1 (Firebase auth foundation) IMPLEMENTED.**
  - Runtime deps added: `firebase` + `firebase-admin` (user approved relaxing §8.1 for these).
  - New `lib/firebase-client.ts` (browser Firebase app + Google sign-in popup + `signOutSession`),
    `lib/firebase-admin.ts` (server-side cert from `FIREBASE_SERVICE_ACCOUNT_JSON` or
    projectId/clientEmail/privateKey triple; `verifySessionCookie`/`verifyIdToken`/
    `createSessionCookie`), `lib/auth.ts` (`requireSession`/`getSessionUser`, cookie `__session`,
    7-day httpOnly SameSite=Lax, `isAllowedEmail` from `ALLOWED_EMAILS` allowlist, deny-by-default).
  - New `app/api/auth/session/route.ts` — GET session state, POST issue (verifies ID token → adds
    to session cookie), DELETE revoke. All 6 public API routes now call `requireSession()`, except
    `/api/health` and `/api/auth/session`. **Auth is additive:** when Firebase is NOT configured,
    `requireSession()` returns a local-demo user so demo mode keeps working untouched.
  - New `middleware.ts` (edge, dependency-free): gates `/my-media`, `/favorites`, `/upload`,
    `/settings`, `/play` when `NEXT_PUBLIC_FIREBASE_*` is set and no `__session` cookie → redirects
    to `/` with `?signin=1`. Cookie presence is UX-only; real verification happens in Node API routes.
  - New client components `components/AuthProvider.tsx` (context: configured/loading/user/signIn/
    signOut) and `components/AccountButton.tsx` (profile dropdown with sign-in/sign-out; shows
    "not configured" gracefully). `layout.tsx` wraps the app in AuthProvider; `Header.tsx` profile
    stub replaced with AccountButton; `NavigationMenu.tsx` gained an account group; home page shows a
    `SignInPrompt` banner only when redirected with `?signin=1`.
  - `.env.example` + settings env table gained Firebase/ALLOWED_EMAILS vars. New CSS classes
    `.profile-wrap`/`.account-menu`/`.account-*` (tokens only). Home page now takes `searchParams`.
- **Latest session (13 Sep 2026) — Phase 1 security review (read-only), DONE.**
  - 12-point checklist reviewed across `lib/firebase-client.ts`, `lib/firebase-admin.ts`, `lib/auth.ts`,
    `app/api/auth/session/route.ts`, `middleware.ts`, `AuthProvider`, `AccountButton`, `SignInPrompt`,
    and all 5 protected API routes.
  - **Passed:** unauth request cannot obtain a session (ID token crypto-verified via Admin);
    cookie flags (HttpOnly, Secure in prod, SameSite=Lax, host-only, 7-day expiry); ALLOWED_EMAILS
    server-side deny-by-default; per-route Firebase Admin verification with `checkRevoked=true`;
    middleware is cookie-presence UX only (not the boundary); all protected routes call
    `requireSession()`; `/api/health` + `/api/auth/session` intentionally public; no service-account
    secret in client bundles (only `NEXT_PUBLIC_*` reach the browser); no hardcoded credentials
    (source scans clean, no `.env.local` on disk); UI changes limited to approved auth controls.
  - **Findings before fixes:** (1) FAIL-OPEN — `requireSession()` returned a demo user whenever
    Firebase Admin was unconfigured, incl. production/client-Firebase-configured misconfigs;
    (2) session DELETE cleared the cookie but did not revoke the Firebase session server-side.
- **Latest session (13 Sep 2026) — Phase 1 security fixes applied (approved), DONE.**
  - **Fix 1 (fail-closed, `lib/auth.ts`):** demo-user fallback is now allowed ONLY in dev when no
    `NEXT_PUBLIC_FIREBASE_*` client config exists. If client Firebase is configured OR we are in
    production, but Firebase Admin is missing/empty/malformed, `requireSession()` logs a safe error
    (env-var NAMES only — never credentials/JSON/tokens) and returns null → 401 on all protected routes.
  - **Fix 2 (revoke on DELETE, `lib/firebase-admin.ts` + session route):** `revokeRefreshTokens(uid)`
    helper added; DELETE verifies the cookie → gets uid → revokes Firebase session server-side →
    clears `__session` regardless of revocation outcome (idempotent, errors swallowed, nothing
    sensitive exposed to the client). Protected routes already use `checkRevoked=true`.
  - Verified: lint clean, production build clean, changed files re-read + focused security check sound.
    Scope respected — no AWS/CloudShell/DNS/deploy/UI/demo changes.
  - IMPORTANT: no real Firebase project credentials yet — auth is inert until `NEXT_PUBLIC_FIREBASE_*`
    + `FIREBASE_SERVICE_ACCOUNT_JSON` + `ALLOWED_EMAILS` are set (Phase 1.5).
- **Latest session (13 Sep 2026) — FINAL PRE-UPLOAD AUDIT (read-only), DONE. NO code changes.**
  - Verified: lint clean; production build clean (only known `middleware`→`proxy` deprecation
    warning, build lists `ƒ Proxy (Middleware)`); no secrets on disk (only `.env.example`, no
    `.env.local`/key/service-account files, gcloud/git credential files absent); secret-pattern scans
    of `lib`/`app`/`components` clean; server-only env vars read only in `lib/*` + `middleware`, no
    client component imports any server-only module; `.gitignore` covers `node_modules`, `.next`,
    `.env*`, `next-env.d.ts`, build/log/IDE artifacts (`.env.example` correctly NOT ignored); all
    5 protected `/api/*` routes call `requireSession()` (auth/session + health intentional public);
    UI untouched this session. READY for `git init` → first commit → GitHub → Vercel.
  - Upload set: 61 files (62 on disk minus gitignored `next-env.d.ts`) — 12 app dirs, 17 components,
    15 lib files, 6 route handlers, 6 public webp, configs + README + AGENTS.md + .env.example.
  - First-deploy note (by design, not a leak): with NO Vercel env vars the site runs in demo mode
    (7 mock titles, public sample video, upload "not-configured"); demo lockdown remains a later phase.
- **Latest session (13 Sep 2026) — PRODUCTION AUTH-GATE DIAGNOSIS (read-only, no code changes).**
  - App was deployed to Vercel; `/my-media` was publicly accessible without sign-in. Root cause
    found + reproduced locally (isolated sandbox, production build): the middleware gate in
    `middleware.ts:12` (`authConfigured`) requires `NEXT_PUBLIC_FIREBASE_API_KEY` +
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID` at BUILD time. Vercel had only the server-side
    `FIREBASE_SERVICE_ACCOUNT_JSON` + `ALLOWED_EMAILS`; no `NEXT_PUBLIC_FIREBASE_*` client config.
    Result: `authConfigured=false` → middleware `next()` → the static prerendered `/my-media`
    serves to everyone. API boundary still fails closed (verified 401). Reproduction: build with
    Admin-only → `/my-media` 200, `/api/library` 401; build with NEXT_PUBLIC trio added →
    `/my-media` (no cookie) **307 → `/?signin=1`**, with cookie 200. Next 16 `middleware`→`proxy`
    deprecation is NOT the cause (Proxy function runs normally).
  - **Smallest safe fix:** add the 6 `NEXT_PUBLIC_FIREBASE_*` client vars (public-by-design Firebase
    web config: API key, authDomain, projectId, storageBucket, messagingSenderId, appId) to Vercel
    Environment Variables and REDEPLOY (needs a new build — NEXT_PUBLIC_* is inlined at build time).
    No code change. NOTE: if the Admin JSON/allowlist were also broken, the middleware would gate but
    sign-in would fail closed (401) — but sign-in is currently inert anyway because the client app
    never initializes without the trio.
- **Latest session (13 Sep 2026) — WHOLE-SITE AUTH IMPLEMENTED (approved requirement), DONE
  (lint + production build clean; sandbox production verification passed for scenarios A–E).**
  - **Requirement:** the ENTIRE website must require authentication (Home, My Media, Favorites,
    Upload, Settings, Play, Browse Movie/Series/Anime); unauthenticated visitors see only the
    Google Sign In experience; login UI stays reachable; deny-by-default; ALLOWED_EMAILS governs;
    APIs stay server-side protected.
  - **Files changed (smallest set, UI/styling untouched):**
    - `middleware.ts` — removed the hard-coded `guardedRoutes` list; now gates EVERY page route
      (matcher still excludes `api`, `_next/static`, `_next/image`, favicon, static files). When
      `authConfigured` (NEXT_PUBLIC_FIREBASE_API_KEY + _PROJECT_ID) and no `__session` cookie →
      redirect to `/?signin=1`, EXCEPT `pathname === "/" && signin === "1"` (sign-in landing) which
      passes through (prevents redirect loops). Demo mode (no Firebase client config) unchanged/open.
    - `lib/auth.ts` — exported `authIntended()` (same trio check as the old private
      `authIntendedFromClient`); `requireSession()` now uses it.
    - `app/page.tsx` — when `authIntended() && !(await requireSession())`, returns ONLY the existing
      `SignInPrompt` (prompt) inside `.page`; no Hero/rails/library/tiles/demo content rendered
      pre-login. Demo mode (no client config) renders the homepage exactly as before.
    - `components/AuthProvider.tsx` — `signIn()` and `signOut()` now call `router.refresh()` after
      success so Server Components re-render with the new/cleared `__session` cookie.
  - **Verification (isolated sandbox, production builds):**
    - Prod-like build (client trio + dummy Admin + ALLOWED_EMAILS): every page route without a
      cookie → **307 to `/?signin=1`**; `/?signin=1` (no cookie) → **200** with sign-in copy only
      (no hero/rails/library content in HTML); `/my-media` with cookie → **200**; `/api/library`,
      `/api/metadata`, `POST /api/identify` without session → **401**; `/api/health` → **200**.
    - Demo build (no Firebase env): all pages → **200** public; homepage renders hero/demo content
      unchanged. (Prod-build demo APIs fail closed 401 — pre-existing design, unchanged.)
    - Note: full valid-session render of the dynamic home can only be E2E-tested with REAL Firebase
      credentials (session cookie must verify against the real project's signing keys); the sandbox
      dummy-credential path cannot mint one. Middleware cookie-presence behavior was verified.
  - **Current Firebase auth state:** code is fully implemented; Vercel still lacks the
    `NEXT_PUBLIC_FIREBASE_*` client vars, so the whole-site gate is OFF on the live deploy until
    those 6 vars are added + redeployed (build-time inlined). With them set, the entire site gates.
  - **Remaining limitations:** files under `public/` (poster webp, sample video URL) remain
    directly fetchable by URL without login (asset-level, not page-level — out of scope).
- **Latest session (13 Sep 2026) — Phase 1.5 fail-closed verification (runtime test), DONE (lint +
  build clean).** No real Firebase project exists yet, so the E2E gating machinery was verified with
  a temporary production server (`next build` with dummy `NEXT_PUBLIC_FIREBASE_*` client config, NO
  Admin credential, `next start -p 3791`):
  - `/` → **200** (home stays public).
  - `/api/library` without a session cookie → **401** `{"error":"unauthorized","message":"Sign in
    to continue."}` — no demo-user fallback, no protected data (fail-closed confirmed in production).
  - `/my-media` → **307 → `/?signin=1`** (middleware cookie-presence gate works in production).
  - `/api/metadata`, `/api/play/[id]`, `POST /api/identify`, `POST /api/upload-url` → **401**.
  - `/api/auth/session` → `{"authenticated":false,"configured":false}` when Admin is missing.
  - Baseline (no Firebase at all, dev server 3777): `/api/library` **200** (demo), `/my-media`
    **200**, session `{"authenticated":false,"configured":false}` — auth is additive, demo intact.
  - Temporary servers stopped; ports closed; no stray node processes; lint clean; production build
    clean (build route table now shows `ƒ Proxy (Middleware)` — Next 16 migrated the convention).
  - Result: auth is **verified fail-closed and additive**. Only the real Firebase Console
    configuration (+ `.env.local` values) is missing before end-user sign-in is possible.
- **Latest session (13 Sep 2026) — git initialized + whole-site auth committed; local Firebase
  client config created; service-account registered as a local file path.**
  - Project version-controlled: `git init` → initial commit `56f974f` → pushed to
    `github.com/sagar2waghmare/smart-upload` (branch `main`). Whole-site auth commit `42916ee`
    ("Implement whole-site Firebase authentication") pushed; working tree clean. `.env.local` is
    gitignored and never committed; no credentials in any commit.
  - `.env.local` (gitignored) created from `.env.example` with the 6 `NEXT_PUBLIC_FIREBASE_*`
    client vars from the fresh Firebase project `smart-upload-383bf`, and
    `FIREBASE_SERVICE_ACCOUNT_JSON` set to the **path** of a service-account JSON kept outside the
    repo (`C:\Users\Sagar\SmartUpload-Secrets\`). Verified: file present, all six vars non-empty,
    variable present/non-empty.
  - **Caveat recorded:** `lib/firebase-admin.ts` does `JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)`
    and needs the JSON blob, not a path. Until resolved (embedded blob / path-read support / Admin
    triple), Firebase Admin stays unconfigured → auth fails closed → no real sign-in possible.
  - `.env.local` untracked + gitignored (verified via `git check-ignore`); no `.env.local`/secret
    in any commit; build path accidentally concatenated a line onto `NEXT_PUBLIC_FIREBASE_APP_ID`
    during append and was repaired (file restored to valid 7-line format, APP_ID format verified).

- **Latest session (13 Sep 2026) — `FIREBASE_SERVICE_ACCOUNT_JSON` filesystem-path support
  IMPLEMENTED (lint + build clean; runtime-verified).**
  - `lib/firebase-admin.ts` — added `readServiceAccountValue()`: env value starting with `{` is
    JSON-parsed inline exactly as before; anything else is treated as a filesystem path and read
    server-side via Node `path.resolve` + `fs.readFileSync`, then JSON-parsed. Errors (missing/
    unreadable file, malformed JSON) fall through to the existing
    `FIREBASE_PROJECT_ID`/`_CLIENT_EMAIL`/`_PRIVATE_KEY` triple → null → `firebaseAdminConfigured()`
    false → fail-closed 401 (behavior preserved). Credential contents are never logged/printed.
  - Runtime proof on this machine: the `.env.local` path value resolves, file reads, JSON parses
    with `type/project_id/private_key/client_email` present (booleans only; contents never displayed).
  - Scope respected: `.env.example`/`.env.local`/middleware/auth routes/UI/AWS/CloudShell untouched;
    NOT committed yet (working tree: AGENTS.md + lib/firebase-admin.ts modified).
- **Latest session (13 Sep 2026) — Firebase Admin app-reuse init bug FIXED + FULL-SCREEN AUTH GATE
  (lint + build clean).**
  - **Bug fixed (`lib/firebase-admin.ts`):** `getAdminApp()` relied only on the module-level
    `cachedApp`. If an Admin app named `smart-upload-admin` already existed in the SDK (dev
    hot-reload / page-data workers re-initializing the module), `initializeApp()` threw "already
    exists" and auth could fail intermittently. Fix: import `getApps` from `firebase-admin/app`;
    `getAdminApp()` reuses an existing app via `getApps().find((a) => a.name === "smart-upload-admin")`
    before ever calling `initializeApp()`. `ADMIN_APP_NAME` is a named constant; `cachedApp` kept
    as fast path. Behavior otherwise unchanged.
  - **ENHANCED login gate (owner-approved, no authenticated-site changes):**
    - `components/LoginScreen.tsx` (new, client) — full-screen cinematic login: Smart Upload brand
      mark + name, "Welcome to Smart Upload", sign-in-required copy, prominent "Continue with
      Google" button (official Google G glyph) via `AuthProvider.signIn()`, loading spinner
      ("Checking session…") and error states. Returns null if a user session appears post-hydration.
    - `app/page.tsx` — unauthenticated (auth intended + no session) renders `<LoginScreen />` only
      (no `.page` wrapper, no hero/rails/library).
    - `app/layout.tsx` — becomes async; hides `Header` + footer entirely while the gate is active
      (`authIntended() && !(await requireSession())`), so no navigation/upload controls leak onto
      the login screen. Authenticated/demo rendering unchanged.
    - `middleware.ts` — `/` now passes through middleware (the page itself renders the login gate);
      every other no-cookie page route still 307-redirects to `/?signin=1`.
    - `app/globals.css` — added `.login-screen`/`.login-card`/`.login-*` styles + `.spinner` keyframes
      using existing `:root` tokens only.
  - Scope respected: AWS/CloudShell/upload/playback/demo/AuthProvider/firebase-client/API routes
    untouched; admin bug fix + login gate only. NOT committed yet (working tree:
    AGENTS.md, lib/firebase-admin.ts, middleware.ts, app/page.tsx, app/layout.tsx, app/globals.css,
    components/LoginScreen.tsx modified/added).
- **Latest session (14 Sep 2026) — AUTH GATE committed/pushed; firebase-admin pin; browser E2E
  issue root-caused; FULL SECURITY AUDIT delivered (read-only).**
  - `d3d7c2c` "Complete Firebase authentication gate" (7 files — LoginScreen gate, layout hide,
    middleware `/` passthrough, Admin app-reuse fix) committed + pushed. `d2f704b` "Pin
    firebase-admin to 13.10.0 to avoid jose v6 ESM issue" (package.json + package-lock.json)
    committed + pushed — `firebase-admin@13.10.0 → jwks-rsa@3.2.2 → jose@4.15.9` (jose@6 is
    ESM-only and breaks Node CJS `require`); runtime `require('jose')` works.
  - Browser "login screen not showing" investigation: the server provably serves the login screen;
    cause is client-side (valid session cookie + cache reusing the logged-in shell) — no server fix.
  - **Security audit (inspect → safe prod probes → report; NO code changes). Verdict: NEEDS
    ATTENTION** — one HIGH (H1, fixed next entry); everything else moderate/low/informational.
    Live-production probes: `GET /` → 200 login gate only; `/my-media` → 307 `/?signin=1`;
    `/api/library`, `/api/identify`, `/api/upload-url`, `/api/metadata`, `/api/play/[id]` → **401**
    with junk cookie; `/api/auth/session` → `configured:true` (Vercel client config + Admin ARE set
    → **whole-site gate is LIVE in production**, superseding the earlier "gate OFF" note); HSTS
    present (Vercel); no CORS headers; sourcemap probe → 403. Clean (verified): no XSS sinks
    (`dangerouslySetInnerHTML`/`innerHTML`/`eval` = 0 hits), no command injection, no path
    traversal (only env-controlled `readFileSync`), no local SSRF, cache headers `private
    no-store`, git history/tracked files contain no secrets.
  - **Findings NOT fixed (reported; fixes deferred):** M1 no rate-limiting/body-size caps; M2 no
    security headers (CSP/XCTO/XFO/Referrer-Policy/Permissions-Policy); M3 `/api/upload-url` echoes
    raw upstream `err.message` on 500; L1 public `/api/health` info; L2 `X-Powered-By: Next.js`;
    L3 `_next/image` proxy for whitelisted hosts; L4 public webp + demo-mode content; L5 predictable
    IDs (no IDOR — single-family library); L6 no `__Host-` cookie prefix; I1 `npm audit` 0
    critical/0 high/**8 moderate** (`uuid` buffer-bounds family via `@google-cloud/*`, `google-gax`,
    `gaxios`, `retry-request`, `teeny-request`; fix = `firebase-admin@14`, which reintroduces the
    `jose@6` ESM issue → `^13.10.0` pin retained); I2 CloudShell = external SSRF boundary (out of
    scope); I3 production runs in demo mode (no AWS/CloudShell/TMDB configured); I4 Vercel preview
    protection unverified (recommended).
- **Latest session (14 Sep 2026) — H1 FIXED (page-level auth bypass) + runtime-verified; committed
  `c75dbab` (NOT yet pushed).**
  - **Bug (audit H1, verified in prod):** `middleware.ts` only checked for `__session` *presence*;
    `app/my-media/page.tsx` and `app/browse/[kind]/page.tsx` are Server Components that called
    `getLibrary()` without verifying the session — a junk `__session=JUNK` cookie returned HTTP 200
    with the full private catalog HTML. APIs stayed 401, but catalog metadata leaked.
  - **Fix (smallest, 2 files, +6 lines):** in both Server Components, BEFORE `getLibrary()`:
    `if (authIntended() && !(await requireSession())) redirect("/?signin=1");` (imports: `redirect`
    from `next/navigation`, `authIntended`/`requireSession` from `lib/auth`). Reuses ONLY the
    existing crypto-verified path (`requireSession()` → Firebase Admin `verifySessionCookie`
    `checkRevoked=true` + `ALLOWED_EMAILS` deny-by-default). Middleware unchanged (UX-only gate).
  - **Verification (production build `next start -p 3777`):** see §6. `lint` clean, `build` clean.
    Commit `c75dbab` "Fix page-level auth bypass for private library" (2 files, 6 insertions) —
    **branch `main` is `ahead 1` of `origin/main` (fix NOT pushed yet). Working tree clean after
    committing the fix (AGENTS.md update in this entry is itself uncommitted).**
- **Latest session (14 Sep 2026) — Cinematic media-details + fullscreen player UX IMPLEMENTED
  (non-committed working tree).**
  - Context flow: poster/title click (`MediaCard` + `Hero` "Details") → `openDetails(item)` →
    full-screen `DetailsOverlay` (fixed, z-index 80, out of document flow) → Play/Resume →
    `openPlayer(episode?)` → fullscreen `PlaybackOverlay` (fixed, z-index 90) → back button →
    details → back button → dashboard. Escape closes player first, then details. Body scroll
    locks while any overlay is open (`DetailsProvider` effect). Overlays are keyed by item id
    (`key={item ? item.id : "closed"}`) so sub-state re-initialises per title.
  - **New files:** `lib/watch-progress.ts` (localStorage key `smart-upload:watch-progress`;
    stores ONLY `{id, position, duration, episodeId?, updatedAt}` — never URLs/tokens/cookies;
    `saveProgress/clearProgress/getProgress/progressPercent/watchMode/formatPosition` +
    `useWatchProgress()` hook that syncs on a custom `watch-progress` window event + `storage`);
    `lib/use-tmdb-metadata.ts` (client hook → `/api/metadata?query=&type=&year=` with in-memory
    cache incl. negative results; render-phase reset keyed on title/year/kind);
    `components/DetailsProvider.tsx`, `components/DetailsOverlay.tsx`,
    `components/PlaybackOverlay.tsx`, `components/ContinueWatchingRail.tsx`.
  - **Edited:** `components/VideoPlayer.tsx` — new optional `initialTime` (seek once on
    loadedMetadata/loadedData) + `onProgress` (throttled ~4 s, flushed on pause/seek/unmount) +
    `onEnded` callbacks via a `cbRef` pattern; `components/MediaCard.tsx` — poster + title are now
    buttons that open details (no card play button/overlay; FavButton is the only hover control);
    progress bar shows live from `useWatchProgress` with "Resume at MM:SS"; `components/Hero.tsx` —
    "Details" is a button → `openDetails(item)` (Play link unchanged); `app/page.tsx` — Continue
    Watching section switched to client `<ContinueWatchingRail/>` (real saved progress, filters
    pct 5–95, sorted by updatedAt); `app/layout.tsx` — wrapped shell in `DetailsProvider`;
    `app/globals.css` — `html{scrollbar-gutter:stable}` (no layout shift on scroll-lock),
    `.details-hero` overlay resets (`margin:0;padding:0` to neutralise the orphaned committed
    rule), `.details-poster` scoped to hero (hidden <640 px), overlay/player/backdrop/episode-grid
    + `@keyframes overlay-in` styles. Reused existing `.season-*`/`.episode-*`/`.details-actions`/
    `.pill-*` classes (originally committed for the `/play/[id]` page) inside the overlay.
  - **Behavior notes:** Resume label = "Play" (<5%), "Resume Watching" (5–95, initialTime seeks),
    "Watch Again" (≥95). Series pick the stored episode; switching episodes starts at 0.
    `PlaybackOverlay` fetches `/api/play/[id]`, shows a typed error state when `canPlay` is false,
    clears progress on ended, saves on progress ticks. `DetailsOverlay` enriches via TMDB hook
    (falls back to local item fields); episodes render in a responsive grid with a resume chip.
  - **Verification:** `npm run lint` clean; `npm run build` clean (only the pre-existing
    middleware→proxy deprecation warning). No runtime/browser E2E performed (auth-gated; UI is
    verified statically + type-checked). Not committed; working tree = this entry + §6 note.
- **Latest session (14 Sep 2026) — ElegantFin-inspired details-overlay polish, DONE (lint +
  build clean; scoped, no UI-freeze violations).** ElegantFin used as visual reference ONLY —
  no ElegantFin/Jellyfin CSS imported or copied; all patterns re-created with existing tokens.
  - `components/DetailsOverlay.tsx` — metadata hierarchy now matches ElegantFin: genres removed
    from the flat `hero-meta` line and rendered as their own `.details-genres` chip row
    (`.pill pill-neutral`, up to 4, after the meta line) so the meta line holds only year •
    rating • runtime. No other overlay logic changed.
  - `app/globals.css` (overlay block only) — cinematic polish, all scoped to overlay classes and
    reusing existing tokens: slow Ken-Burns hero backdrop zoom (`@keyframes hero-zoom`, 22 s) with
    the existing backdrop dim/brightness; stronger 3-stop gradient on `.details-hero-shade`
    (deeper left→right legibility + bottom fade into `var(--bg-0)` + top fade for the back
    button); staggered fade-rise entrance for `.details-copy > *` children (1–8, `copy-rise`,
    incremental delays ~60 ms); slightly larger/explicit Play CTA
    (`.details-copy .details-actions .btn-primary`, accent-glow shadow + hover lift);
    `.details-copy .pill`/`.details-overview` micro-spacing; `prefers-reduced-motion:reduce`
    guard disables the zoom + stagger (children instantly visible). **Nothing shared was touched**:
    `.details-actions`/`.hero-meta`/`.details-genres`/`.details-poster` base rules for
    `/play/[id]` + settings pages are unchanged (overlay refinements are nested under
    `.details-copy` / `.details-hero`, which only exist in the overlay).
  - Constraint honored: committed hero/cards/rails/player/settings/dashboard untouched; no new
    colors added (uses existing `--accent-*`/`--warn`/`--bg-*`/rgba(8,12,20,…) values). Demo
    "gold" star accent preserved (`.dot`/`IStar` with `var(--warn)` unchanged).
  - **Verification:** `npm run lint` clean; `npm run build` clean (only the pre-existing
    middleware→proxy deprecation warning). Still not committed; working tree = this + prior entry.
- **Latest session (14 Sep 2026) — Impl review + 3 real fixes (DONE, lint + build clean).**
  - Reviewed the cinematic details/player implementation across the new components + the supporting
    `/api/metadata`, `/api/play/[id]`, `client-library`, watch-progress, icons/Rail/FavButton —
    found 3 real issues, all fixed.
  - **Fix 1 (`components/DetailsProvider.tsx`):** overlay keys were duplicated (`key={item ? item.id
    : "closed"}` for BOTH `DetailsOverlay` and `PlaybackOverlay`, two siblings) → React treated them
    as the same child and remounted one whenever the other's key changed. Now namespaced:
    `details-${item.id}` / `details-closed` and `player-${item.id}` / `player-closed`.
  - **Fix 2 (`components/PlaybackOverlay.tsx`):** resume seek honored the stored position for ANY
    episode match, so "Watch Again" (≥95%) sought to the near-end instead of starting over. Now
    `initialTime` is passed only inside the 5–95% resume band (`progressPercent(stored) >= 5 && < 95`);
    <5% ("Play") and ≥95% ("Watch Again") both start at 0. `progressPercent` imported.
  - **Fix 3 (`components/PlaybackOverlay.tsx` `handleProgress`):** `endedRef` stayed `true` after
    ended→Replay, so a replay watch was never saved (progress tracking silently died). Now a progress
    tick that is NOT near the end (`position < duration*0.95`) clears `endedRef` and resumes saving;
    the post-ended unmount flush (at/near duration) still returns early so a completed watch isn't
    re-saved after `clearProgress`.
  - **Verification:** `npm run lint` clean; `npm run build` clean (only pre-existing middleware→proxy
    deprecation warning). Not committed; `c75dbab` still HEAD, main ahead 1 of origin. Working tree =
    this + the two prior UX entries (§6 notes kept in sync).

---

## 4. Bugs, warnings & constraints

- **No known open bugs.** Lint and production build are both clean (see §6).
- Next 16 deprecation note on `middleware` vs `proxy`: the latest build already emits
  `ƒ Proxy (Middleware)` in its route table (Next 16 migrated the convention internally), so the
  deprecation is effectively moot. Optionally rename `middleware.ts` → `proxy.ts` in a later cleanup
  task (Stopping point §7, item 3).
- **Local Firebase client config + service-account path setup complete (13 Sep 2026); remaining
  local blocker is only `ALLOWED_EMAILS`.** `.env.local` (gitignored) contains the 6
  `NEXT_PUBLIC_FIREBASE_*` client vars from the fresh Firebase project `smart-upload-383bf`, and
  `FIREBASE_SERVICE_ACCOUNT_JSON` set to the **file path** of a service-account JSON kept OUTSIDE
  the repo (`C:\Users\Sagar\SmartUpload-Secrets\`). `lib/firebase-admin.ts` now supports BOTH an
  inline JSON blob and a filesystem path (path branch added 13 Sep 2026): values starting with `{`
  are JSON-parsed as before; anything else is resolved with Node `path.resolve` + `fs.readFileSync`
  and JSON-parsed. Verified at runtime on this machine (parse ok, required fields present — no
  credential contents printed). **`ALLOWED_EMAILS` is not set locally.** The credential never enters
  the repo (`.env.local` gitignored; SA JSON lives outside the project; AGENTS.md records no values
  or file names).
- **Deployed on Vercel (13 Sep 2026); whole-site auth LIVE in prod (confirmed 14 Sep 2026 during
  audit).** The `NEXT_PUBLIC_FIREBASE_*` client vars ARE now set and `GET /api/auth/session`
  returns `configured:true` → middleware + page gates are ACTIVE on the live deploy (unauth
  `/my-media` → 307 `/?signin=1`, APIs → 401). Supersedes the earlier "Vercel gate is OFF" note;
  see §3 history entries.
- **Open audit findings (14 Sep 2026; NOT fixed — fixes deferred to next phases, do NOT fix
  without approval):** H1 page-level bypass is FIXED (`c75dbab`). Remaining — **M1** no rate
  limiting/body-size caps (session POST, metadata/TMDB, upload-url/CloudShell abuse); **M2** no
  security headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  Permissions-Policy; HSTS ships via Vercel); **M3** `/api/upload-url` returns raw upstream
  `err.message` on 500; **L1** public `/api/health` info; **L2** `X-Powered-By: Next.js`; **L3**
  `_next/image` proxy for whitelisted hosts; **L4** public webp + demo-mode content; **L5**
  predictable IDs (no IDOR — single shared family library); **L6** no `__Host-` cookie prefix;
  **I1** 8 moderate `npm audit` advisories (uuid buffer-bounds family via `@google-cloud/*`/
  `google-gax`/`gaxios`/`retry-request`/`teeny-request`; fix = `firebase-admin@14`, which
  reintroduces the `jose@6` ESM require issue → pin `^13.10.0` retained); **I2** CloudShell =
  external SSRF boundary (out of scope); **I3** production runs in demo mode (no AWS/CloudShell/
  TMDB configured); **I4** Vercel preview-deployment protection unverified (recommended).
- Runtime `console.error` is expected when AWS is configured but unreachable → falls back to demo
  (by design).
- Demo-mode playback uses a public Google sample video
  (`NEXT_PUBLIC_DEMO_VIDEO_URL`). Real streams require real `mediaUrl`s from the AWS API.
- Upload in demo mode returns "queued" fake-success ONLY if `ALLOW_DEMO_UPLOAD=true`;
  otherwise "not-configured" (keep `ALLOW_DEMO_UPLOAD=false` in production).
- TMDB episodes: season metadata returns season shells with empty `episodes` — only
  `getEpisodeMeta(tmdbId, season)` fetches real episode lists. Play page must not assume
  `season.episodes` is populated.
- Demo data has 7 titles (5 movies f/mixed/boxsets/anime/tvshows art in `public/library/*.webp`,
  2 series with episode lists). Library tile counts are mock math (`*21`, `*18`).
- Dev servers currently running on this machine: the **Dom app on port 3777** (restarted this
  session in the background) and an unrelated `test2` Next app (PIDs 12388/2816/9276/14544 —
  occupies port 3000). Do not kill/assume the `test2` server belongs to this project. Dom's PIDs
  change across restarts; verify with `Get-Process node` / port check rather than trusting old PIDs.

---

## 5. Environment & config

- Copy `.env.example` → `.env.local`. All variables optional for demo mode. Full descriptions live
  in `.env.example`.
- Firebase vars (`NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `ALLOWED_EMAILS`) are
  documented in `.env.example`. **Local Firebase client config is created (13 Sep 2026):** `.env.local`
  (gitignored) holds the 6 `NEXT_PUBLIC_FIREBASE_*` vars (fresh project `smart-upload-383bf`) and
  `FIREBASE_SERVICE_ACCOUNT_JSON` pointing (as a PATH) to the local service-account JSON in
  `C:\Users\Sagar\SmartUpload-Secrets\` (kept out of the repo). Path values are supported by
  `lib/firebase-admin.ts` since 13 Sep 2026 (inline JSON blob or filesystem path — see §4).
  **`ALLOWED_EMAILS` still unset locally.**
- **Production env var manifest (from code, 13 Sep 2026):** `NEXT_PUBLIC_APP_MODE/_APP_NAME/
  _APP_VERSION/_DEMO_VIDEO_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY/_AUTH_DOMAIN/_PROJECT_ID/
  _STORAGE_BUCKET/_MESSAGING_SENDER_ID/_APP_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
  `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` (Admin alt triple),
  `ALLOWED_EMAILS`, `AWS_LIBRARY_API_URL`/`_API_KEY`/`_API_KEY_HEADER`,
  `CLOUDSHELL_UPLOAD_URL`/`_API_KEY`/`_API_KEY_HEADER`, `ALLOW_DEMO_UPLOAD`, `TMDB_API_KEY`.
  Full descriptions in `.env.example`. Vercel env config NOT verified: project not linked to Vercel
  (no `.vercel/`) and no `vercel` CLI installed, so configured Vercel variables could not be read.
- `next.config.ts` only contains `reactStrictMode: true` and the image hosts whitelist.
- Scripts: `npm run dev` · `npm run build` · `npm run start` · `npm run lint`.
- Lint config is ESLint v9 flat config (`eslint.config.mjs`, eslint-config-next 16.3.4).

---

## 6. Tests / verification performed

- `npm run lint` — **clean** (re-confirmed after Phase 1 implementation + security fixes; no warnings).
- `npm run build` (production build) — **clean** after Phase 1 + security fixes + Phase 1.5
  verification; route table now lists `ƒ Proxy (Middleware)` (Next 16 migrated the convention).
- Homepage smoke test — **HTTP STATUS 200** (re-verified against dev server on port 3777).
- Demo library, upload form, identify pipeline, video player, favorites, browse/my-media/settings
  pages were previously exercised manually against `npm run dev`.
- Phase 1 security review (12-point checklist): full results recorded in §3 history. Two findings
  identified, both fixed; re-verified sound post-fix.
- **Phase 1.5 fail-closed runtime verification (13 Sep 2026):** production build + `next start`
  with dummy `NEXT_PUBLIC_FIREBASE_*` and NO Admin credential — `/api/library`, `/api/metadata`,
  `/api/play/[id]`, `POST /api/identify`, `POST /api/upload-url` all return **401** without a
  session cookie; `/my-media` → **307 `/?signin=1`**; `/` stays **200**; `/api/auth/session`
  returns `configured:false`. Baseline dev server (no Firebase) keeps demo mode working (200/200).
  Auth verified **fail-closed and additive**. Exact details + expected outputs in §3 history.
- No automated test framework or test files exist yet. `curl`/browser smoke tests are the current
  verification method.
- **Final pre-upload audit (13 Sep 2026):** lint clean, production build clean, no secrets found,
  `.gitignore` correct, upload set confirmed (61 files), project verified READY for first git init →
  GitHub → Vercel. Full findings recorded in §3 history.
- **H1 runtime verification (14 Sep 2026, production build `next start -p 3777`, real `.env.local`
  configuration):** no-cookie `/my-media` → **307 `/?signin=1`**; junk `__session=JUNK`
  `/my-media` and `/browse/movie` → **307 `/?signin=1`**; malformed (`not-a-jwt`), tampered-JWT,
  expired and empty cookie values → **307** on both pages; every protected-page response body was
  scanned for all 7 demo titles ("The Last Horizon", "Midnight Signal", "Paper Kingdom", "Aurora",
  "Echoes", "Neon District", "Starlight Reverie") → **zero hits** (no private metadata rendered).
  APIs without a session cookie: `/api/library` **401**, `/api/play/the-last-horizon` **401**,
  `/api/metadata` **401** (`{"error":"unauthorized","message":"Sign in to continue."}`);
  `/api/identify` via GET → 405 (POST-only route, expected). Positive E2E NOT performed — minting a
  real session cookie requires an interactive Google sign-in against the live Firebase project
  (not available locally; not fabricated). Full matrix in chat report.
- **Media-details + player overlay UX (14 Sep 2026):** `npm run lint` clean; `npm run build` clean
  (only the pre-existing `middleware`→`proxy` deprecation warning). No runtime/browser E2E of the
  new overlays performed — the app is auth-gated and a positive session cannot be minted locally;
  UI pieces verified statically (type-checked) and their CSS/JSX structure consistency checked (all
  `.details-*`/`.episode-*`/`.play-*` classes referenced by the overlays exist in `globals.css`;
  every icon name imported by the new components exists in `components/icons.tsx`).

---

## 2026-09-21 — Audio playback root-cause fix

- **Exact player-side cause found:** `components/VideoPlayer.tsx` already receives `audioTracks` and `preparedBrowserCopy` from both playback callers, but the player previously did not use either prop. The HLS stream was always preferred whenever `hlsUrl` existed, so the newly generated browser-safe AAC sidecars could never participate in playback. The old fallback also inferred "no audio" from `player.audioTracks.length === 0`, which is not a reliable test for in-band or otherwise playable audio.
- **Player strategy changed without replacing the UI library:** Vidstack remains the player because it is already the production-oriented, open-source player used by this repo. When a prepared browser MP4 exists, the player now uses that H.264/AAC copy as the primary source. HLS remains the fallback for media without a prepared browser-safe copy or when the HLS source errors. This removes HLS alternate-audio selection from the critical sound path.
- **Future-media processing hardened:** `scripts/drive_hls_worker.py` now creates and uploads a `<base>.browser.mp4` H.264/AAC copy for every processed source, in addition to its HLS tree and AAC sidecars. Re-running the worker for a problematic movie is therefore sufficient to produce the browser-safe baseline that the player prefers.
- **Research:** Vidstack documents HLS audio tracks and a production-ready Default Video Layout; its GitHub repository describes it as a robust, customizable open-source alternative to JW Player and Video.js. HLS.js has documented historical/current edge cases around alternate audio track selection, which supports keeping alternate audio out of the default playback path.
- **Verification status:** changed files were re-read after editing. The latest GitHub commit `055e5480229acaecd8dbb5d4e79d11e638ae3846` currently reports a Vercel status of `failure` caused by the connected Vercel scope's `build-rate-limit`, so a completed `npm run lint` / `npm run build` result is not available yet. Do not claim the new commit is deployed until the Vercel build succeeds.
## 7. Stopping point (START HERE next session)

> **REQUIREMENT (13 Sep 2026, owner):** the ENTIRE website must require authentication; unauthenticated
> visitors see only the Google Sign In experience; login UI stays accessible; deny-by-default;
> ALLOWED_EMAILS governs sign-in; API routes stay server-side protected.
> **STATUS: IMPLEMENTED + VERIFIED (lint/build/sandbox scenarios A–E all pass)** — see §3 history
> entry "WHOLE-SITE AUTH IMPLEMENTED". No UI/styling/AWS/CloudShell/API behavior changed.
>
> **REQUIREMENT (13 Sep 2026, owner):** the / page, when Firebase auth is configured and the visitor
> is not authenticated, must render ONLY a dedicated polished login screen. No hero, movie posters,
> Continue Watching, library rails, navigation menu, upload controls, or any other authenticated
> content may be visible before login. The login screen should show the Smart Upload brand, a clear
> welcome message, a prominent "Continue with Google" button, and loading/error states. After
> authentication the existing website renders exactly as before.
> **STATUS: IMPLEMENTED + VERIFIED (lint+build clean)** — see §3 history entry
> "FULL-SCREEN AUTH GATE". Authenticated website untouched; UI freeze respected (login gate is an
> approved addition under §9).

- **State:** Firebase whole-site authentication is IMPLEMENTED + committed + pushed (`d3d7c2c`,
  `d2f704b`) and **CONFIRMED LIVE on Vercel** (`/api/auth/session` → `configured:true`; unauth
  pages 307 / APIs 401 in prod). Full security audit delivered (verdict NEEDS ATTENTION): the one
  HIGH (H1 page-level auth bypass) is **FIXED + runtime-verified** and committed as **`c75dbab`**
  (2 files, +6 lines) — **NOT pushed yet; `main` is `ahead 1` of `origin/main`**. Remaining
  findings are moderate/low (M1–M3, L1–L6, I1–I4) and deferred until the user approves fixes.
- **Next step (immediate): push `c75dbab` to `origin/main` (commit this AGENTS.md update together
  with it if desired), then review the deferred audit findings in priority order (see list).**
- **Phase 1.5 remaining (now the only blocker to end-user sign-in): set `ALLOWED_EMAILS` locally and
  E2E-test.** (DONE 13 Sep 2026) `FIREBASE_SERVICE_ACCOUNT_JSON` path handling implemented in
  `lib/firebase-admin.ts` — the `.env.local` value is a file path, which the code now reads safely
  via Node `path.resolve` + `fs.readFileSync` (verified parse ok at runtime; inline JSON blob still
  supported). Add `ALLOWED_EMAILS` to `.env.local`, restart the dev server, then run the full E2E:
  Google popup → `POST /api/auth/session` → `__session` cookie → protected pages 200 + API 200
  with cookie / 401 without → sign-out revokes. Fail-closed behavior preserved (missing/unreadable
  file or malformed JSON → Admin unconfigured → fail-closed 401).
- **Firebase Console requirements (no credentials go in AGENTS.md/`.env.example`/source):**
  1. Firebase Authentication ENABLED on the project (use the existing GCP project
     `cinaura-507017` or a new Firebase project).
  2. Sign-in method → **Google provider ENABLED** (add `sagar2waghmare@gmail.com` as a
     test/owner where shown).
  3. Authentication → Settings → **Authorized domains** must include the app origin(s)
     (e.g. `localhost`, `127.0.0.1` for dev; 3-24-215-48.sslip.io / final domain for prod).
  4. Project Settings → **Web app** → copy `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`,
     `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` into `.env.local`.
  5. Project Settings → Service accounts → **Generate new private key** → paste the full JSON as
     one line into `FIREBASE_SERVICE_ACCOUNT_JSON` (server-side only; never in browser bundles).
  6. Set `ALLOWED_EMAILS` (comma-separated, lowercase; e.g. `sagar2waghmare@gmail.com`).
- **Do not** re-run layout smoke tests or wait on the background dev server. Homepage layout work
  is done and auth gating is verified; only the real credentials above are missing.
- **Next tasks (in order, ask before starting):**
  1. **(Recommended) Push `c75dbab`** — `main` is `ahead 1` of `origin/main` (H1 fix). Commit this
     AGENTS.md update with it if desired, then push.
  2. **Security hardening phase (audit M1–M3 first, one at a time)** — (a) rate limiting /
     body-size caps; (b) security headers (CSP tuned for Firebase/TMDB/next-image/playback, XCTO,
     XFO/`frame-ancestors`, Referrer-Policy, Permissions-Policy); (c) `/api/upload-url` error
     hygiene (stop echoing raw upstream `err.message`). Then listed lows if approved.
  3. **Phase 1.5 E2E sign-in** — set `ALLOWED_EMAILS` locally + run the full Google sign-in E2E in
     a browser. All other local config is already in place (client trio + service-account path);
     the whole-site gate is already live on Vercel.
  4. **Phase 2 — real AWS wiring** (`AWS_LIBRARY_API_URL=https://3-24-215-48.sslip.io`): strict
     no-demo-fallback `getLibrary()` + typed "library unavailable" state; keep UI frozen.
  5. Migrate `middleware.ts` → `proxy` convention (Next 16 deprecation; no behavior change —
     note: the latest build already lists `ƒ Proxy (Middleware)` in its route table).
  6. (DONE 13 Sep 2026) `git init` + first commits + push to GitHub — project is version-controlled
     (`github.com/sagar2waghmare/smart-upload`, branch `main`); keep this file in sync with the repo.

Ask the user which one to start, or continue in the order above if they say "resume project".

---

## 8. Important decisions & constraints (do not reverse)

1. **No new runtime dependencies.** Deliver everything with next/react/react-dom/typescript only.
   Any proposed new package must be justified to the user first.
   *Exception (approved by user):* `firebase` (client auth) + `firebase-admin` (server verification)
   for Phase 1 Firebase authentication.
2. **Secrets never reach the browser.** All third-party credentials stay server-side, always proxied
   through our own `/api/*` routes. `NEXT_PUBLIC_FIREBASE_*` are Firebase client config (API key,
   project ID, etc.) and are safe to expose by design.
3. **Server-render defaults; client-gate liberally.** Use `"use client"` only where interactivity
   requires it (Hero, player, forms, favorites, search, AuthProvider, AccountButton, SignInPrompt).
4. **Graceful degradation everywhere** — empty/error states are first-class (empty library, broken
   images, missing TMDB, unconfigured uploader, offline demo stream, unconfigured auth). Never crash
   on missing data.
5. **Demo mode must always work without config;** real mode is additive on top.
6. **Don't restart / redesign / undo existing work.** Extend incrementally and keep this file in sync.

---

## 9. Production guardrails (ACTIVE — do not violate)

1. **UI is FROZEN.** No UI/layout/styling/adaptive/responsive changes — especially hero, cards, rails,
   video player, Recently Added / My Media. The only approved additions are the Phase 1 auth controls
   (AccountButton dropdown, side-menu account group, `.account-*` CSS, SignInPrompt banner) and the
   full-screen login gate (`components/LoginScreen.tsx`, `.login-*` CSS) approved with the
   FULL-SCREEN AUTH GATE requirement (§7).
2. **One task at a time, with approval.** Do NOT start a phase or change without explicit user
   approval. For any proposed code change, report findings FIRST, then wait for approval.
3. **Do NOT touch until told otherwise:** AWS library wiring / `lib/library-service.ts` demo fallback,
   CloudShell uploader (`lib/cloudshell.ts`), DNS/cinaura.tv, deployment/Vercel, git/GitHub.
4. **Do NOT remove demo/mock functionality yet** — demo-mode lock-down is a later phase.
5. **Auth phase guardrail:** during the whole-site authentication phase, do NOT modify AWS library
   wiring, CloudShell uploader, Google Drive, or upload architecture. Keep the `authConfigured`
   additive gate so demo mode (no Firebase config) stays fully open. Do not print or log any
   Firebase API keys / service-account JSON / private keys — only env-var NAMES if needed.
5. **After any code change:** run `npm run lint`, run `npm run build`, re-read the changed files for a
   focused security check, and report exactly what changed and whether lint/build passed. Then STOP
   and wait for approval.
6. **Security invariants (never regress):**
   - Auth fails closed — no demo-user fallback in production or when `NEXT_PUBLIC_FIREBASE_*` is set
     but Firebase Admin is unavailable.
   - `ALLOWED_EMAILS` is enforced server-side, deny-by-default.
   - Session cookie: HttpOnly, Secure in production, SameSite=Lax, host-only, 7-day expiry.
   - Every protected `/api/*` route verifies the cookie via Firebase Admin with `checkRevoked=true`.
   - DELETE /api/auth/session revokes the Firebase session server-side before clearing the cookie.
   - No secrets/credentials in client bundles or logs (only `NEXT_PUBLIC_*` reach the browser).
   - Server Components rendering private content call `requireSession()` BEFORE fetching the
     library (never rely on middleware cookie presence) — H1 fix `c75dbab`.
7. **Auth is additive:** the app must keep working in demo mode until real Firebase env vars are set.

---
## 2026-09-21 — Responsive poster-card fix

- User reported that the movie poster cards look forcibly compact/cropped on Android while the laptop layout is acceptable.
- Root cause confirmed in `app/globals.css`: `.card-conteudo .poster` used a fixed `height: 320px`, while the mobile breakpoint changed it to `height: 240px` for a ~190px card width. This produces a squat poster box and forces `object-fit: cover` cropping.
- `components/SmartImage.tsx` now accepts an optional `objectFit` prop.
- `components/MediaCard.tsx` uses `objectFit="contain"` for posters so the full poster artwork is preserved instead of being cropped.
- `app/globals.css` now uses a responsive `aspect-ratio: 2 / 3` poster box, removes the forced mobile height, and removes the old poster padding.
- Changes are isolated on branch `fix/responsive-poster-cards`; production `main` has not been modified.
- Vercel created a preview deployment for commit `710d015f032d26abdc76e585c856b9625e494b06`; at the time of this update its state is BUILDING.
- Local lint/build could not be run because this connected GitHub workspace exposes repository operations, not a local checkout/runtime. Vercel preview build is being used for build verification.


---
## 2026-09-21 — Web playback/audio compatibility fix

- User confirmed that some Google Drive movies play video in the browser but have silent audio. Investigation confirmed the web player cannot decode every source audio codec; Chrome/Chromium does not provide broad default support for codecs such as AC-3/E-AC-3 and DTS, so a browser-safe AAC rendition is required for reliable cross-browser playback.
- app/api/play/[id]/route.ts now resolves grouped series/anime entries to a real episode Drive ID before looking for prepared browser media and AAC sidecars, and returns playbackId so the client can keep the selected episode's playback manifest aligned.
- app/play/[id]/page.tsx now uses a per-episode playback manifest and passes preparedBrowserCopy into VideoPlayer, preventing the page from accidentally using another episode's prepared/audio state.
- scripts/prepare-media.mjs had a literal escaped \\n embedded in executable source between defaultAudioIndex and selectedAudioStreams; this was corrected. Sidecar AAC generation was also changed to run for all source audio tracks even when --audio-index is used, so selecting a default embedded language no longer suppresses the other prepared languages.
- Current latest GitHub main commit for this work is cb01ef06c38c2386913d4a146adac2a0e6744afa for media preparation; the episode manifest fixes precede it in the same main history.
- Vercel CI currently reports build-rate-limit on the connected project, so GitHub/Vercel has not produced a new verified production deployment for these commits. The last READY deployment remains tied to the earlier known-good player baseline. Do not claim these changes are live until a READY deployment is observed.
- Remaining architecture gap: the repository contains an FFmpeg HLS worker, but it is not yet wired as an automatic on-demand transcoder for incompatible browser audio. Adding HLS playback in Chrome would require an HLS client such as hls.js; project policy requires explicit approval before introducing a new runtime package. Until that is approved and a transcode service is connected, browser-incompatible source audio still requires a prepared browser-safe rendition.

 
---
## 2026-09-21 — AAC sidecar fallback for HLS

- VideoPlayer can now use prepared AAC M4A sidecars even when HLS supplies the video. The sidecar is started in the same user gesture and the video element is muted first so embedded/HLS audio does not overlap it.
- drive_hls_worker.py now also creates one browser-safe AAC-LC M4A sidecar per source audio track and uploads the .browser.audio.*.m4a files beside the original. Existing /api/play discovery already recognizes this naming pattern.
- Existing HLS packages must be regenerated for a movie before the new worker-created sidecars exist. Test one problematic movie first.
- Build verification remains dependent on Vercel because the connected workspace does not provide a local checkout with dependencies.

## 2026-09-21 — HLS audio selection compatibility fix

- The HLS worker now emits explicit browser-friendly H.264 profile/level settings and a CODECS="avc1.64002A,mp4a.40.2" attribute on video variants when AAC audio tracks are present. This makes the video/audio capability explicit in the HLS master playlist instead of leaving codec discovery to the client.
- components/VideoPlayer.tsx now explicitly selects the manifest-declared default HLS audio track on AUDIO_TRACKS_UPDATED/manifest setup and forces the HLS video element unmuted. This targets manifests using video-only variants plus EXT-X-MEDIA AAC audio.
- Existing SMART-HLS packages must be regenerated with scripts/drive_hls_worker.py for this worker change to affect already-processed movies.
- Build verification remains dependent on Vercel because the connected workspace does not provide a local checkout with dependencies.

## 2026-09-21 — HLS-capable player rebuild

- User explicitly requested replacing the previous player because some Google Drive movies show video with silent audio in Chrome.
- Web research confirmed that HLS.js is a current maintained browser HLS/MSE client (1.7.3) and supports HLS audio track handling; browser playback still depends on codecs the browser can decode, so HLS output must contain browser-safe audio such as AAC. MDN documents H.264 + AAC in MP4 as broadly compatible across major browsers.
- The Smart Upload player was rebuilt to prefer a prepared HLS manifest when available, use HLS.js with MSE, recover from fatal network/media errors, expose HLS audio-track selection and adaptive quality controls, and fall back to the original direct source.
- Added app/api/hls/[id]/[...path]/route.ts to serve prepared HLS playlists and rewrite media URIs. Prepared video/audio segments can be redirected to the existing signed Cloudflare playback worker or protected /api/stream route.
- app/api/play/[id]/route.ts now exposes hlsUrl when a SMART-HLS/<source-id>/master.m3u8 package exists. app/play/[id]/page.tsx and components/PlaybackOverlay.tsx pass that manifest into VideoPlayer.
- scripts/drive_hls_worker.py now creates video-only HLS renditions and separate browser-safe AAC HLS audio renditions for every source audio track, then advertises them in the HLS master playlist.
- hls.js 1.7.3 was added to package.json/package-lock.json. This is the intentional runtime-dependency exception for the player rebuild.
- Deployment verification: the connected Vercel GitHub status currently reports "Deployment rate limited — retry in 24 hours", so the rebuilt player has NOT been verified live on Vercel yet. Do not claim the current production/site URL contains this rebuild until a READY deployment for a current commit is observed.
- Important remaining gap: the HLS worker is currently a prepared-media processor, not an on-demand transcoding API. A source movie with no browser-safe copy and no SMART-HLS package still cannot be transformed inside Chrome alone. The upload/processing service contract must be connected before every incompatible movie can be automatically prepared.
