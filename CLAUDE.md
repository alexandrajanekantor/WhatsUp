# WhatsUp

Site to plan fun into your life: pick a place + dates + vibes (family friendly, outdoorsy, witchy, ...), get an exhaustive list of activities with links to source pages. Accounts save preferences, searches, favorites. Planned: event detail page with "Add to calendar" (.ics + Google Calendar link).

Repo: https://github.com/alexandrajanekantor/WhatsUp.git (remote `origin`; not pushed yet)

## Stack
Next.js 16 (App Router, `src/`), TypeScript, Tailwind 4, Supabase (Postgres + Auth), Anthropic SDK, zod.
Next 16 differs from older versions (e.g. `middleware` is now `src/proxy.ts`); read `node_modules/next/dist/docs/` before using unfamiliar APIs (see AGENTS.md).

## Commands
- `npm run dev` (preview config in `.claude/launch.json`), `npm run lint`, `npx tsc --noEmit`
- `node scripts/migrate.mjs` applies `supabase/migrations/*.sql` (needs a working `SUPABASE_DB_PW`); `node scripts/seed.mjs` seeds fixture events via REST and verifies all tables exist

## Architecture
- **Own crawler (cheap path, default):** `src/lib/crawl/`. Per city (`crawl_cities`, keyed `name-state`, e.g. `portland-oregon`), `sources` rows are calendar pages that were *probed* and found to yield events (`status`: candidate/active/failing/rejected). `scanSource` (scan.ts) tries, in order: schema.org JSON-LD, ICS links, WordPress "Events Calendar" (tribe) API, Localist API, JSON-LD on linked detail pages, then a Haiku fallback (`llm-extract.ts`, ~$0.002/page) that reads page text. `fetcher.ts` is polite (UA, robots.txt with wildcards/longest-match, 1 req/s/host, never evades 403s). `discover.ts` asks Haiku + web search ONCE per city for candidate calendar pages, then probes them; `seeds.ts` has hand-picked fallbacks (Portland). `tagger.ts` tags vibes (keywords, then Haiku batches). Run: `npx tsx scripts/crawl.mts "Portland, OR" [--seed] [--discover] [--no-crawl]`. If the Haiku step is unavailable (no credits) sources are NOT rejected for returning 0 events. Stored events are served by `src/lib/sources/stored.ts` (events within radius of crawled cities). Event `source` is `web` for these. Not yet scheduled (needs a cron) and no on-demand crawl for new cities.
- Search runs Ticketmaster + stored events always; the live Claude web search (`claude.ts`) only when `deep: true` (the "Dig deeper" button; rate limited 3/10min) because it is expensive (~$0.4-0.6 per call).
- `POST /api/search` (`src/app/api/search/route.ts`): geocodes (Nominatim), then runs Ticketmaster + stored crawl events (and live Claude search only if `deep`) concurrently via `runSources` (`Promise.allSettled`), streaming NDJSON (`geo`, `source`, `source_error`, `done`). One failing source must not block the others.
- `src/lib/sources/claude.ts` runs 2-3 concurrent web-search "angles" (niche vs broad community listings; vibes split when 3+), each capped at 150s, retried once if the reply isn't a clean JSON array; a failed angle is dropped, the source only errors if all fail. Source failures are logged server-side as `[search] <source> failed:` — check there first (e.g. an exhausted Anthropic credit balance shows up only as a generic "didn't respond" notice in the UI).
- `src/lib/sources/ticketmaster.ts` (pages up to 5x100 results), `src/lib/sources/claude.ts` (`claude-sonnet-5-5` + `web_search_20260209`, resumes on `pause_turn`).
- `src/lib/merge.ts`: HEAD-validates AI links, dedupes (title + date), ranks by vibe match. AI events are labeled `source: "ai"`; `listingPage: true` marks AI results whose link is a roundup/calendar rather than the event's own page (the model labels most of them this way; resolving specific pages would need a second web_fetch pass).
- Results UI: `ResultsList` groups results into vibe matches + a collapsed "other events nearby" list (ranking in `src/lib/rank.ts`, shared by server merge and client), with loading skeletons; `SourceNotices` shows per-source progress/failures. Rate limits (`src/lib/rate-limit.ts`, in-memory, per user/IP; swap for a shared store before multi-instance deploy): search 8/10min, Home rebuilds 6/hour. Search input is validated in `searchInputSchema` (end >= start, <= 60 days, not in the past). `app/error.tsx` and `app/not-found.tsx` exist.
- `src/lib/vibes.ts` is the vibe list; `src/lib/vibe-tagger.ts` tags API events by keyword.
- `src/lib/supabase/{client,server}.ts`, `src/proxy.ts` refresh the auth session.
- Auth: Supabase email+password. Login is client-side (`AuthForm` -> `signInWithPassword`); signup goes through `POST /api/auth/signup`, which creates the user already-confirmed with the service-role admin client (email confirmation intentionally skipped for now; revisit before launch), then signs in. `POST /api/auth/signout`. `Header` (server component, wrapped in `<Suspense>` in the layout) shows login state. Migration 0002 adds a trigger that creates a `profiles` row for each new auth user.
- Account features (all APIs auth via `getUser()` in `src/lib/auth.ts` and scope every query by `user.id`, using the admin client; RLS is deferred, so the anon key can currently read all tables):
  - **Home** (`/home`, `HomeView`): user sets city (geocoded, stored as `profiles.home_location/home_lat/home_lng`), default vibes and radius via `PATCH /api/profile`. `GET /api/home` streams the next-7-days feed through the same `runSources` pipeline as search and caches it in `home_feed` (12h TTL, keyed on city/radius/vibes/date; `?refresh=1` forces a rebuild). Login/signup land here.
  - **Favorites**: `FavoritesProvider` (in the root layout) holds favorited ids; heart on `EventCard`; `POST/DELETE /api/favorites` caches the event into `events` then writes `favorites`; `/favorites` lists them.
  - **History**: `POST /api/search` records logged-in searches in `searches`; `/history` lists them; "Run again" links to `/?location=...&run=1` which `SearchApp` prefills and auto-runs.
  - Shared search pipeline: `src/lib/search.ts` (`runSources`); client NDJSON reader: `src/lib/ndjson.ts`.
- Next 16 prerender rules: anything reading `cookies()` or `new Date()` must sit inside `<Suspense>` (layout wraps `Header`; `page.tsx` wraps `SearchApp`), or dev shows an error badge.
- Schema: `supabase/migrations/*.sql` (tracked in `public.schema_migrations`; apply with `node scripts/migrate.mjs`), (profiles, searches, events cache, favorites).

## Decisions
- RLS deliberately deferred; user-owned queries must be scoped by authenticated user id server-side until RLS is added.
- Secrets live in `.env` (gitignored; there is no `.env.example`). Vars: DISABLE_AI (=1 turns off EVERY Claude call: live "dig deeper" search + button, crawler page reading, tagging, discovery; app then runs on Ticketmaster + crawled calendars; see `src/lib/ai-config.ts`), TICKETMASTER_API_KEY, ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_PW. Never print their values. When appending to `.env` make sure the file ends in a newline first (a missing one once glued a var onto the previous line).
- **Default test city is Manhattan, New York** (search form prefilled in dev via `DEFAULT_TEST_CITY` in `SearchApp`; seeds in `crawl/seeds.ts` key `manhattan-new-york`; Portland seeds kept too). With AI off, Manhattan's own crawl only yields a few events (most local sites lack structured data and need the Haiku reader); Ticketmaster supplies the bulk.
- Direct DB host `db.<ref>.supabase.co` is IPv6-only and unreachable here; `scripts/db.mjs` uses the session pooler (project is in us-east-1) with user `postgres.<ref>`.

## Status
Done: scaffold, search pipeline, search UI, real searches verified (Ticketmaster + Claude). Schema applied to the Supabase project and seeded (3 `seed:*` fixture events in `events`; profiles/searches/favorites empty). After DDL changes run `notify pgrst, 'reload schema'` so the REST API sees new tables. Auth pages + profile trigger built (signup/login not yet exercised with a real account). Home/favorites/history built (logged-in flows untested by Claude: needs a real account). Polish pass done (reliability, grouping, notices, rate limiting, validation, error pages). Deferred by user for now: event detail page + calendar export, RLS. TODO: event detail + calendar export, polish, RLS.

## Hooks
`.claude/settings.json`: after a real `git commit` (the script re-checks the command, since the settings `if` filter over-matched), and on Stop when 3+ src/config files are newer than this file, Claude is asked to review and update CLAUDE.md.
