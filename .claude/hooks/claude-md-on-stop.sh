#!/bin/bash
# Stop: if source/config files were changed more recently than CLAUDE.md, have Claude review it once.
input=$(cat)
[ "$(echo "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f CLAUDE.md ] || exit 0
changed=$(find src supabase package.json next.config.ts .env.example -type f -newer CLAUDE.md 2>/dev/null | head -20)
[ -z "$changed" ] && exit 0
n=$(echo "$changed" | wc -l | tr -d ' ')
[ "$n" -lt 3 ] && exit 0   # only substantive changes (3+ files)
jq -n --arg files "$changed" '{decision:"block",reason:("Files changed since CLAUDE.md was last updated:\n" + $files + "\nReview CLAUDE.md and update it if it is now stale or missing something (stack, commands, architecture, conventions, env vars, gotchas). If nothing needs changing, just say so in one line.")}'
