#!/bin/bash
# Detached launcher for the LandingAdPortraitCreators composition (content-
# creator cut with the affiliate-program overlay banner). Run via an
# AppleScript `do shell script` so it returns immediately; poll
# /tmp/procabinet-landing-ad-portrait-creators-render.log for progress.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
nohup npx remotion render demo-video/index.ts LandingAdPortraitCreators out/instagram/landing-ad-portrait-creators.mp4 \
  --public-dir=demo-video/public \
  > /tmp/procabinet-landing-ad-portrait-creators-render.log 2>&1 < /dev/null &
echo "render started (pid $!)"
