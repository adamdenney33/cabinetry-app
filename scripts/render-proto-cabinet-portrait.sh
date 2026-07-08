#!/bin/bash
# Detached launcher for the Proto-CabinetPortrait composition (portrait-reel
# prototype — Cabinet Builder chapter only). Run via an AppleScript
# `do shell script` so it returns immediately; poll
# /tmp/procabinet-proto-portrait-render.log for progress.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
nohup npx remotion render demo-video/index.ts Proto-CabinetPortrait out/instagram/proto-cabinet-portrait.mp4 \
  --public-dir=demo-video/public \
  > /tmp/procabinet-proto-portrait-render.log 2>&1 < /dev/null &
echo "render started (pid $!)"
