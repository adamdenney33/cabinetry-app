#!/bin/bash
# Detached launcher for the reel batch render (used so an AppleScript
# `do shell script` can kick it off and return immediately).
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
nohup node scripts/render-reels-batch.mjs reel-v2 livelink-reel speed-reel founder-reel \
  > /tmp/procabinet-render.log 2>&1 < /dev/null &
echo "render started (pid $!)"
