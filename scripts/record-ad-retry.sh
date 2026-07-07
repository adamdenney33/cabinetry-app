#!/bin/bash
# Record the v5 ad clips (schedule-priority read-only first, then
# live-link-tour which writes share settings), then encode them.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
LOG=/tmp/ad-clips.log
echo "== v10 clips $(date) ==" >> "$LOG"
if ! curl -s -o /dev/null --max-time 2 http://localhost:3000; then
  nohup npm run dev >> /tmp/ad-vite.log 2>&1 &
  for i in $(seq 1 30); do sleep 1; curl -s -o /dev/null --max-time 2 http://localhost:3000 && break; done
fi
node scripts/record-wiki-clips.mjs cabinet-tour >> "$LOG" 2>&1 || { echo "RECORD FAILED" >> "$LOG"; exit 1; }
node scripts/postprocess-wiki-clips.mjs cabinet-tour >> "$LOG" 2>&1 || { echo "ENCODE FAILED" >> "$LOG"; exit 1; }
echo "ALL DONE" >> "$LOG"
