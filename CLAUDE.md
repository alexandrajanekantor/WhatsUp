# WhatsUp

Site to plan fun into your life: pick a place + dates + vibes (family friendly, outdoorsy, witchy, ...), get an exhaustive list of activities with links to source pages. Accounts save preferences, searches, favorites. Planned: event detail page with "Add to calendar" (.ics + Google Calendar link).

Repo: https://github.com/alexandrajanekantor/WhatsUp.git (remote `origin`; not pushed yet)

## Stack
Next.js 16 (App Router, `src/`), TypeScript, Tailwind 4, Supabase (Postgres + Auth), Anthropic SDK, zod.
Next 16 differs from older versions (e.g. `middleware` is now `src/proxy.ts`); read `node_modules/next/dist/docs/` before using unfamiliar APIs (see AGENTS.md).

## Commands
- `npm run dev` (preview config in `.claude/launch.json`), `npm run lint`, `npx tsc --noEmit`

## Architecture
- `POST /api/search` (`src/app/api/search/route.ts`): geocodes (Nominatim), then ALWAYS runs Ticketmaster and the Claude web-search source concurrently (`Promise.allSettled`), streaming NDJSON (`geo`, `source`, `source_error`, `done`). One failing source must not block the other.
- `src/lib/sources/ticketmaster.ts`, `src/lib/sources/claude.ts` (`claude-sonnet-5-5` + `web_search_20260209`, resumes on `pause_turn`).
- `src/lib/merge.ts`: HEAD-validates AI links, dedupes (title + date), ranks by vibe match. AI events are labeled `source: "ai"`.
- `src/lib/vibes.ts` is the vibe list; `src/lib/vibe-tagger.ts` tags API events by keyword.
- `src/lib/supabase/{client,server}.ts`, `src/proxy.ts` refresh the auth session.
- Schema: `supabase/migrations/0001_init.sql` (profiles, searches, events cache, favorites).

## Decisions
- RLS deliberately deferred; user-owned queries must be scoped by authenticated user id server-side until RLS is added.
- Never commit `.env.local`; keys listed in `.env.example`.

## Status
Done: scaffold, search pipeline, search UI. TODO: auth pages, preferences/history/favorites, event detail + calendar export, polish, RLS.
Blocked on user supplying: TICKETMASTER_API_KEY, ANTHROPIC_API_KEY, Supabase URL/anon/service keys.

## Hooks
`.claude/settings.json`: after `git commit`, and on Stop when 3+ src/config files are newer than this file, Claude is asked to review and update CLAUDE.md.
