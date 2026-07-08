#!/bin/bash
# Detached launcher for the LandingAdPortrait composition (native 9:16
# reframe, full chapters + intro/outro). Run via an AppleScript
# `do shell script` so it returns immediately; poll
# /tmp/procabinet-landing-ad-portrait-render.log for progress.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
nohup npx remotion render demo-video/index.ts LandingAdPortrait out/instagram/landing-ad-portrait.mp4 \
  --public-dir=demo-video/public \
  > /tmp/procabinet-landing-ad-portrait-render.log 2>&1 < /dev/null &
echo "render started (pid $!)"
