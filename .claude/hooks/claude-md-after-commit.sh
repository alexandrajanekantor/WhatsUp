#!/bin/bash
# PostToolUse (Bash): after a real `git commit`, ask Claude to review CLAUDE.md against the commit.
# The settings.json `if` filter was matching unrelated commands, so re-check the command here.
cmd=$(jq -r '.tool_input.command // ""')
echo "$cmd" | grep -Eq '(^|[;&|(] *)git( +-[^ ]+( [^ -][^ ]*)?)* +commit( |$)' || exit 0
jq -n '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:"A git commit just happened. Review CLAUDE.md against the committed changes (git show --stat HEAD) and update it if anything it documents (stack, commands, architecture, conventions, env vars, gotchas) is now stale or missing. If nothing needs changing, say so in one line."}}'
