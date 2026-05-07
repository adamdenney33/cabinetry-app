#!/bin/bash
# SessionEnd hook: auto-append new git commits to SESSIONS.md.
#
# Behaviour:
# - If SESSIONS.md has no "<!-- last_commit: HASH -->" marker, bootstrap by
#   appending the current HEAD as the marker. No commits logged on first run.
# - If a marker exists, list commits between marker and HEAD. If any, append
#   a new "## [Auto] Session ending YYYY-MM-DD" section and update the marker.
# - Idempotent: re-running with no new commits is a no-op.

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

SESSIONS_FILE="SESSIONS.md"
[ -f "$SESSIONS_FILE" ] || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

CURRENT_HASH=$(git rev-parse --short HEAD 2>/dev/null) || exit 0

# Find the most recent <!-- last_commit: HASH --> marker
LAST_HASH=$(grep -oE '<!-- last_commit: [a-f0-9]{7,} -->' "$SESSIONS_FILE" 2>/dev/null \
            | tail -1 \
            | grep -oE '[a-f0-9]{7,}')

# Bootstrap on first run: set marker to current HEAD, no append
if [ -z "$LAST_HASH" ]; then
  {
    echo ""
    echo "<!-- last_commit: $CURRENT_HASH -->"
  } >> "$SESSIONS_FILE"
  exit 0
fi

# Verify the recorded hash still exists (rebases can orphan it)
git cat-file -e "$LAST_HASH" 2>/dev/null || exit 0

# Skip if nothing new since last marker
[ "$LAST_HASH" = "$CURRENT_HASH" ] && exit 0

COMMITS=$(git log "${LAST_HASH}..HEAD" --pretty=format:"- %s" --reverse 2>/dev/null)
[ -z "$COMMITS" ] && exit 0

DATE=$(date +"%Y-%m-%d")

# Remove the old marker line so we don't accumulate stale markers
# (keep only the newest)
TMP=$(mktemp)
grep -v "^<!-- last_commit: " "$SESSIONS_FILE" > "$TMP" && mv "$TMP" "$SESSIONS_FILE"

# Append the new auto-section + updated marker
{
  echo ""
  echo "---"
  echo ""
  echo "## [Auto] Session ending $DATE"
  echo ""
  echo "### Commits"
  echo "$COMMITS"
  echo ""
  echo "_Auto-logged by SessionEnd hook. Flesh out with context next session if useful._"
  echo ""
  echo "<!-- last_commit: $CURRENT_HASH -->"
} >> "$SESSIONS_FILE"

exit 0
