#!/bin/bash
# Record the order-auto-schedule ad clip, then encode it.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
LOG=/tmp/ad-clips.log
echo "== order-auto-schedule $(date) ==" >> "$LOG"
if ! curl -s -o /dev/null --max-time 2 http://localhost:3000; then
  nohup npm run dev >> /tmp/ad-vite.log 2>&1 &
  for i in $(seq 1 30); do sleep 1; curl -s -o /dev/null --max-time 2 http://localhost:3000 && break; done
fi
node scripts/record-wiki-clips.mjs order-auto-schedule >> "$LOG" 2>&1 || { echo "RECORD FAILED" >> "$LOG"; exit 1; }
node scripts/postprocess-wiki-clips.mjs order-auto-schedule >> "$LOG" 2>&1 || { echo "ENCODE FAILED" >> "$LOG"; exit 1; }
echo "ALL DONE" >> "$LOG"
