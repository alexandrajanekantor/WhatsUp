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
- `POST /api/search` (`src/app/api/search/route.ts`): geocodes (Nominatim), then ALWAYS runs Ticketmaster and the Claude web-search source concurrently (`Promise.allSettled`), streaming NDJSON (`geo`, `source`, `source_error`, `done`). One failing source must not block the other.
- `src/lib/sources/ticketmaster.ts` (pages up to 5x100 results), `src/lib/sources/claude.ts` (`claude-sonnet-5-5` + `web_search_20260209`, resumes on `pause_turn`).
- `src/lib/merge.ts`: HEAD-validates AI links, dedupes (title + date), ranks by vibe match. AI events are labeled `source: "ai"`; `listingPage: true` marks AI results whose link is a roundup/calendar rather than the event's own page (the model labels most of them this way; resolving specific pages would need a second web_fetch pass).
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
- Secrets live in `.env` (gitignored; there is no `.env.example`). Vars: TICKETMASTER_API_KEY, ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_PW. Never print their values.
- Direct DB host `db.<ref>.supabase.co` is IPv6-only and unreachable here; `scripts/db.mjs` uses the session pooler (project is in us-east-1) with user `postgres.<ref>`.

## Status
Done: scaffold, search pipeline, search UI, real searches verified (Ticketmaster + Claude). Schema applied to the Supabase project and seeded (3 `seed:*` fixture events in `events`; profiles/searches/favorites empty). After DDL changes run `notify pgrst, 'reload schema'` so the REST API sees new tables. Auth pages + profile trigger built (signup/login not yet exercised with a real account). Home/favorites/history built (logged-in flows untested by Claude: needs a real account). TODO: event detail + calendar export, polish, RLS.

## Hooks
`.claude/settings.json`: after a real `git commit` (the script re-checks the command, since the settings `if` filter over-matched), and on Stop when 3+ src/config files are newer than this file, Claude is asked to review and update CLAUDE.md.
