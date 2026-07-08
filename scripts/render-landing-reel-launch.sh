#!/bin/bash
# Detached launcher for the LandingAdReel composition (new v10 visuals + v8 music,
# footer logo removed). Run via an AppleScript `do shell script` so it returns
# immediately; poll /tmp/procabinet-reel-render.log for progress.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
nohup npx remotion render demo-video/index.ts LandingAdReel marketing/videos/landing-ad-reel.mp4 \
  --public-dir=demo-video/public \
  > /tmp/procabinet-reel-render.log 2>&1 < /dev/null &
echo "render started (pid $!)"
