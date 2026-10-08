#!/bin/bash
# PostToolUse (Bash, git commit): ask Claude to review CLAUDE.md against what was just committed.
jq -n '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:"A git commit just happened. Review CLAUDE.md against the committed changes (git show --stat HEAD) and update it if anything it documents (stack, commands, architecture, conventions, env vars, gotchas) is now stale or missing. If nothing needs changing, say so in one line."}}'
